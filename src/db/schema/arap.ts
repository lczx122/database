import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { customers, suppliers } from "./master";
import { accounts, journalEntries } from "./gl";

// Customer receipts (money in) and supplier payments (money out).

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  docNo: text("doc_no").unique(),
  docDate: date("doc_date").notNull(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  bankAccountId: uuid("bank_account_id").notNull().references(() => accounts.id),
  paymentModeCode: text("payment_mode_code").notNull().default("01"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  reference: text("reference"),
  status: text("status", { enum: ["issued", "cancelled"] }).notNull().default("issued"),
  postedJournalEntryId: uuid("posted_journal_entry_id").references(() => journalEntries.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  docNo: text("doc_no").unique(),
  docDate: date("doc_date").notNull(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  bankAccountId: uuid("bank_account_id").notNull().references(() => accounts.id),
  paymentModeCode: text("payment_mode_code").notNull().default("01"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  reference: text("reference"),
  status: text("status", { enum: ["issued", "cancelled"] }).notNull().default("issued"),
  postedJournalEntryId: uuid("posted_journal_entry_id").references(() => journalEntries.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Knock-off of receipts/payments/credit notes against open documents.
// Open balance of an invoice = total - sum(allocations targeting it).
export const allocations = pgTable("allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type", { enum: ["receipt", "payment", "credit_note"] }).notNull(),
  sourceId: uuid("source_id").notNull(),
  targetDocumentId: uuid("target_document_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  allocatedAt: timestamp("allocated_at", { withTimezone: true }).notNull().defaultNow(),
});
