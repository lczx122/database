// Shared configuration for the three e-invoiceable sales document types.
// Invoices, credit notes and debit notes share one implementation,
// parameterized by this config.

export type SalesDocType = "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";

export interface SalesDocConfig {
  docType: SalesDocType;
  slug: string;
  singular: string;
  plural: string;
  pdfTitle: string;
}

export const SALES_DOC_TYPES: Record<SalesDocType, SalesDocConfig> = {
  INVOICE: {
    docType: "INVOICE",
    slug: "invoices",
    singular: "Invoice",
    plural: "Invoices",
    pdfTitle: "INVOICE",
  },
  CREDIT_NOTE: {
    docType: "CREDIT_NOTE",
    slug: "credit-notes",
    singular: "Credit Note",
    plural: "Credit Notes",
    pdfTitle: "CREDIT NOTE",
  },
  DEBIT_NOTE: {
    docType: "DEBIT_NOTE",
    slug: "debit-notes",
    singular: "Debit Note",
    plural: "Debit Notes",
    pdfTitle: "DEBIT NOTE",
  },
};

export function isSalesDocType(value: string): value is SalesDocType {
  return value in SALES_DOC_TYPES;
}

export function salesBasePath(docType: SalesDocType): string {
  return `/sales/${SALES_DOC_TYPES[docType].slug}`;
}

/** e-invoice submissions can be active; only these block doc cancellation / resubmission. */
export const ACTIVE_EINVOICE_STATUSES = ["submitting", "submitted", "valid"] as const;
