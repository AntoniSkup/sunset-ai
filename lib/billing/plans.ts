import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { plans, type Plan } from "@/lib/db/schema";

/**
 * Get plan by code (e.g. "starter").
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
