import type { companyProfile, salesDocuments, salesDocumentLines } from "@/db/schema";

type Company = typeof companyProfile.$inferSelect;
type SalesDocument = typeof salesDocuments.$inferSelect;
type SalesLine = typeof salesDocumentLines.$inferSelect;

export const GENERAL_PUBLIC_TIN = "EI00000000010";

/**
 * Checks every MyInvois-mandatory field before any API call is made, so the
 * user gets one actionable list instead of a round-trip of LHDN rejections.
 */
export function preflightInvoice(
  company: Company,
  doc: SalesDocument,
  lines: SalesLine[],
): string[] {
  const problems: string[] = [];

  if (!company.tin) problems.push("Company TIN is missing (Settings → Company Profile)");
  if (!company.brn) problems.push("Company BRN is missing (Settings → Company Profile)");
  if (!company.msicCode || company.msicCode === "00000")
    problems.push("Company MSIC code is missing (Settings → Company Profile)");
  if (!company.addressLine1) problems.push("Company address is missing");
  if (!company.city || !company.stateCode) problems.push("Company city/state is missing");
  if (!company.phone) problems.push("Company phone number is missing");

  if (doc.status !== "issued") problems.push("Document must be issued before e-invoice submission");
  if (!doc.docNo) problems.push("Document has no number");

  const buyer = doc.partySnapshot;
  if (!buyer) {
    problems.push("Document has no buyer snapshot — re-issue the document");
  } else {
    if (!buyer.tin) problems.push("Buyer TIN is missing on the customer record");
    if (buyer.tin !== GENERAL_PUBLIC_TIN && !buyer.idValue)
      problems.push("Buyer registration/IC number (BRN/NRIC) is missing");
    if (!buyer.addressLine1 && buyer.tin !== GENERAL_PUBLIC_TIN)
      problems.push("Buyer address is missing");
    if (!buyer.stateCode) problems.push("Buyer state code is missing");
    if (!buyer.countryCode) problems.push("Buyer country code is missing");
  }

  if (lines.length === 0) problems.push("Document has no lines");
  lines.forEach((line) => {
    if (!line.classificationCode)
      problems.push(`Line ${line.lineNo}: classification code is missing`);
    if (!line.uomCode) problems.push(`Line ${line.lineNo}: unit of measurement is missing`);
    if (!line.description) problems.push(`Line ${line.lineNo}: description is missing`);
    if (line.taxTypeCode === "E" && !line.taxExemptionReason)
      problems.push(`Line ${line.lineNo}: tax-exempt lines need an exemption reason`);
  });

  return problems;
}
