import {
  pgTable,
  uuid,
  text,
  boolean,
  numeric,
  date,
  timestamp,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const accountTypeEnum = ["asset", "liability", "equity", "income", "expense"] as const;

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type", { enum: accountTypeEnum }).notNull(),
  parentId: uuid("parent_id").references((): AnyPgColumn => accounts.id),
  // System accounts (AR/AP control, SST payable, stock, ...) are referenced by
  // the posting engine and cannot be deleted.
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryNo: text("entry_no").notNull().unique(),
  entryDate: date("entry_date").notNull(),
  description: text("description").notNull().default(""),
  sourceType: text("source_type", {
    enum: ["manual", "sales_doc", "purchase_doc", "receipt", "payment", "stock_adj"],
  }).notNull().default("manual"),
  sourceId: uuid("source_id"),
  status: text("status", { enum: ["posted", "reversed"] }).notNull().default("posted"),
  reversedById: uuid("reversed_by_id").references((): AnyPgColumn => journalEntries.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
    credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
    description: text("description").notNull().default(""),
    // Sub-ledger drill-down for AR/AP control accounts.
    partyType: text("party_type", { enum: ["customer", "supplier"] }),
    partyId: uuid("party_id"),
  },
  (t) => [
    check("journal_lines_one_side", sql`${t.debit} = 0 OR ${t.credit} = 0`),
    check("journal_lines_non_negative", sql`${t.debit} >= 0 AND ${t.credit} >= 0`),
  ],
);
