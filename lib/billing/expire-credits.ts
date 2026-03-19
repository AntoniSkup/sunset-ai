"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  creditGrants,
  creditLedgerEntries,
  creditWallets,
  subscriptionCycles,
} from "@/lib/db/schema";
import { getWalletByAccountId } from "./accounts";

export async function expireCreditsForAccount(
  accountId: number
): Promise<{ expiredCredits: number; grantsExpired: number }> {
  const wallet = await getWalletByAccountId(accountId);
  if (!wallet) return { expiredCredits: 0, grantsExpired: 0 };

  return await db.transaction(async (tx) => {
    const [lockedWallet] = await tx
      .select()
      .from(creditWallets)
      .where(eq(creditWallets.id, wallet.id))
      .for("update");

    if (!lockedWallet) return { expiredCredits: 0, grantsExpired: 0 };

    const expiredGrants = await tx
      .select()
      .from(creditGrants)
      .where(
        and(
          eq(creditGrants.walletId, wallet.id),
          sql`${creditGrants.creditsRemaining} > 0`,
          sql`${creditGrants.expiresAt} IS NOT NULL`,
          // Compare timestamp-without-tz to DB UTC clock (also timestamp-without-tz).
          sql`${creditGrants.expiresAt} <= (now() at time zone 'UTC')`
        )
      )
      .for("update");

    if (expiredGrants.length === 0) {
      return { expiredCredits: 0, grantsExpired: 0 };
    }

    let expiredTotal = 0;

    for (const grant of expiredGrants) {
      const remaining = Number(grant.creditsRemaining);
      if (remaining <= 0) continue;

      expiredTotal += remaining;

      await tx
        .update(creditGrants)
        .set({ creditsRemaining: 0 })
        .where(eq(creditGrants.id, grant.id));

      await tx.insert(creditLedgerEntries).values({
        walletId: wallet.id,
        accountId,
        entryType: "expire",
        creditsDelta: -remaining,
        grantId: grant.id,
        subscriptionCycleId:
          grant.sourceType === "subscription_cycle" ||
          grant.sourceType === "rollover"
            ? grant.sourceId
            : null,
        metadata: {
          sourceType: grant.sourceType,
          expiresAt: grant.expiresAt instanceof Date
            ? grant.expiresAt.toISOString()
            : grant.expiresAt,
        },
      });

      if (
        (grant.sourceType === "subscription_cycle" ||
          grant.sourceType === "rollover") &&
        grant.sourceId
      ) {
        await tx
          .update(subscriptionCycles)
          .set({
            creditsExpiredInCycle: sql`${subscriptionCycles.creditsExpiredInCycle} + ${remaining}`,
          })
          .where(eq(subscriptionCycles.id, grant.sourceId));
      }
    }

    if (expiredTotal > 0) {
      await tx
        .update(creditWallets)
        .set({
          balanceCached: sql`GREATEST(0, ${creditWallets.balanceCached} - ${expiredTotal})`,
          updatedAt: new Date(),
        })
        .where(eq(creditWallets.id, wallet.id));
    }

    return { expiredCredits: expiredTotal, grantsExpired: expiredGrants.length };
  });
}

