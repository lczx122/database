import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const companyProfile = pgTable("company_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tin: text("tin").notNull().default(""),
  brn: text("brn").notNull().default(""),
  sstRegistrationNo: text("sst_registration_no"),
  tourismTaxNo: text("tourism_tax_no"),
  msicCode: text("msic_code").notNull().default("00000"),
  msicDescription: text("msic_description").notNull().default("NOT APPLICABLE"),
  addressLine1: text("address_line1").notNull().default(""),
  addressLine2: text("address_line2"),
  addressLine3: text("address_line3"),
  postcode: text("postcode").notNull().default(""),
  city: text("city").notNull().default(""),
  stateCode: text("state_code").notNull().default("14"),
  countryCode: text("country_code").notNull().default("MYS"),
  phone: text("phone").notNull().default(""),
  email: text("email"),
  baseCurrency: text("base_currency").notNull().default("MYR"),
  sstRegistered: boolean("sst_registered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Key/value store for app configuration (MyInvois credentials, numbering
// formats, default GL account mappings). Secrets are encrypted with APP_SECRET
// before being stored (see src/server/settings/secrets.ts).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  payload: jsonb("payload"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
