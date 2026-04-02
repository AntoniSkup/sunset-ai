import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  creditDebitAllocations,
  creditGrants,
  creditLedgerEntries,
  creditWallets,
  subscriptionCycles,
} from "@/lib/db/schema";
import { getWalletByAccountId } from "@/lib/billing/accounts";

export type DebitResult = {
  success: true;
  ledgerEntryId: number;
  amount: number;
};

function asCreditNumber(value: unknown, fieldName: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid credit numeric for ${fieldName}: ${String(value)}`);
  }

  return parsed;
}

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly accountId: number,
    public readonly required: number,
    public readonly available: number
  ) {
    super(
      `Insufficient credits: required ${required}, available ${available}`
    );
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Debit credits from the account's wallet.
 * Uses daily credits first, then monthly/rollover (FEFO within each group).
 * Idempotent: if idempotencyKey was already used for this account, returns existing result.
 * @throws InsufficientCreditsError if balance is too low
 */
export async function debitCredits(
  accountId: number,
  amount: number,
  idempotencyKey: string,
  options?: {
    usageEventId?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<DebitResult> {
  if (amount <= 0) {
    throw new Error("Debit amount must be positive");
  }

  const wallet = await getWalletByAccountId(accountId);
  if (!wallet) {
    throw new Error("Credit wallet not found for account");
  }

  return await db.transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx
        .select({ id: creditLedgerEntries.id, creditsDelta: creditLedgerEntries.creditsDelta })
        .from(creditLedgerEntries)
        .where(
          and(
            eq(creditLedgerEntries.accountId, accountId),
            eq(creditLedgerEntries.idempotencyKey, idempotencyKey),
            eq(creditLedgerEntries.entryType, "debit")
          )
        )
        .limit(1);
      if (existing[0]) {
        return {
          success: true as const,
          ledgerEntryId: existing[0].id,
          amount: Math.abs(
            asCreditNumber(existing[0].creditsDelta, "creditLedgerEntries.creditsDelta")
          ),
        };
      }
    }

    const [lockedWallet] = await tx
      .select()
      .from(creditWallets)
      .where(eq(creditWallets.id, wallet.id))
      .for("update");

    if (!lockedWallet) {
      throw new Error("Wallet not found");
    }

    const balance = asCreditNumber(
      lockedWallet.balanceCached,
      "creditWallets.balanceCached"
    );
    if (balance < amount) {
      throw new InsufficientCreditsError(
        accountId,
        amount,
        balance
      );
    }

    const grants = await tx
      .select()
      .from(creditGrants)
      .where(
        and(
          eq(creditGrants.walletId, wallet.id),
          gt(creditGrants.creditsRemaining, 0)
        )
      )
      .orderBy(
        creditGrants.priority,
        sql`${creditGrants.expiresAt} ASC NULLS LAST`
      )
      .for("update");

    let remaining = amount;
    const allocations: { grantId: number; creditsUsed: number }[] = [];

    for (const grant of grants) {
      if (remaining <= 0) break;
      const use = Math.min(
        asCreditNumber(grant.creditsRemaining, "creditGrants.creditsRemaining"),
        remaining
      );
      allocations.push({ grantId: grant.id, creditsUsed: use });
      remaining -= use;
    }

    if (remaining > 0) {
      throw new InsufficientCreditsError(
        accountId,
        amount,
        amount - remaining
      );
    }

    const [ledgerEntry] = await tx
      .insert(creditLedgerEntries)
      .values({
        walletId: wallet.id,
        accountId,
        entryType: "debit",
        creditsDelta: -amount,
        usageEventId: options?.usageEventId ?? null,
        idempotencyKey: idempotencyKey || null,
        metadata: options?.metadata ?? null,
      })
      .returning({ id: creditLedgerEntries.id });

    if (!ledgerEntry) {
      throw new Error("Failed to create ledger entry");
    }

    for (const alloc of allocations) {
      const grant = grants.find((g) => g.id === alloc.grantId);
      if (!grant) continue;
      await tx.insert(creditDebitAllocations).values({
        ledgerDebitEntryId: ledgerEntry.id,
        grantId: alloc.grantId,
        creditsUsed: alloc.creditsUsed,
      });
      await tx
        .update(creditGrants)
        .set({
          creditsRemaining:
            asCreditNumber(grant.creditsRemaining, "creditGrants.creditsRemaining") -
            asCreditNumber(alloc.creditsUsed, "creditDebitAllocations.creditsUsed"),
        })
        .where(eq(creditGrants.id, alloc.grantId));
      if (
        grant.sourceType === "subscription_cycle" &&
        grant.sourceId != null
      ) {
        await tx
          .update(subscriptionCycles)
          .set({
            creditsConsumedInCycle: sql`${subscriptionCycles.creditsConsumedInCycle} + ${alloc.creditsUsed}`,
          })
          .where(eq(subscriptionCycles.id, grant.sourceId));
      }
    }

    await tx
      .update(creditWallets)
      .set({
        balanceCached:
          asCreditNumber(lockedWallet.balanceCached, "creditWallets.balanceCached") -
          amount,
        updatedAt: new Date(),
      })
      .where(eq(creditWallets.id, wallet.id));

    return {
      success: true,
      ledgerEntryId: ledgerEntry.id,
      amount,
    };
  });
}

/**
 * Refund credits that were debited for a usage event (e.g. AI action failed).
 * Restores grant balances from the original debit allocations and inserts a refund ledger entry.
 * Idempotent: if a refund for this usageEventId already exists, no-op.
 */
export async function refundCreditsForUsageEvent(
  accountId: number,
  usageEventId: number
): Promise<{ refunded: number } | null> {
  const wallet = await getWalletByAccountId(accountId);
  if (!wallet) return null;

  return await db.transaction(async (tx) => {
    const debitEntries = await tx
      .select()
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.accountId, accountId),
          eq(creditLedgerEntries.usageEventId, usageEventId),
          eq(creditLedgerEntries.entryType, "debit")
        )
      )
      .orderBy(creditLedgerEntries.id);

    if (debitEntries.length === 0) return null;

    const amount = debitEntries.reduce((sum, entry) => {
      const creditsDelta = asCreditNumber(
        entry.creditsDelta,
        "creditLedgerEntries.creditsDelta"
      );
      return creditsDelta < 0 ? sum + Math.abs(creditsDelta) : sum;
    }, 0);
    if (amount <= 0) return null;

    const existingRefund = await tx
      .select()
      .from(creditLedgerEntries)
      .where(
        and(
          eq(creditLedgerEntries.accountId, accountId),
          eq(creditLedgerEntries.usageEventId, usageEventId),
          eq(creditLedgerEntries.entryType, "refund")
        )
      )
      .limit(1);
    if (existingRefund[0]) return { refunded: amount };

    const debitEntryIds = debitEntries.map((entry) => entry.id);
    const allocations =
      debitEntryIds.length > 0
        ? await tx
            .select()
            .from(creditDebitAllocations)
            .where(inArray(creditDebitAllocations.ledgerDebitEntryId, debitEntryIds))
        : [];

    const grantIds = allocations.map((a) => a.grantId);
    const grants =
      grantIds.length > 0
        ? await tx
            .select()
            .from(creditGrants)
            .where(inArray(creditGrants.id, grantIds))
        : [];

    for (const alloc of allocations) {
      const grant = grants.find((g) => g.id === alloc.grantId);
      if (grant) {
        await tx
          .update(creditGrants)
          .set({
            creditsRemaining:
              asCreditNumber(
                grant.creditsRemaining,
                "creditGrants.creditsRemaining"
              ) +
              asCreditNumber(
                alloc.creditsUsed,
                "creditDebitAllocations.creditsUsed"
              ),
          })
          .where(eq(creditGrants.id, alloc.grantId));
        if (
          grant.sourceType === "subscription_cycle" &&
          grant.sourceId != null
        ) {
          await tx
            .update(subscriptionCycles)
            .set({
              creditsConsumedInCycle: sql`GREATEST(0, ${subscriptionCycles.creditsConsumedInCycle} - ${alloc.creditsUsed})`,
            })
            .where(eq(subscriptionCycles.id, grant.sourceId));
        }
      }
    }

    const [currentWallet] = await tx
      .select()
      .from(creditWallets)
      .where(eq(creditWallets.id, wallet.id))
      .for("update");

    await tx.insert(creditLedgerEntries).values({
      walletId: wallet.id,
      accountId,
      entryType: "refund",
      creditsDelta: amount,
      usageEventId,
      grantId: null,
    });

    if (currentWallet) {
      await tx
        .update(creditWallets)
        .set({
          balanceCached:
            asCreditNumber(currentWallet.balanceCached, "creditWallets.balanceCached") +
            amount,
          updatedAt: new Date(),
        })
        .where(eq(creditWallets.id, wallet.id));
    }

    return { refunded: amount };
  });
}
