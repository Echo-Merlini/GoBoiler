import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

// ─── Better Auth core tables ─────────────────────────────
// Better Auth will auto-create these via its Drizzle adapter.
// Defined here so Drizzle Studio can inspect them.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),

  // Extended fields
  walletAddress: text("wallet_address").unique(),
  stripeCustomerId: text("stripe_customer_id"),
  plan: text("plan").notNull().default("free"), // free | pro | enterprise
  isAdmin: boolean("is_admin").notNull().default(false),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── SIWE nonces ────────────────────────────────────────
export const siweNonce = pgTable("siwe_nonce", {
  id: text("id").primaryKey(),
  nonce: text("nonce").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Linked wallets (user can have multiple) ─────────────
export const wallet = pgTable("wallet", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  address: text("address").notNull().unique(),
  chainId: integer("chain_id").notNull().default(1),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Organizations (Better Auth plugin tables) ───────────
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // owner | admin | member
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected | cancelled
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Settings (admin-configurable service config) ────────
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── API Keys (machine-to-machine auth) ──────────────────
export const apiKey = pgTable("api_key", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(), // SHA-256 of the raw key
  prefix: text("prefix").notNull(),             // first 8 chars shown in UI
  scopes: text("scopes").notNull().default("*"), // comma-separated or "*"
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── App Logs ────────────────────────────────────────────
export const appLog = pgTable("app_log", {
  id: text("id").primaryKey(),
  level: text("level").notNull(),     // info | warn | error
  message: text("message").notNull(),
  source: text("source"),             // e.g. "cron", "push", "billing"
  meta: text("meta"),                 // JSON string of extra context
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Push Subscriptions ──────────────────────────────────
export const pushSubscription = pgTable("push_subscription", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Cron Jobs ───────────────────────────────────────────
export const cronJob = pgTable("cron_job", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  schedule: text("schedule").notNull(),  // cron expression
  url: text("url").notNull(),            // internal or external endpoint
  method: text("method").notNull().default("GET"),
  body: text("body"),                    // optional JSON body
  headers: text("headers"),             // optional JSON headers
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: text("last_run_status"), // "ok" | "error"
  lastRunMessage: text("last_run_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Two-Factor Auth (Better Auth twoFactor plugin) ──────
export const twoFactor = pgTable("two_factor", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── AI Skills ───────────────────────────────────────────
export const skill = pgTable("skill", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull().default("You are a helpful assistant."),
  provider: text("provider").notNull().default("anthropic"), // anthropic | openai | groq | mistral
  model: text("model").notNull().default("claude-sonnet-4-6"),
  temperature: text("temperature").notNull().default("0.7"),
  maxTokens: integer("max_tokens").notNull().default(2048),
  tools: text("tools"),         // JSON array of tool definitions (OpenAI format)
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversation = pgTable("conversation", {
  id: text("id").primaryKey(),
  skillId: text("skill_id").references(() => skill.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().unique(),
  messages: text("messages").notNull().default("[]"), // JSON: [{role,content}]
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Outgoing Webhooks ───────────────────────────────────
export const webhookEndpoint = pgTable("webhook_endpoint", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),              // HMAC signing key (stored plaintext — admin-only)
  events: text("events").notNull().default("*"), // comma-separated event names or "*"
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const webhookDelivery = pgTable("webhook_delivery", {
  id: text("id").primaryKey(),
  endpointId: text("endpoint_id")
    .notNull()
    .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: text("payload").notNull(),            // JSON sent to endpoint
  status: text("status").notNull().default("pending"), // pending | success | failed
  attempts: integer("attempts").notNull().default(0),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Feature Flags ───────────────────────────────────────
export const featureFlag = pgTable("feature_flag", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(false),
  rules: text("rules"),   // JSON: { plans?: string[], userIds?: string[] } — null = all users
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── In-App Notifications ────────────────────────────────
export const notification = pgTable("notification", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  url: text("url"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Audit Log ───────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),      // e.g. "user.deleted", "plan.changed", "key.revoked"
  resource: text("resource").notNull(),  // e.g. "user", "session", "api_key"
  resourceId: text("resource_id"),
  before: text("before"),               // JSON snapshot before change
  after: text("after"),                 // JSON snapshot after change
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Background Job Queue ────────────────────────────────
export const jobQueue = pgTable("job_queue", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),                          // worker key, e.g. "webhook.deliver"
  payload: text("payload").notNull().default("{}"),      // JSON
  status: text("status").notNull().default("pending"),   // pending | processing | done | failed
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAt: timestamp("run_at").notNull().defaultNow(),     // earliest time to process
  processedAt: timestamp("processed_at"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
