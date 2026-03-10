import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { plans, type Plan } from "@/lib/db/schema";
import { getSubscriptionByAccountId } from "./accounts";

/**
 * Get plan by code (e.g. "starter", "free").
 */
export async function getPlanByCode(code: string): Promise<Plan | null> {
  const result = await db
    .select()
    .from(plans)
    .where(eq(plans.code, code))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Get plan by id.
 */
export async function getPlanById(planId: number): Promise<Plan | null> {
  const result = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Get the free plan (default for accounts without a subscription).
 */
export async function getFreePlan(): Promise<Plan | null> {
  return getPlanByCode("free");
}

/**
 * Resolve plan for an account: Pro (Starter) if they have an active/trialing subscription, else Free.
 */
export async function getPlanForAccount(accountId: number): Promise<Plan | null> {
  const subscription = await getSubscriptionByAccountId(accountId);
  if (
    subscription &&
    (subscription.status === "active" || subscription.status === "trialing")
  ) {
    return getPlanById(subscription.planId);
  }
  return getFreePlan();
}
