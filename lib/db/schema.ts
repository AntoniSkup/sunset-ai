import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  index,
  unique,
  uniqueIndex,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 20 }).notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripeProductId: text("stripe_product_id"),
  planName: varchar("plan_name", { length: 50 }),
  subscriptionStatus: varchar("subscription_status", { length: 20 }),
});

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  role: varchar("role", { length: 50 }).notNull(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
});

export const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  invitedBy: integer("invited_by")
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
});

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
  chats: many(chats),
  siteAssets: many(siteAssets),
  accounts: many(accounts),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, "id" | "name" | "email">;
  })[];
};

export const landingPageVersions = pgTable(
  "landing_page_versions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    chatId: varchar("chat_id", { length: 32 })
      .notNull()
      .references(() => chats.publicId),
    versionNumber: integer("version_number").notNull(),
    codeContent: text("code_content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    chatVersionUnique: unique().on(table.chatId, table.versionNumber),
    chatVersionIdx: index("chat_version_idx").on(table.chatId, table.versionNumber),
    userIdIdx: index("user_id_idx").on(table.userId),
    createdAtIdx: index("created_at_idx").on(table.createdAt),
  })
);

export const landingPageVersionsRelations = relations(
  landingPageVersions,
  ({ one }) => ({
    user: one(users, {
      fields: [landingPageVersions.userId],
      references: [users.id],
    }),
  })
);

export type LandingPageVersion = typeof landingPageVersions.$inferSelect;
export type NewLandingPageVersion = typeof landingPageVersions.$inferInsert;

export const landingSiteFiles = pgTable(
  "landing_site_files",
  {
    id: serial("id").primaryKey(),
    chatId: varchar("chat_id", { length: 32 })
      .notNull()
      .references(() => chats.publicId),
    path: varchar("path", { length: 255 }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull().default("section"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    chatPathUnique: unique().on(table.chatId, table.path),
    chatIdIdx: index("landing_site_files_chat_id_idx").on(table.chatId),
  })
);

export const landingSiteRevisions = pgTable(
  "landing_site_revisions",
  {
    id: serial("id").primaryKey(),
    chatId: varchar("chat_id", { length: 32 })
      .notNull()
      .references(() => chats.publicId),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    revisionNumber: integer("revision_number").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    chatRevisionUnique: unique().on(table.chatId, table.revisionNumber),
    chatRevisionIdx: index("landing_site_revisions_chat_revision_idx").on(
      table.chatId,
      table.revisionNumber
    ),
    userIdIdx: index("landing_site_revisions_user_id_idx").on(table.userId),
  })
);

export const landingSiteFileVersions = pgTable(
  "landing_site_file_versions",
  {
    id: serial("id").primaryKey(),
    fileId: integer("file_id")
      .notNull()
      .references(() => landingSiteFiles.id),
    revisionId: integer("revision_id")
      .notNull()
      .references(() => landingSiteRevisions.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    fileRevisionUnique: unique().on(table.fileId, table.revisionId),
    fileIdIdx: index("landing_site_file_versions_file_id_idx").on(table.fileId),
    revisionIdIdx: index("landing_site_file_versions_revision_id_idx").on(
      table.revisionId
    ),
  })
);

export const landingSiteFilesRelations = relations(landingSiteFiles, ({ one, many }) => ({
  chat: one(chats, {
    fields: [landingSiteFiles.chatId],
    references: [chats.publicId],
  }),
  versions: many(landingSiteFileVersions),
}));

export const landingSiteRevisionsRelations = relations(
  landingSiteRevisions,
  ({ one, many }) => ({
    chat: one(chats, {
      fields: [landingSiteRevisions.chatId],
      references: [chats.publicId],
    }),
    user: one(users, {
      fields: [landingSiteRevisions.userId],
      references: [users.id],
    }),
    fileVersions: many(landingSiteFileVersions),
  })
);

export const landingSiteFileVersionsRelations = relations(
  landingSiteFileVersions,
  ({ one }) => ({
    file: one(landingSiteFiles, {
      fields: [landingSiteFileVersions.fileId],
      references: [landingSiteFiles.id],
    }),
    revision: one(landingSiteRevisions, {
      fields: [landingSiteFileVersions.revisionId],
      references: [landingSiteRevisions.id],
    }),
  })
);

export type LandingSiteFile = typeof landingSiteFiles.$inferSelect;
export type NewLandingSiteFile = typeof landingSiteFiles.$inferInsert;
export type LandingSiteRevision = typeof landingSiteRevisions.$inferSelect;
export type NewLandingSiteRevision = typeof landingSiteRevisions.$inferInsert;
export type LandingSiteFileVersion = typeof landingSiteFileVersions.$inferSelect;
export type NewLandingSiteFileVersion = typeof landingSiteFileVersions.$inferInsert;

export const chats = pgTable(
  "chats",
  {
    id: serial("id").primaryKey(),
    publicId: varchar("public_id", { length: 32 }).notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 255 }),
    screenshotUrl: text("screenshot_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    publicIdUnique: unique("chats_public_id_unique").on(table.publicId),
    userIdIdx: index("chat_user_id_idx").on(table.userId),
    createdAtIdx: index("chat_created_at_idx").on(table.createdAt),
  })
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    parts: jsonb("parts").$type<unknown[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    chatIdIdx: index("chat_messages_chat_id_idx").on(table.chatId),
    createdAtIdx: index("chat_messages_created_at_idx").on(table.createdAt),
  })
);

export const chatToolCalls = pgTable(
  "chat_tool_calls",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id),
    stepNumber: integer("step_number"),
    state: varchar("state", { length: 20 }).notNull(), // "call" | "result"
    toolCallId: varchar("tool_call_id", { length: 255 }),
    toolName: varchar("tool_name", { length: 255 }).notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    chatIdIdx: index("chat_tool_calls_chat_id_idx").on(table.chatId),
    toolCallIdIdx: index("chat_tool_calls_tool_call_id_idx").on(table.toolCallId),
    createdAtIdx: index("chat_tool_calls_created_at_idx").on(table.createdAt),
  })
);

export const chatTurnRuns = pgTable(
  "chat_turn_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 20 }).notNull(), // pending, running, succeeded, failed, canceled
    sequence: integer("sequence").notNull(),
    triggerRunId: varchar("trigger_run_id", { length: 64 }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    errorMessage: text("error_message"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    idempotencyKeyUnique: unique("chat_turn_runs_idempotency_key_unique").on(
      table.idempotencyKey
    ),
    chatIdStatusIdx: index("chat_turn_runs_chat_id_status_idx").on(
      table.chatId,
      table.status
    ),
    chatIdSequenceIdx: index("chat_turn_runs_chat_id_sequence_idx").on(
      table.chatId,
      table.sequence
    ),
    oneRunningPerChat: uniqueIndex("chat_turn_runs_one_running_per_chat")
      .on(table.chatId)
      .where(sql`${table.status} = 'running'`),
  })
);

export const chatStreamEvents = pgTable(
  "chat_stream_events",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id),
    runId: uuid("run_id")
      .notNull()
      .references(() => chatTurnRuns.id),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    chatIdIdIdx: index("chat_stream_events_chat_id_id_idx").on(
      table.chatId,
      table.id
    ),
    runIdIdIdx: index("chat_stream_events_run_id_id_idx").on(
      table.runId,
      table.id
    ),
  })
);

export const siteAssets = pgTable(
  "site_assets",
  {
    id: serial("id").primaryKey(),
    chatId: varchar("chat_id", { length: 32 })
      .notNull()
      .references(() => chats.publicId),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    alias: varchar("alias", { length: 40 }).notNull(),
    blobUrl: text("blob_url").notNull(),
    intent: varchar("intent", { length: 20 }).notNull().default("site_asset"),
    status: varchar("status", { length: 20 }).notNull().default("ready"),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    originalFilename: varchar("original_filename", { length: 255 }),
    altHint: text("alt_hint"),
    label: varchar("label", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    chatAliasUnique: unique("site_assets_chat_alias_unique").on(
      table.chatId,
      table.alias
    ),
    chatIdIdx: index("site_assets_chat_id_idx").on(table.chatId),
    userIdIdx: index("site_assets_user_id_idx").on(table.userId),
    createdAtIdx: index("site_assets_created_at_idx").on(table.createdAt),
  })
);

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  messages: many(chatMessages),
  toolCalls: many(chatToolCalls),
  turnRuns: many(chatTurnRuns),
  streamEvents: many(chatStreamEvents),
  siteAssets: many(siteAssets),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMessages.chatId],
    references: [chats.id],
  }),
}));

export const chatToolCallsRelations = relations(chatToolCalls, ({ one }) => ({
  chat: one(chats, {
    fields: [chatToolCalls.chatId],
    references: [chats.id],
  }),
}));

export const chatTurnRunsRelations = relations(chatTurnRuns, ({ one, many }) => ({
  chat: one(chats, {
    fields: [chatTurnRuns.chatId],
    references: [chats.id],
  }),
  user: one(users, {
    fields: [chatTurnRuns.userId],
    references: [users.id],
  }),
  streamEvents: many(chatStreamEvents),
}));

export const chatStreamEventsRelations = relations(chatStreamEvents, ({ one }) => ({
  chat: one(chats, {
    fields: [chatStreamEvents.chatId],
    references: [chats.id],
  }),
  run: one(chatTurnRuns, {
    fields: [chatStreamEvents.runId],
    references: [chatTurnRuns.id],
  }),
}));

export const siteAssetsRelations = relations(siteAssets, ({ one }) => ({
  chat: one(chats, {
    fields: [siteAssets.chatId],
    references: [chats.publicId],
  }),
  user: one(users, {
    fields: [siteAssets.userId],
    references: [users.id],
  }),
}));

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type ChatToolCall = typeof chatToolCalls.$inferSelect;
export type NewChatToolCall = typeof chatToolCalls.$inferInsert;
export type ChatTurnRun = typeof chatTurnRuns.$inferSelect;
export type NewChatTurnRun = typeof chatTurnRuns.$inferInsert;
export type ChatStreamEvent = typeof chatStreamEvents.$inferSelect;
export type NewChatStreamEvent = typeof chatStreamEvents.$inferInsert;
export type SiteAsset = typeof siteAssets.$inferSelect;
export type NewSiteAsset = typeof siteAssets.$inferInsert;

export const publishedSites = pgTable(
  "published_sites",
  {
    id: serial("id").primaryKey(),
    publicId: varchar("public_id", { length: 32 }).notNull(),
    chatId: varchar("chat_id", { length: 32 })
      .notNull()
      .references(() => chats.publicId),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    revisionNumber: integer("revision_number").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    publicIdUnique: unique("published_sites_public_id_unique").on(table.publicId),
    chatIdIdx: index("published_sites_chat_id_idx").on(table.chatId),
    userIdIdx: index("published_sites_user_id_idx").on(table.userId),
  })
);

export const publishedSitesRelations = relations(publishedSites, ({ one }) => ({
  chat: one(chats, {
    fields: [publishedSites.chatId],
    references: [chats.publicId],
  }),
  user: one(users, {
    fields: [publishedSites.userId],
    references: [users.id],
  }),
}));

export type PublishedSite = typeof publishedSites.$inferSelect;
export type NewPublishedSite = typeof publishedSites.$inferInsert;

// ─── Billing & credits (ledger-based) ─────────────────────────────────────────

export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    countryCode: varchar("country_code", { length: 2 }),
    currency: varchar("currency", { length: 3 }).notNull().default("PLN"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    ownerUserIdUnique: unique("accounts_owner_user_id_unique").on(
      table.ownerUserId
    ),
  })
);

const creditsNumeric = (name: string) =>
  numeric(name, { precision: 10, scale: 2 }).$type<number>();

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  priceMinor: integer("price_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("PLN"),
  billingInterval: varchar("billing_interval", { length: 20 }).notNull(), // month, year
  includedCreditsPerCycle: creditsNumeric("included_credits_per_cycle").notNull(),
  rolloverCap: creditsNumeric("rollover_cap").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  dailyBonusCredits: creditsNumeric("daily_bonus_credits"),
  dailyBonusCapPerCycle: creditsNumeric("daily_bonus_cap_per_cycle"),
  topupsEnabled: boolean("topups_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id),
    status: varchar("status", { length: 30 }).notNull(), // trialing, active, past_due, canceled, incomplete
    provider: varchar("provider", { length: 30 }).notNull().default("stripe"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamp("canceled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    accountIdIdx: index("subscriptions_account_id_idx").on(table.accountId),
    providerSubIdIdx: index("subscriptions_provider_subscription_id_idx").on(
      table.providerSubscriptionId
    ),
    providerCustomerIdIdx: index("subscriptions_provider_customer_id_idx").on(
      table.providerCustomerId
    ),
  })
);

export const subscriptionCycles = pgTable(
  "subscription_cycles",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    status: varchar("status", { length: 20 }).notNull(), // open, closed
    includedCreditsGranted: creditsNumeric("included_credits_granted").notNull(),
    rolloverCreditsGranted: creditsNumeric("rollover_credits_granted").notNull().default(0),
    creditsConsumedInCycle: creditsNumeric("credits_consumed_in_cycle").notNull().default(0),
    creditsExpiredInCycle: creditsNumeric("credits_expired_in_cycle").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
  },
  (table) => ({
    subscriptionIdIdx: index("subscription_cycles_subscription_id_idx").on(
      table.subscriptionId
    ),
    accountIdIdx: index("subscription_cycles_account_id_idx").on(table.accountId),
    periodIdx: index("subscription_cycles_period_idx").on(
      table.periodStart,
      table.periodEnd
    ),
  })
);

export const topupPackages = pgTable("topup_packages", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  creditsAmount: creditsNumeric("credits_amount").notNull(),
  priceMinor: integer("price_minor").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("PLN"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    type: varchar("type", { length: 20 }).notNull(), // subscription, topup
    status: varchar("status", { length: 20 }).notNull(), // pending, paid, failed, refunded
    provider: varchar("provider", { length: 30 }).notNull().default("stripe"),
    providerPaymentIntentId: text("provider_payment_intent_id"),
    providerInvoiceId: text("provider_invoice_id"),
    topupPackageId: integer("topup_package_id").references(() => topupPackages.id),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("PLN"),
    paymentMethodType: varchar("payment_method_type", { length: 30 }),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    accountIdIdx: index("orders_account_id_idx").on(table.accountId),
    providerPaymentIntentIdx: index("orders_provider_payment_intent_id_idx").on(
      table.providerPaymentIntentId
    ),
  })
);

export const creditWallets = pgTable(
  "credit_wallets",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    balanceCached: creditsNumeric("balance_cached").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    accountIdUnique: unique("credit_wallets_account_id_unique").on(table.accountId),
    accountIdIdx: index("credit_wallets_account_id_idx").on(table.accountId),
  })
);

export const creditGrants = pgTable(
  "credit_grants",
  {
    id: serial("id").primaryKey(),
    walletId: integer("wallet_id")
      .notNull()
      .references(() => creditWallets.id),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    sourceType: varchar("source_type", { length: 30 }).notNull(), // subscription_cycle, rollover, topup, manual_adjustment, refund
    sourceId: integer("source_id"), // subscription_cycle_id or order_id etc.
    creditsTotal: creditsNumeric("credits_total").notNull(),
    creditsRemaining: creditsNumeric("credits_remaining").notNull(),
    expiresAt: timestamp("expires_at"),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    walletIdIdx: index("credit_grants_wallet_id_idx").on(table.walletId),
    accountIdIdx: index("credit_grants_account_id_idx").on(table.accountId),
    expiresAtIdx: index("credit_grants_expires_at_idx").on(table.expiresAt),
  })
);

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    projectId: integer("project_id"),
    actionType: varchar("action_type", { length: 50 }).notNull(), // generate_page, regenerate_section, rewrite_copy, generate_image
    status: varchar("status", { length: 20 }).notNull(), // pending, succeeded, failed, canceled
    creditsCharged: creditsNumeric("credits_charged").notNull().default(0),
    creditsRefunded: creditsNumeric("credits_refunded").notNull().default(0),
    provider: varchar("provider", { length: 50 }),
    model: varchar("model", { length: 100 }),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    providerCostMinor: integer("provider_cost_minor"),
    requestId: varchar("request_id", { length: 255 }),
    traceId: varchar("trace_id", { length: 255 }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    errorCode: varchar("error_code", { length: 50 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    accountIdIdx: index("ai_usage_events_account_id_idx").on(table.accountId),
    userIdIdx: index("ai_usage_events_user_id_idx").on(table.userId),
    idempotencyKeyIdx: index("ai_usage_events_idempotency_key_idx").on(
      table.idempotencyKey
    ),
    createdAtIdx: index("ai_usage_events_created_at_idx").on(table.createdAt),
  })
);

export const creditLedgerEntries = pgTable(
  "credit_ledger_entries",
  {
    id: serial("id").primaryKey(),
    walletId: integer("wallet_id")
      .notNull()
      .references(() => creditWallets.id),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id),
    entryType: varchar("entry_type", { length: 30 }).notNull(), // grant, debit, refund, expire, adjustment
    creditsDelta: creditsNumeric("credits_delta").notNull(),
    grantId: integer("grant_id").references(() => creditGrants.id),
    usageEventId: integer("usage_event_id").references(() => aiUsageEvents.id),
    orderId: integer("order_id").references(() => orders.id),
    subscriptionCycleId: integer("subscription_cycle_id").references(
      () => subscriptionCycles.id
    ),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    walletIdIdx: index("credit_ledger_entries_wallet_id_idx").on(table.walletId),
    accountIdIdx: index("credit_ledger_entries_account_id_idx").on(table.accountId),
    idempotencyKeyIdx: index("credit_ledger_entries_idempotency_key_idx").on(
      table.idempotencyKey
    ),
    createdAtIdx: index("credit_ledger_entries_created_at_idx").on(table.createdAt),
  })
);

export const creditDebitAllocations = pgTable(
  "credit_debit_allocations",
  {
    id: serial("id").primaryKey(),
    ledgerDebitEntryId: integer("ledger_debit_entry_id")
      .notNull()
      .references(() => creditLedgerEntries.id),
    grantId: integer("grant_id")
      .notNull()
      .references(() => creditGrants.id),
    creditsUsed: creditsNumeric("credits_used").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    ledgerDebitEntryIdIdx: index(
      "credit_debit_allocations_ledger_debit_entry_id_idx"
    ).on(table.ledgerDebitEntryId),
    grantIdIdx: index("credit_debit_allocations_grant_id_idx").on(table.grantId),
  })
);

export const creditActionPricing = pgTable(
  "credit_action_pricing",
  {
    id: serial("id").primaryKey(),
    actionType: varchar("action_type", { length: 50 }).notNull(),
    creditsCost: creditsNumeric("credits_cost").notNull(),
    effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
    effectiveTo: timestamp("effective_to"),
    planId: integer("plan_id").references(() => plans.id),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    actionTypeIdx: index("credit_action_pricing_action_type_idx").on(
      table.actionType
    ),
    planIdIdx: index("credit_action_pricing_plan_id_idx").on(table.planId),
  })
);

// Relations for billing & credits
export const accountsRelations = relations(accounts, ({ one, many }) => ({
  owner: one(users, {
    fields: [accounts.ownerUserId],
    references: [users.id],
  }),
  subscriptions: many(subscriptions),
  orders: many(orders),
  creditWallets: many(creditWallets),
  subscriptionCycles: many(subscriptionCycles),
  aiUsageEvents: many(aiUsageEvents),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
  creditActionPricing: many(creditActionPricing),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  account: one(accounts, {
    fields: [subscriptions.accountId],
    references: [accounts.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
  cycles: many(subscriptionCycles),
}));

export const subscriptionCyclesRelations = relations(
  subscriptionCycles,
  ({ one }) => ({
    subscription: one(subscriptions, {
      fields: [subscriptionCycles.subscriptionId],
      references: [subscriptions.id],
    }),
    account: one(accounts, {
      fields: [subscriptionCycles.accountId],
      references: [accounts.id],
    }),
  })
);

export const topupPackagesRelations = relations(topupPackages, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  account: one(accounts, {
    fields: [orders.accountId],
    references: [accounts.id],
  }),
  topupPackage: one(topupPackages, {
    fields: [orders.topupPackageId],
    references: [topupPackages.id],
  }),
}));

export const creditWalletsRelations = relations(creditWallets, ({ one, many }) => ({
  account: one(accounts, {
    fields: [creditWallets.accountId],
    references: [accounts.id],
  }),
  grants: many(creditGrants),
  ledgerEntries: many(creditLedgerEntries),
}));

export const creditGrantsRelations = relations(creditGrants, ({ one, many }) => ({
  wallet: one(creditWallets, {
    fields: [creditGrants.walletId],
    references: [creditWallets.id],
  }),
  account: one(accounts, {
    fields: [creditGrants.accountId],
    references: [accounts.id],
  }),
  debitAllocations: many(creditDebitAllocations),
}));

export const aiUsageEventsRelations = relations(aiUsageEvents, ({ one }) => ({
  account: one(accounts, {
    fields: [aiUsageEvents.accountId],
    references: [accounts.id],
  }),
  user: one(users, {
    fields: [aiUsageEvents.userId],
    references: [users.id],
  }),
}));

export const creditLedgerEntriesRelations = relations(
  creditLedgerEntries,
  ({ one, many }) => ({
    wallet: one(creditWallets, {
      fields: [creditLedgerEntries.walletId],
      references: [creditWallets.id],
    }),
    account: one(accounts, {
      fields: [creditLedgerEntries.accountId],
      references: [accounts.id],
    }),
    grant: one(creditGrants, {
      fields: [creditLedgerEntries.grantId],
      references: [creditGrants.id],
    }),
    usageEvent: one(aiUsageEvents, {
      fields: [creditLedgerEntries.usageEventId],
      references: [aiUsageEvents.id],
    }),
    order: one(orders, {
      fields: [creditLedgerEntries.orderId],
      references: [orders.id],
    }),
    subscriptionCycle: one(subscriptionCycles, {
      fields: [creditLedgerEntries.subscriptionCycleId],
      references: [subscriptionCycles.id],
    }),
    debitAllocations: many(creditDebitAllocations),
  })
);

export const creditDebitAllocationsRelations = relations(
  creditDebitAllocations,
  ({ one }) => ({
    ledgerDebitEntry: one(creditLedgerEntries, {
      fields: [creditDebitAllocations.ledgerDebitEntryId],
      references: [creditLedgerEntries.id],
    }),
    grant: one(creditGrants, {
      fields: [creditDebitAllocations.grantId],
      references: [creditGrants.id],
    }),
  })
);

export const creditActionPricingRelations = relations(
  creditActionPricing,
  ({ one }) => ({
    plan: one(plans, {
      fields: [creditActionPricing.planId],
      references: [plans.id],
    }),
  })
);

// Type exports for billing & credits
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionCycle = typeof subscriptionCycles.$inferSelect;
export type NewSubscriptionCycle = typeof subscriptionCycles.$inferInsert;
export type TopupPackage = typeof topupPackages.$inferSelect;
export type NewTopupPackage = typeof topupPackages.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type CreditWallet = typeof creditWallets.$inferSelect;
export type NewCreditWallet = typeof creditWallets.$inferInsert;
export type CreditGrant = typeof creditGrants.$inferSelect;
export type NewCreditGrant = typeof creditGrants.$inferInsert;
export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;
export type NewAiUsageEvent = typeof aiUsageEvents.$inferInsert;
export type CreditLedgerEntry = typeof creditLedgerEntries.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedgerEntries.$inferInsert;
export type CreditDebitAllocation = typeof creditDebitAllocations.$inferSelect;
export type NewCreditDebitAllocation = typeof creditDebitAllocations.$inferInsert;
export type CreditActionPricing = typeof creditActionPricing.$inferSelect;
export type NewCreditActionPricing = typeof creditActionPricing.$inferInsert;

export enum ActivityType {
  SIGN_UP = "SIGN_UP",
  SIGN_IN = "SIGN_IN",
  SIGN_OUT = "SIGN_OUT",
  UPDATE_PASSWORD = "UPDATE_PASSWORD",
  DELETE_ACCOUNT = "DELETE_ACCOUNT",
  UPDATE_ACCOUNT = "UPDATE_ACCOUNT",
  CREATE_TEAM = "CREATE_TEAM",
  REMOVE_TEAM_MEMBER = "REMOVE_TEAM_MEMBER",
  INVITE_TEAM_MEMBER = "INVITE_TEAM_MEMBER",
  ACCEPT_INVITATION = "ACCEPT_INVITATION",
}
