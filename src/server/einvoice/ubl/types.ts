// MyInvois UBL 2.1 JSON encoding: every element is an array of objects,
// text content under "_", XML attributes as sibling keys.

export interface UblText {
  _: string;
  [attr: string]: string | number;
}

export interface UblNumber {
  _: number;
  [attr: string]: string | number;
}

export type UblElement = Record<string, unknown>;

export interface UblInvoiceDocument {
  _D: string;
  _A: string;
  _B: string;
  Invoice: UblElement[];
}

export interface UblPartyInput {
  name: string;
  tin: string;
  idType: string; // BRN | NRIC | PASSPORT | ARMY
  idValue: string;
  sstNo: string | null;
  tourismTaxNo?: string | null;
  msicCode?: string | null; // supplier only
  msicDescription?: string | null;
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

export interface UblLineInput {
  lineNo: number;
  description: string;
  classificationCode: string;
  quantity: string; // decimal strings from the DB
  uomCode: string;
  unitPrice: string;
  discountAmount: string;
  taxTypeCode: string; // MyInvois tax type: 01, 02, ..., 06, E
  taxRate: string;
  taxExemptionReason: string | null;
  taxAmount: string;
  lineSubtotal: string;
}

export interface UblInvoiceInput {
  // e-Invoice type code: 01 invoice, 02 credit note, 03 debit note,
  // 04 refund note, 11-14 self-billed equivalents.
  eInvoiceTypeCode: string;
  version: "1.0" | "1.1";
  internalId: string; // our document number
  issueDate: string; // yyyy-MM-dd UTC
  issueTime: string; // HH:mm:ssZ UTC
  currencyCode: string;
  supplier: UblPartyInput;
  buyer: UblPartyInput;
  lines: UblLineInput[];
  subtotal: string;
  taxTotal: string;
  rounding: string;
  total: string;
  paymentModeCode: string | null;
  paymentTermsNote: string | null;
  // For credit/debit/refund notes: reference to the original e-invoice.
  billingReference?: { lhdnUuid: string; internalId: string } | null;
}
