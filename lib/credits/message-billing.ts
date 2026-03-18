import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { aiUsageEvents } from "@/lib/db/schema";
import { getSubscriptionByAccountId } from "@/lib/billing/accounts";
import { debitCredits, refundCreditsForUsageEvent } from "./debit";
import { getCreditsCostForAction } from "./pricing";

type MessageBillingSessionOptions = {
  accountId: number;
  userId: number;
  idempotencyKey: string;
  projectId?: number | null;
  provider?: string;
  model?: string;
};

export function createMessageBillingSession(
  options: MessageBillingSessionOptions
) {
  let eventId: number | null = null;
  let chargedCost = 0;
  let chargedActionType = "chat_message";
  let settled = false;
  let queue = Promise.resolve();

  async function ensureEvent(actionType: string) {
    if (eventId != null) return eventId;

    const [event] = await db
      .insert(aiUsageEvents)
      .values({
        accountId: options.accountId,
        userId: options.userId,
        projectId: options.projectId ?? null,
        actionType,
        status: "pending",
        creditsCharged: 0,
        creditsRefunded: 0,
        idempotencyKey: options.idempotencyKey,
        provider: options.provider ?? null,
        model: options.model ?? null,
      })
      .returning({ id: aiUsageEvents.id });

    if (!event) {
      throw new Error("Failed to create message billing event");
    }

    eventId = event.id;
    return event.id;
  }

  async function ensureChargedForAction(actionType: string) {
    if (settled) return;

    const subscription = await getSubscriptionByAccountId(options.accountId);
    const desiredCost = await getCreditsCostForAction(
      actionType,
      subscription?.planId ?? null
    );

    if (desiredCost <= chargedCost) return;

    const delta = desiredCost - chargedCost;
    const usageEventId = await ensureEvent(actionType);

    await debitCredits(
      options.accountId,
      delta,
      `${options.idempotencyKey}:up-to:${desiredCost}`,
      {
        usageEventId,
        metadata: {
          messageBilling: true,
          targetActionType: actionType,
        },
      }
    );

    chargedCost = desiredCost;
    chargedActionType = actionType;

    await db
      .update(aiUsageEvents)
      .set({
        actionType: chargedActionType,
        creditsCharged: chargedCost,
      })
      .where(eq(aiUsageEvents.id, usageEventId));
  }

  return {
    ensureChargedForAction(actionType: string) {
      queue = queue.then(() => ensureChargedForAction(actionType));
      return queue;
    },
    async markSucceeded() {
      await queue;
      if (settled || eventId == null) return;
      settled = true;

      await db
        .update(aiUsageEvents)
        .set({
          status: "succeeded",
          actionType: chargedActionType,
          creditsCharged: chargedCost,
          completedAt: new Date(),
        })
        .where(eq(aiUsageEvents.id, eventId));
    },
    async markFailed(errorCode: string) {
      await queue;  
      if (settled || eventId == null) return;
      settled = true;

      await db
        .update(aiUsageEvents)
        .set({
          status: "failed",
          actionType: chargedActionType,
          creditsCharged: chargedCost,
          errorCode: errorCode.slice(0, 50),
          completedAt: new Date(),
        })
        .where(eq(aiUsageEvents.id, eventId));

      const refunded = await refundCreditsForUsageEvent(options.accountId, eventId);
      if (refunded) {
        await db
          .update(aiUsageEvents)
          .set({ creditsRefunded: refunded.refunded })
          .where(eq(aiUsageEvents.id, eventId));
      }
    },
  };
}
