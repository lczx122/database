import "dotenv/config";
/**
 * End-to-end smoke test against the MyInvois SANDBOX.
 *
 * Prerequisites:
 *  1. Register your sandbox ERP on the MyTax/MyInvois preprod portal and put
 *     the Client ID/Secret in Settings → e-Invoice (environment: sandbox).
 *  2. Fill in Settings → Company Profile (TIN, BRN, MSIC, address, phone).
 *  3. Have at least one seeded customer and item, or run `pnpm db:seed`.
 *
 * Run: pnpm tsx scripts/einvoice-smoke.ts
 *
 * Sequence: token → own-TIN validation → create + issue a test invoice →
 * submit → poll until valid/invalid → print validation link → cancel.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { customers, items, salesDocuments, salesDocumentLines, taxCodes } from "../src/db/schema";
import { getConfig, validateTin } from "../src/server/einvoice/api/client";
import { getToken } from "../src/server/einvoice/api/token";
import {
  submitToMyinvois,
  refreshSubmissionStatus,
  cancelEinvoice,
  getValidationLink,
} from "../src/server/einvoice/service";
import { einvoiceSubmissions } from "../src/db/schema";
import { issueSalesDocument } from "../src/server/documents/service";
import { getCompanyProfile } from "../src/server/settings";
import { calcLine } from "../src/lib/money";
import { todayLocalISO } from "../src/lib/dates";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("1) Loading config + company profile...");
  const config = await getConfig();
  const company = await getCompanyProfile();
  console.log(`   environment base URL: ${config.apiBaseUrl}`);

  console.log("2) Fetching OAuth token...");
  await getToken(config);
  console.log("   token OK");

  console.log("3) Validating own TIN...");
  try {
    const ok = await validateTin(config, company.tin, "BRN", company.brn);
    console.log(`   TIN ${company.tin} valid: ${ok}`);
  } catch (err) {
    console.warn(`   TIN validation skipped/failed: ${err instanceof Error ? err.message : err}`);
  }

  console.log("4) Creating a draft test invoice...");
  const customer = await db.query.customers.findFirst({ where: eq(customers.code, "C-0001") });
  const item = await db.query.items.findFirst({ where: eq(items.code, "ITEM-001") });
  if (!customer || !item) throw new Error("Seed data missing — run pnpm db:seed");
  const tax = item.salesTaxCodeId
    ? await db.query.taxCodes.findFirst({ where: eq(taxCodes.id, item.salesTaxCodeId) })
    : null;

  const line = calcLine({ quantity: 1, unitPrice: item.unitPrice, taxRate: tax?.rate ?? 0 });
  const [doc] = await db
    .insert(salesDocuments)
    .values({
      docType: "INVOICE",
      docDate: todayLocalISO(),
      customerId: customer.id,
      subtotal: line.subtotal.toFixed(2),
      taxTotal: line.taxAmount.toFixed(2),
      total: line.total.toFixed(2),
      paymentModeCode: "03",
    })
    .returning();
  await db.insert(salesDocumentLines).values({
    documentId: doc.id,
    lineNo: 1,
    itemId: item.id,
    description: item.description ?? item.name,
    classificationCode: item.classificationCode,
    quantity: "1.0000",
    uomCode: item.uomCode,
    unitPrice: item.unitPrice,
    taxCodeId: tax?.id,
    taxTypeCode: tax?.myinvoisTaxTypeCode ?? "06",
    taxRate: tax?.rate ?? "0",
    taxAmount: line.taxAmount.toFixed(2),
    lineSubtotal: line.subtotal.toFixed(2),
    lineTotal: line.total.toFixed(2),
  });

  const { docNo } = await issueSalesDocument(doc.id);
  console.log(`   issued ${docNo}`);

  console.log("5) Submitting to MyInvois sandbox...");
  const { submissionId } = await submitToMyinvois(doc.id);

  console.log("6) Polling for validation result...");
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    await refreshSubmissionStatus(submissionId);
    const sub = await db.query.einvoiceSubmissions.findFirst({
      where: eq(einvoiceSubmissions.id, submissionId),
    });
    console.log(`   status: ${sub?.status}`);
    if (sub?.status === "valid") {
      console.log(`   LHDN UUID: ${sub.documentUuid}`);
      console.log(`   validation link: ${await getValidationLink(submissionId)}`);
      console.log("7) Cancelling the test e-invoice...");
      await cancelEinvoice(submissionId, "Smoke test document");
      console.log("   cancelled — smoke test PASSED");
      process.exit(0);
    }
    if (sub?.status === "invalid" || sub?.status === "error") {
      console.error("   FAILED — LHDN errors:");
      console.error(JSON.stringify(sub.errorDetails, null, 2));
      process.exit(1);
    }
  }
  console.error("Timed out waiting for validation");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
