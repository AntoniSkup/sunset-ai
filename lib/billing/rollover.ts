import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { subscriptionCycles, subscriptions } from "@/lib/db/schema";
import { getPlanById } from "./plans";
import { createRolloverGrant } from "./grants";

/**
 * Close overdue subscription cycles and create rollover grants.
 * Run via cron or internal endpoint. Finds cycles with status 'open' and period_end < now(),
 * computes unused credits, creates rollover grant (capped by plan.rollover_cap), then closes the cycle.
 */
export async function processRollover(): Promise<{ closed: number; rolloversCreated: number }> {
  const now = new Date();
  const openCycles = await db
    .select()
    .from(subscriptionCycles)
    .where(
      and(
        eq(subscriptionCycles.status, "open"),
        lt(subscriptionCycles.periodEnd, now)
      )
    );

  let closed = 0;
  let rolloversCreated = 0;

  for (const cycle of openCycles) {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, cycle.subscriptionId))
      .limit(1);
    if (!sub) continue;

    const plan = await getPlanById(sub.planId);
    if (!plan) continue;

    const unused = Math.max(
      0,
      cycle.includedCreditsGranted - cycle.creditsConsumedInCycle
    );
    const rolloverAmount = Math.min(unused, plan.rolloverCap);
    const creditsExpired = unused - rolloverAmount;

    let nextCycleEnd: Date | null = null;
    const [nextCycle] = await db
      .select()
      .from(subscriptionCycles)
      .where(
        and(
          eq(subscriptionCycles.subscriptionId, cycle.subscriptionId),
          gt(subscriptionCycles.periodStart, cycle.periodEnd)
        )
      )
      .orderBy(sql`${subscriptionCycles.periodStart} ASC`)
      .limit(1);
    if (nextCycle) {
      nextCycleEnd =
        nextCycle.periodEnd instanceof Date
          ? nextCycle.periodEnd
          : new Date(nextCycle.periodEnd);
    }

    if (rolloverAmount > 0 && nextCycleEnd) {
      await createRolloverGrant(
        cycle.accountId,
        cycle.id,
        rolloverAmount,
        nextCycleEnd
      );
      rolloversCreated++;
    }

    await db
      .update(subscriptionCycles)
      .set({
        status: "closed",
        creditsExpiredInCycle: creditsExpired,
        closedAt: now,
      })
      .where(eq(subscriptionCycles.id, cycle.id));
    closed++;
  }

  return { closed, rolloversCreated };
}
