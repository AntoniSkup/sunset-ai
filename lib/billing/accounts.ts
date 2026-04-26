import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  accounts,
  creditWallets,
  subscriptions,
  users,
  type Account,
  type CreditWallet,
  type Subscription,
} from "@/lib/db/schema";

/**
 * Get account by owner user id (read-only).
 */
export async function getAccountForUser(userId: number): Promise<Account | null> {
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.ownerUserId, userId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Idempotently insert a credit wallet for an account. Safe to call from
 * inside or outside a transaction; relies on the `accountId` unique
 * constraint to dedupe under concurrency.
 */
async function ensureWalletForAccount(
  exec: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  accountId: number
): Promise<void> {
  await exec
    .insert(creditWallets)
    .values({ accountId, balanceCached: 0 })
    .onConflictDoNothing({ target: creditWallets.accountId });
}

/**
 * Get or create account and credit wallet for the user.
 * On first account creation, creates credit_wallet in the same transaction.
 * Ensures wallet exists even for accounts created before billing was added,
 * and even when this call lost the race against a concurrent writer that
 * created the account row.
 */
export async function getOrCreateAccountForUser(
  userId: number
): Promise<Account> {
  const existing = await getAccountForUser(userId);
  if (existing) {
    // Defensive: legacy accounts (created before billing existed) and
    // partial signups can leave the account row without a wallet. Always
    // ensure one is present before returning.
    await ensureWalletForAccount(db, existing.id);
    return existing;
  }

  const [user] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  const accountName =
    user.name?.trim() || user.email?.split("@")[0] || "My Account";

  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(accounts)
      .values({
        ownerUserId: userId,
        name: accountName.slice(0, 255),
        currency: "PLN",
      })
      .onConflictDoNothing({ target: accounts.ownerUserId })
      .returning();

    if (inserted[0]) {
      await ensureWalletForAccount(tx, inserted[0].id);
      return inserted[0];
    }

    // Fallthrough: another writer inserted the account row before us.
    // We MUST still guarantee the wallet exists for this account, otherwise
    // downstream callers (daily-credit grants, debits, etc.) will throw
    // "Credit wallet not found for account" and break the signup flow.
    const [existingInTx] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.ownerUserId, userId))
      .limit(1);
    if (!existingInTx) {
      throw new Error("Failed to get or create account");
    }
    await ensureWalletForAccount(tx, existingInTx.id);
    return existingInTx;
  });
}

/**
 * Get the most relevant subscription for an account (if any).
 *
 * An account can have multiple subscription rows over time (e.g. a trial that
 * converts, or a re-subscribe after a cancel). We deterministically prefer:
 *   1. Currently usable subscriptions (`active` or `trialing`)
 *   2. Most recently updated row as a tiebreaker
 *
 * This guarantees that callers (billing breakdown, plan resolution, customer
 * portal, etc.) see the subscription the user actually expects.
 */
export async function getSubscriptionByAccountId(
  accountId: number
): Promise<Subscription | null> {
  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.accountId, accountId))
    .orderBy(
      sql`CASE WHEN ${subscriptions.status} IN ('active', 'trialing') THEN 0 ELSE 1 END`,
      desc(subscriptions.updatedAt)
    )
    .limit(1);
  return result[0] ?? null;
}

/**
 * Resolve account by Stripe customer id (via subscription).
 */
export async function getAccountByStripeCustomerId(
  customerId: string
): Promise<Account | null> {
  const [sub] = await db
    .select({
      accountId: subscriptions.accountId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.providerCustomerId, customerId))
    .limit(1);

  if (!sub) return null;

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, sub.accountId))
    .limit(1);
  return account ?? null;
}

/**
 * Get credit wallet for an account.
 */
export async function getWalletByAccountId(
  accountId: number
): Promise<CreditWallet | null> {
  const result = await db
    .select()
    .from(creditWallets)
    .where(eq(creditWallets.accountId, accountId))
    .limit(1);
  return result[0] ?? null;
}

/**
 * Get subscription by Stripe subscription id (for webhooks).
 */
export async function getSubscriptionByProviderSubscriptionId(
  providerSubscriptionId: string
): Promise<Subscription | null> {
  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, providerSubscriptionId))
    .limit(1);
  return result[0] ?? null;
}
