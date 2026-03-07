import { eq } from "drizzle-orm";
import { stripe } from "../payments/stripe";
import { db } from "./drizzle";
import {
  users,
  teams,
  teamMembers,
  plans,
  creditActionPricing,
} from "./schema";
import { hashPassword } from "@/lib/auth/session";

const TEST_USER_EMAIL = "test@test.com";

async function createStripeProducts() {
  console.log("Creating Stripe products and prices...");

  const baseProduct = await stripe.products.create({
    name: "Base",
    description: "Base subscription plan",
  });

  await stripe.prices.create({
    product: baseProduct.id,
    unit_amount: 800, // $8 in cents
    currency: "usd",
    recurring: {
      interval: "month",
      trial_period_days: 7,
    },
  });

  const plusProduct = await stripe.products.create({
    name: "Plus",
    description: "Plus subscription plan",
  });

  await stripe.prices.create({
    product: plusProduct.id,
    unit_amount: 1200, // $12 in cents
    currency: "usd",
    recurring: {
      interval: "month",
      trial_period_days: 7,
    },
  });

  console.log("Stripe products and prices created successfully.");
}

async function seedBillingPlans() {
  const starterPlan = {
    code: "starter",
    name: "Starter",
    priceMinor: 5900, // 59 PLN
    currency: "PLN",
    billingInterval: "month",
    includedCreditsPerCycle: 100,
    rolloverCap: 50,
    dailyBonusCredits: 5,
    dailyBonusCapPerCycle: 150,
    isActive: true,
    topupsEnabled: true,
  };

  await db
    .insert(plans)
    .values(starterPlan)
    .onConflictDoUpdate({
      target: plans.code,
      set: {
        includedCreditsPerCycle: starterPlan.includedCreditsPerCycle,
        rolloverCap: starterPlan.rolloverCap,
        dailyBonusCredits: starterPlan.dailyBonusCredits,
        dailyBonusCapPerCycle: starterPlan.dailyBonusCapPerCycle,
      },
    });

  const existing = await db.select().from(creditActionPricing).limit(1);
  if (existing.length === 0) {
    await db.insert(creditActionPricing).values([
      { actionType: "generate_page", creditsCost: 2, isActive: true },
      { actionType: "regenerate_section", creditsCost: 1, isActive: true },
      { actionType: "rewrite_copy", creditsCost: 1, isActive: true },
      { actionType: "generate_image", creditsCost: 5, isActive: true },
      { actionType: "chat_message", creditsCost: 0.5, isActive: true },
    ]);
  } else {
    const chatMsg = await db
      .select()
      .from(creditActionPricing)
      .where(eq(creditActionPricing.actionType, "chat_message"))
      .limit(1);
    if (chatMsg.length === 0) {
      await db.insert(creditActionPricing).values({
        actionType: "chat_message",
        creditsCost: 0.5,
        isActive: true,
      });
      console.log("Added chat_message pricing (0.5 credits).");
    }
  }

  console.log("Billing plans and credit action pricing seeded.");
}

async function seed() {
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USER_EMAIL))
    .limit(1);

  if (existingUser.length === 0) {
    const password = "admin123";
    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values([
        {
          email: TEST_USER_EMAIL,
          passwordHash: passwordHash,
          role: "owner",
        },
      ])
      .returning();

    const [team] = await db
      .insert(teams)
      .values({
        name: "Test Team",
      })
      .returning();

    await db.insert(teamMembers).values({
      teamId: team.id,
      userId: user.id,
      role: "owner",
    });

    console.log("Initial user created.");
  } else {
    console.log("Test user already exists, skipping user/team creation.");
  }

  await createStripeProducts();
  await seedBillingPlans();
}

seed()
  .catch((error) => {
    console.error("Seed process failed:", error);
    process.exit(1);
  })
  .finally(() => {
    console.log("Seed process finished. Exiting...");
    process.exit(0);
  });
