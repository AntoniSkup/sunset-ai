import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { aiUsageEvents } from "@/lib/db/schema";
import { getSubscriptionByAccountId } from "@/lib/billing/accounts";
import { debitCredits } from "@/lib/credits/debit";
import { getCreditsCostForAction } from "@/lib/credits/pricing";

/** SKUs that participate in end-of-turn “max tier wins” billing for chat. */
export const CHAT_TURN_BILLABLE_ACTION_TYPES = [
  "chat_message",
  "rewrite_copy",
  "regenerate_section",
  "generate_page",
] as const;

export type ChatTurnBillableActionType =
  (typeof CHAT_TURN_BILLABLE_ACTION_TYPES)[number];

function isChatTurnBillableActionType(
  value: string
): value is ChatTurnBillableActionType {
  return (CHAT_TURN_BILLABLE_ACTION_TYPES as readonly string[]).includes(value);
}

/**
 * Map a successfully written codegen destination to the turn SKU.
 * New or modified sections → regenerate_section (1). Pages and layout shell → generate_page (2).
 */
export function billingActionTypeFromSuccessfulCodegenDestination(
  destination: string | undefined | null
): "generate_page" | "regenerate_section" | null {
  if (!destination || typeof destination !== "string") return null;
  const d = destination.trim().toLowerCase();
  if (d.startsWith("landing/sections/")) return "regenerate_section";
  if (d.startsWith("landing/pages/")) return "generate_page";
  if (d === "landing/index.tsx" || d === "landing/index.html")
    return "generate_page";
  if (d.startsWith("landing/")) return "generate_page";
  return null;
}

/**
 * One debit per successful chat turn: charge the highest-priced SKU among
 * observed billable actions; if none, charge chat_message.
 */
export async function pickChargedActionForChatTurn(
  observedTiers: ReadonlySet<string>,
  planId: number | null
): Promise<{ actionType: string; creditsCost: number }> {
  const tiers = [...observedTiers].filter(isChatTurnBillableActionType);
  if (tiers.length === 0) {
    const creditsCost = await getCreditsCostForAction("chat_message", planId);
    return { actionType: "chat_message", creditsCost };
  }
  let bestType: ChatTurnBillableActionType = tiers[0]!;
  let bestCost = await getCreditsCostForAction(bestType, planId);
  for (let i = 1; i < tiers.length; i++) {
    const t = tiers[i]!;
    const c = await getCreditsCostForAction(t, planId);
    if (c > bestCost) {
      bestCost = c;
      bestType = t;
    }
  }
  return { actionType: bestType, creditsCost: bestCost };
}

/**
 * Debit once after a successful stream (assistant message persisted).
 * Idempotent per `idempotencyKey` via ledger idempotency.
 */
export async function finalizeSuccessfulChatTurnBilling(options: {
  accountId: number;
  userId: number;
  observedTiers: ReadonlySet<string>;
  idempotencyKey: string;
}): Promise<void> {
  const subscription = await getSubscriptionByAccountId(options.accountId);
  const planId = subscription?.planId ?? null;
  const { actionType, creditsCost } = await pickChargedActionForChatTurn(
    options.observedTiers,
    planId
  );

  if (creditsCost <= 0) return;

  const [event] = await db
    .insert(aiUsageEvents)
    .values({
      accountId: options.accountId,
      userId: options.userId,
      projectId: null,
      actionType,
      status: "pending",
      creditsCharged: 0,
      creditsRefunded: 0,
      idempotencyKey: options.idempotencyKey,
    })
    .returning({ id: aiUsageEvents.id });

  if (!event) {
    throw new Error("Failed to create chat turn usage event");
  }

  await debitCredits(options.accountId, creditsCost, `${options.idempotencyKey}:debit`, {
    usageEventId: event.id,
    metadata: {
      chatTurnBilling: true,
      observedTiers: [...options.observedTiers],
    },
  });

  await db
    .update(aiUsageEvents)
    .set({
      status: "succeeded",
      creditsCharged: creditsCost,
      completedAt: new Date(),
    })
    .where(eq(aiUsageEvents.id, event.id));
}
