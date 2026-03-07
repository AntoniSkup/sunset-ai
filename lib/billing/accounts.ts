import { eq } from "drizzle-orm";
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
 * Get or create account and credit wallet for the user.
 * On first account creation, creates credit_wallet in the same transaction.
 * Ensures wallet exists even for accounts created before billing was added.
 */
export async function getOrCreateAccountForUser(
  userId: number
): Promise<Account> {
  const existing = await getAccountForUser(userId);
  if (existing) {
    const wallet = await getWalletByAccountId(existing.id);
    if (!wallet) {
      await db
        .insert(creditWallets)
        .values({ accountId: existing.id, balanceCached: 0 })
        .onConflictDoNothing({ target: creditWallets.accountId });
    }
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
      await tx.insert(creditWallets).values({
        accountId: inserted[0].id,
        balanceCached: 0,
      });
      return inserted[0];
    }

    const [existing] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.ownerUserId, userId))
      .limit(1);
    if (!existing) {
      throw new Error("Failed to get or create account");
    }
    return existing;
  });
}

/**
 * Get active subscription for an account (if any).
 */
export async function getSubscriptionByAccountId(
  accountId: number
): Promise<Subscription | null> {
  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.accountId, accountId))
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
