import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { creditActionPricing } from "@/lib/db/schema";

const DEFAULT_CREDITS_COST = 10;

/** Fallback when no DB row exists (e.g. chat_message not seeded yet). */
const ACTION_FALLBACK: Record<string, number> = {
  chat_message: 0.5,
};

/**
 * Get the credit cost for an action type from credit_action_pricing.
 * Uses the active row effective now (effective_from <= now, effective_to null or > now).
 * planId optional; if not provided, uses plan-agnostic pricing (plan_id is null).
 */
export async function getCreditsCostForAction(
  actionType: string,
  planId?: number | null
): Promise<number> {
  const now = new Date();
  const rows = await db
    .select({ creditsCost: creditActionPricing.creditsCost })
    .from(creditActionPricing)
    .where(
      and(
        eq(creditActionPricing.actionType, actionType),
        eq(creditActionPricing.isActive, true),
        lte(creditActionPricing.effectiveFrom, now),
        or(
          isNull(creditActionPricing.effectiveTo),
          gt(creditActionPricing.effectiveTo, now)
        ),
        planId != null
          ? eq(creditActionPricing.planId, planId)
          : isNull(creditActionPricing.planId)
      )
    )
    .orderBy(desc(creditActionPricing.effectiveFrom))
    .limit(1);

  if (rows[0]) return Number(rows[0].creditsCost);

  if (planId != null) {
    const fallback = await db
      .select({ creditsCost: creditActionPricing.creditsCost })
      .from(creditActionPricing)
      .where(
        and(
          eq(creditActionPricing.actionType, actionType),
          eq(creditActionPricing.isActive, true),
          isNull(creditActionPricing.planId)
        )
      )
      .orderBy(desc(creditActionPricing.effectiveFrom))
      .limit(1);
    if (fallback[0]) return Number(fallback[0].creditsCost);
  }

  return ACTION_FALLBACK[actionType] ?? DEFAULT_CREDITS_COST;
}
