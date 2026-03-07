import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { aiUsageEvents } from "@/lib/db/schema";
import { getSubscriptionByAccountId } from "@/lib/billing/accounts";
import { getCreditsCostForAction } from "./pricing";
import { debitCredits, refundCreditsForUsageEvent, InsufficientCreditsError } from "./debit";

export type RunWithCreditsOptions = {
  accountId: number;
  userId: number;
  actionType: string;
  projectId?: number | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  provider?: string;
  model?: string;
};

export type UsageInfo = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  providerCostMinor?: number;
};

/**
 * Run an async function after debiting credits for the action.
 * Creates ai_usage_events (pending), debits, runs fn; on success updates event (succeeded + usage);
 * on failure updates event (failed) and refunds.
 * @throws InsufficientCreditsError if the account has insufficient credits
 */
export async function runWithCredits<T>(
  options: RunWithCreditsOptions,
  fn: () => Promise<T>
): Promise<T> {
  const {
    accountId,
    userId,
    actionType,
    projectId,
    idempotencyKey,
    metadata,
    provider,
    model,
  } = options;

  const subscription = await getSubscriptionByAccountId(accountId);
  const planId = subscription?.planId ?? null;
  const creditsCost = await getCreditsCostForAction(actionType, planId);

  const [event] = await db
    .insert(aiUsageEvents)
    .values({
      accountId,
      userId,
      projectId: projectId ?? null,
      actionType,
      status: "pending",
      creditsCharged: 0,
      creditsRefunded: 0,
      idempotencyKey: idempotencyKey || null,
      provider: provider ?? null,
      model: model ?? null,
    })
    .returning({ id: aiUsageEvents.id });

  if (!event) {
    throw new Error("Failed to create AI usage event");
  }

  try {
    await debitCredits(accountId, creditsCost, idempotencyKey, {
      usageEventId: event.id,
      metadata,
    });
  } catch (err) {
    await db
      .update(aiUsageEvents)
      .set({
        status: "failed",
        errorCode:
          err instanceof InsufficientCreditsError ? "INSUFFICIENT_CREDITS" : "DEBIT_FAILED",
        completedAt: new Date(),
      })
      .where(eq(aiUsageEvents.id, event.id));
    throw err;
  }

  try {
    const result = await fn();
    const usage = (result as { usage?: UsageInfo })?.usage;

    await db
      .update(aiUsageEvents)
      .set({
        status: "succeeded",
        creditsCharged: creditsCost,
        promptTokens: usage?.promptTokens ?? null,
        completionTokens: usage?.completionTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        providerCostMinor: usage?.providerCostMinor ?? null,
        completedAt: new Date(),
      })
      .where(eq(aiUsageEvents.id, event.id));

    return result;
  } catch (err) {
    await db
      .update(aiUsageEvents)
      .set({
        status: "failed",
        creditsCharged: creditsCost,
        errorCode: err instanceof Error ? err.message.slice(0, 50) : "UNKNOWN",
        completedAt: new Date(),
      })
      .where(eq(aiUsageEvents.id, event.id));

    await refundCreditsForUsageEvent(accountId, event.id);

    await db
      .update(aiUsageEvents)
      .set({ creditsRefunded: creditsCost })
      .where(eq(aiUsageEvents.id, event.id));

    throw err;
  }
}
