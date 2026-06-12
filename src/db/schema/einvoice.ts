import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { salesDocuments, purchaseDocuments } from "./sales";

export const einvoiceStatusEnum = [
  "draft",
  "submitting",
  "submitted", // accepted by LHDN, awaiting validation
  "valid",
  "invalid",
  "cancelled",
  "error", // network/transport failure before acceptance
] as const;

export type EinvoiceStatus = (typeof einvoiceStatusEnum)[number];

export interface EinvoiceErrorDetail {
  code?: string;
  message: string;
  target?: string;
  propertyPath?: string;
}

export const einvoiceSubmissions = pgTable("einvoice_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  salesDocumentId: uuid("sales_document_id").references(() => salesDocuments.id),
  // Self-billed e-invoices (type codes 11-14) reference a purchase document.
  purchaseDocumentId: uuid("purchase_document_id").references(() => purchaseDocuments.id),
  einvoiceTypeCode: text("einvoice_type_code").notNull(), // 01-04, 11-14
  version: text("version").notNull().default("1.0"), // 1.0 unsigned, 1.1 signed
  status: text("status", { enum: einvoiceStatusEnum }).notNull().default("draft"),
  internalId: text("internal_id").notNull(), // our doc_no, sent as codeNumber
  submissionUid: text("submission_uid"),
  documentUuid: text("document_uuid"),
  longId: text("long_id"),
  documentHash: text("document_hash"),
  payload: jsonb("payload"), // exact UBL JSON submitted
  signed: boolean("signed").notNull().default(false),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  errorDetails: jsonb("error_details").$type<EinvoiceErrorDetail[] | null>(),
  attemptCount: integer("attempt_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const einvoiceApiLog = pgTable("einvoice_api_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").references(() => einvoiceSubmissions.id),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  httpStatus: integer("http_status"),
  request: jsonb("request"), // secrets redacted before insert
  response: jsonb("response"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
