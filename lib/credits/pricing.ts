import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { creditActionPricing } from "@/lib/db/schema";

const DEFAULT_CREDITS_COST = 10;

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
        sql`${creditActionPricing.effectiveFrom} <= ${now}`,
        or(
          isNull(creditActionPricing.effectiveTo),
          sql`${creditActionPricing.effectiveTo} > ${now}`
        ),
        planId != null
          ? eq(creditActionPricing.planId, planId)
          : isNull(creditActionPricing.planId)
      )
    )
    .orderBy(sql`${creditActionPricing.effectiveFrom} DESC`)
    .limit(1);

  if (rows[0]) return rows[0].creditsCost;

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
      .orderBy(sql`${creditActionPricing.effectiveFrom} DESC`)
      .limit(1);
    if (fallback[0]) return fallback[0].creditsCost;
  }

  return DEFAULT_CREDITS_COST;
}
