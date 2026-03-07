import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  creditGrants,
  creditLedgerEntries,
  creditWallets,
  subscriptionCycles,
} from "@/lib/db/schema";
import { getWalletByAccountId } from "./accounts";

/**
 * Create a credit grant for a subscription cycle and append ledger entry + update wallet cache.
 * Used on checkout success and on subscription renewal (webhook).
 */
export async function createGrantForSubscriptionCycle(
  accountId: number,
  subscriptionCycleId: number,
  credits: number,
  expiresAt: Date | null
): Promise<void> {
  const wallet = await getWalletByAccountId(accountId);
  if (!wallet) {
    throw new Error("Credit wallet not found for account");
  }

  await db.transaction(async (tx) => {
    const [grant] = await tx
      .insert(creditGrants)
      .values({
        walletId: wallet.id,
        accountId,
        sourceType: "subscription_cycle",
        sourceId: subscriptionCycleId,
        creditsTotal: credits,
        creditsRemaining: credits,
        expiresAt,
      })
      .returning();

    if (!grant) throw new Error("Failed to create credit grant");

    await tx.insert(creditLedgerEntries).values({
      walletId: wallet.id,
      accountId,
      entryType: "grant",
      creditsDelta: credits,
      grantId: grant.id,
      subscriptionCycleId,
    });

    await tx
      .update(creditWallets)
      .set({
        balanceCached: Number(wallet.balanceCached) + credits,
        updatedAt: new Date(),
      })
      .where(eq(creditWallets.id, wallet.id));
  });
}

/**
 * Create a subscription cycle and its credit grant. Used on checkout success and webhook renewal.
 */
export async function createSubscriptionCycleAndGrant(
  accountId: number,
  subscriptionId: number,
  periodStart: Date,
  periodEnd: Date,
  includedCredits: number
): Promise<number> {
  const periodEndDate = periodEnd instanceof Date ? periodEnd : new Date(periodEnd);

  const [cycle] = await db
    .insert(subscriptionCycles)
    .values({
      subscriptionId,
      accountId,
      periodStart,
      periodEnd: periodEndDate,
      status: "open",
      includedCreditsGranted: includedCredits,
      rolloverCreditsGranted: 0,
      creditsConsumedInCycle: 0,
      creditsExpiredInCycle: 0,
    })
    .returning();

  if (!cycle) throw new Error("Failed to create subscription cycle");

  await createGrantForSubscriptionCycle(
    accountId,
    cycle.id,
    includedCredits,
    periodEndDate
  );

  return cycle.id;
}

/**
 * Create a rollover credit grant (e.g. at cycle close).
 * sourceId is the subscription_cycle id we're rolling over from.
 */
export async function createRolloverGrant(
  accountId: number,
  sourceCycleId: number,
  credits: number,
  expiresAt: Date
): Promise<void> {
  if (credits <= 0) return;

  const wallet = await getWalletByAccountId(accountId);
  if (!wallet) {
    throw new Error("Credit wallet not found for account");
  }

  await db.transaction(async (tx) => {
    const [grant] = await tx
      .insert(creditGrants)
      .values({
        walletId: wallet.id,
        accountId,
        sourceType: "rollover",
        sourceId: sourceCycleId,
        creditsTotal: credits,
        creditsRemaining: credits,
        expiresAt,
      })
      .returning();

    if (!grant) throw new Error("Failed to create rollover grant");

    await tx.insert(creditLedgerEntries).values({
      walletId: wallet.id,
      accountId,
      entryType: "grant",
      creditsDelta: credits,
      grantId: grant.id,
      subscriptionCycleId: sourceCycleId,
      metadata: { rollover: true },
    });

    await tx
      .update(creditWallets)
      .set({
        balanceCached: Number(wallet.balanceCached) + credits,
        updatedAt: new Date(),
      })
      .where(eq(creditWallets.id, wallet.id));
  });
}
