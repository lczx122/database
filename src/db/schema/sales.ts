import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { customers, suppliers, items, taxCodes } from "./master";
import { journalEntries } from "./gl";

export const salesDocTypeEnum = ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "DELIVERY_ORDER"] as const;
export const purchaseDocTypeEnum = ["PURCHASE_ORDER", "SUPPLIER_BILL"] as const;
export const docStatusEnum = ["draft", "issued", "cancelled"] as const;

// Party details frozen at issue time — the e-invoice and PDF must reflect the
// customer's data as at issuance even if the master record changes later.
export interface PartySnapshot {
  name: string;
  tin: string;
  idType: string;
  idValue: string;
  sstNo: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  postcode: string;
  city: string;
  stateCode: string;
  countryCode: string;
}

// Factory so each table gets fresh column builders (sharing one object makes
// Drizzle generate colliding constraint names across tables).
const documentColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  docNo: text("doc_no"),
  docDate: date("doc_date").notNull(),
  currencyCode: text("currency_code").notNull().default("MYR"),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }).notNull().default("1"),
  partySnapshot: jsonb("party_snapshot").$type<PartySnapshot | null>(),
  subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
  taxTotal: numeric("tax_total", { precision: 18, scale: 2 }).notNull().default("0"),
  rounding: numeric("rounding", { precision: 18, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 18, scale: 2 }).notNull().default("0"),
  status: text("status", { enum: docStatusEnum }).notNull().default("draft"),
  postedJournalEntryId: uuid("posted_journal_entry_id").references(() => journalEntries.id),
  paymentModeCode: text("payment_mode_code").notNull().default("01"),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  notes: text("notes"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesDocuments = pgTable(
  "sales_documents",
  {
    ...documentColumns(),
    docType: text("doc_type", { enum: salesDocTypeEnum }).notNull().default("INVOICE"),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    // CN/DN reference to the original invoice.
    referenceDocId: uuid("reference_doc_id"),
  },
  (t) => [uniqueIndex("sales_documents_doc_no").on(t.docType, t.docNo)],
);

export const salesDocumentLines = pgTable("sales_document_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => salesDocuments.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),
  itemId: uuid("item_id").references(() => items.id),
  description: text("description").notNull(),
  classificationCode: text("classification_code").notNull().default("022"),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull().default("1"),
  uomCode: text("uom_code").notNull().default("C62"),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  taxCodeId: uuid("tax_code_id").references(() => taxCodes.id),
  taxTypeCode: text("tax_type_code").notNull().default("06"),
  taxRate: numeric("tax_rate", { precision: 9, scale: 4 }).notNull().default("0"),
  taxExemptionReason: text("tax_exemption_reason"),
  taxAmount: numeric("tax_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  lineSubtotal: numeric("line_subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 18, scale: 2 }).notNull().default("0"),
});

export const purchaseDocuments = pgTable(
  "purchase_documents",
  {
    ...documentColumns(),
    docType: text("doc_type", { enum: purchaseDocTypeEnum }).notNull().default("SUPPLIER_BILL"),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    supplierRef: text("supplier_ref"),
    referenceDocId: uuid("reference_doc_id"),
  },
  (t) => [uniqueIndex("purchase_documents_doc_no").on(t.docType, t.docNo)],
);

export const purchaseDocumentLines = pgTable("purchase_document_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => purchaseDocuments.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),
  itemId: uuid("item_id").references(() => items.id),
  description: text("description").notNull(),
  classificationCode: text("classification_code").notNull().default("022"),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull().default("1"),
  uomCode: text("uom_code").notNull().default("C62"),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  taxCodeId: uuid("tax_code_id").references(() => taxCodes.id),
  taxTypeCode: text("tax_type_code").notNull().default("06"),
  taxRate: numeric("tax_rate", { precision: 9, scale: 4 }).notNull().default("0"),
  taxExemptionReason: text("tax_exemption_reason"),
  taxAmount: numeric("tax_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  lineSubtotal: numeric("line_subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 18, scale: 2 }).notNull().default("0"),
});

// Sequential numbering per document type, advanced inside the issue
// transaction so concurrent issues can't collide.
export const documentCounters = pgTable("document_counters", {
  docType: text("doc_type").primaryKey(),
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  padding: integer("padding").notNull().default(5),
});
