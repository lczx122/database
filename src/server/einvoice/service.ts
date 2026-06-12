import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  einvoiceSubmissions,
  salesDocuments,
  salesDocumentLines,
  type EinvoiceErrorDetail,
} from "@/db/schema";
import { getCompanyProfile, getMyinvoisSettings } from "@/server/settings";
import { utcIssueDateTime, hoursSince } from "@/lib/dates";
import { buildUblInvoice } from "./ubl/builder";
import type { UblInvoiceInput, UblPartyInput } from "./ubl/types";
import { loadCertificate } from "./signing/certificate";
import { signUblDocument } from "./signing/signer";
import {
  getConfig,
  submitDocument,
  getSubmission,
  getDocumentDetails,
  cancelDocument,
  validationUrl,
} from "./api/client";
import type { MyinvoisError } from "./api/types";
import { preflightInvoice } from "./preflight";

const DOC_TYPE_TO_EINVOICE_CODE: Record<string, string> = {
  INVOICE: "01",
  CREDIT_NOTE: "02",
  DEBIT_NOTE: "03",
};

export const CANCELLATION_WINDOW_HOURS = 72;

function flattenErrors(error: MyinvoisError | undefined): EinvoiceErrorDetail[] {
  if (!error) return [{ message: "Unknown error" }];
  const out: EinvoiceErrorDetail[] = [];
  const walk = (e: MyinvoisError) => {
    if (e.message) {
      out.push({
        code: e.code,
        message: e.message,
        target: e.target,
        propertyPath: e.propertyPath ?? undefined,
      });
    }
    e.details?.forEach(walk);
  };
  walk(error);
  return out.length > 0 ? out : [{ message: "Unknown error" }];
}

async function loadDocument(documentId: string) {
  const doc = await db.query.salesDocuments.findFirst({ where: eq(salesDocuments.id, documentId) });
  if (!doc) throw new Error("Document not found");
  const lines = await db.query.salesDocumentLines.findMany({
    where: eq(salesDocumentLines.documentId, documentId),
    orderBy: (t, { asc }) => [asc(t.lineNo)],
  });
  return { doc, lines };
}

/**
 * Submit an issued sales document to MyInvois. Creates a new submission row
 * each time (resubmission after `invalid` keeps history).
 */
export async function submitToMyinvois(documentId: string): Promise<{ submissionId: string }> {
  const { doc, lines } = await loadDocument(documentId);
  const company = await getCompanyProfile();
  const settings = await getMyinvoisSettings();

  const einvoiceTypeCode = DOC_TYPE_TO_EINVOICE_CODE[doc.docType];
  if (!einvoiceTypeCode) throw new Error(`Document type ${doc.docType} cannot be e-invoiced`);

  const existing = await db.query.einvoiceSubmissions.findMany({
    where: and(
      eq(einvoiceSubmissions.salesDocumentId, documentId),
      inArray(einvoiceSubmissions.status, ["submitting", "submitted", "valid"]),
    ),
  });
  if (existing.length > 0) {
    throw new Error("This document already has an active or valid e-invoice submission");
  }

  const problems = preflightInvoice(company, doc, lines);
  if (problems.length > 0) {
    throw new Error(`e-Invoice pre-flight failed:\n- ${problems.join("\n- ")}`);
  }

  // CN/DN must reference the original invoice's LHDN UUID.
  let billingReference: UblInvoiceInput["billingReference"] = null;
  if (doc.docType === "CREDIT_NOTE" || doc.docType === "DEBIT_NOTE") {
    if (!doc.referenceDocId) throw new Error("Credit/debit notes must reference an original invoice");
    const original = await db.query.einvoiceSubmissions.findFirst({
      where: and(
        eq(einvoiceSubmissions.salesDocumentId, doc.referenceDocId),
        eq(einvoiceSubmissions.status, "valid"),
      ),
      orderBy: desc(einvoiceSubmissions.validatedAt),
    });
    if (!original?.documentUuid) {
      throw new Error("The referenced invoice has no valid e-invoice — submit it first");
    }
    billingReference = { lhdnUuid: original.documentUuid, internalId: original.internalId };
  }

  const buyer = doc.partySnapshot!;
  const supplierParty: UblPartyInput = {
    name: company.name,
    tin: company.tin,
    idType: "BRN",
    idValue: company.brn,
    sstNo: company.sstRegistrationNo,
    tourismTaxNo: company.tourismTaxNo,
    msicCode: company.msicCode,
    msicDescription: company.msicDescription,
    email: company.email,
    phone: company.phone,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    addressLine3: company.addressLine3,
    postcode: company.postcode,
    city: company.city,
    stateCode: company.stateCode,
    countryCode: company.countryCode,
  };

  // IssueDate/Time must be close to the submission moment (LHDN rejects
  // stale timestamps), so they are computed here — not at document save.
  const { issueDate, issueTime } = utcIssueDateTime();
  const version = settings.signingEnabled ? "1.1" : "1.0";

  const input: UblInvoiceInput = {
    eInvoiceTypeCode: einvoiceTypeCode,
    version,
    internalId: doc.docNo!,
    issueDate,
    issueTime,
    currencyCode: doc.currencyCode,
    supplier: supplierParty,
    buyer: { ...buyer, msicCode: null, msicDescription: null, tourismTaxNo: null },
    lines: lines.map((l) => ({
      lineNo: l.lineNo,
      description: l.description,
      classificationCode: l.classificationCode,
      quantity: l.quantity,
      uomCode: l.uomCode,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount,
      taxTypeCode: l.taxTypeCode,
      taxRate: l.taxRate,
      taxExemptionReason: l.taxExemptionReason,
      taxAmount: l.taxAmount,
      lineSubtotal: l.lineSubtotal,
    })),
    subtotal: doc.subtotal,
    taxTotal: doc.taxTotal,
    rounding: doc.rounding,
    total: doc.total,
    paymentModeCode: doc.paymentModeCode,
    paymentTermsNote: doc.paymentTermsDays > 0 ? `Payment within ${doc.paymentTermsDays} days` : null,
    billingReference,
  };

  let payload = buildUblInvoice(input);
  let signed = false;
  if (settings.signingEnabled) {
    if (!settings.signingCertPem || !settings.signingKeyPem) {
      throw new Error("Signing is enabled but no certificate/key is configured in Settings → e-Invoice");
    }
    payload = signUblDocument(payload, loadCertificate(settings.signingCertPem, settings.signingKeyPem));
    signed = true;
  }

  const [submission] = await db
    .insert(einvoiceSubmissions)
    .values({
      salesDocumentId: documentId,
      einvoiceTypeCode,
      version,
      status: "submitting",
      internalId: doc.docNo!,
      payload,
      signed,
      attemptCount: 1,
    })
    .returning();

  try {
    const config = await getConfig();
    const result = await submitDocument(config, payload, doc.docNo!, submission.id);

    if (result.rejected.length > 0) {
      await db
        .update(einvoiceSubmissions)
        .set({
          status: "invalid",
          submissionUid: result.submissionUid ?? null,
          errorDetails: result.rejected.flatMap((r) => flattenErrors(r.error)),
          updatedAt: new Date(),
        })
        .where(eq(einvoiceSubmissions.id, submission.id));
      return { submissionId: submission.id };
    }

    await db
      .update(einvoiceSubmissions)
      .set({
        status: "submitted",
        submissionUid: result.submissionUid,
        documentUuid: result.accepted[0]?.uuid ?? null,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(einvoiceSubmissions.id, submission.id));
    return { submissionId: submission.id };
  } catch (err) {
    await db
      .update(einvoiceSubmissions)
      .set({
        status: "error",
        errorDetails: [{ message: err instanceof Error ? err.message : String(err) }],
        updatedAt: new Date(),
      })
      .where(eq(einvoiceSubmissions.id, submission.id));
    throw err;
  }
}

/** Poll LHDN for the validation outcome of one submission. */
export async function refreshSubmissionStatus(submissionId: string): Promise<void> {
  const submission = await db.query.einvoiceSubmissions.findFirst({
    where: eq(einvoiceSubmissions.id, submissionId),
  });
  if (!submission?.submissionUid || submission.status !== "submitted") return;

  const config = await getConfig();
  const status = await getSubmission(config, submission.submissionUid, submissionId);
  if (status.overallStatus === "InProgress") return;

  const summary = status.documentSummary.find(
    (d) => d.uuid === submission.documentUuid || d.internalId === submission.internalId,
  );
  if (!summary) return;

  if (summary.status === "Valid") {
    await db
      .update(einvoiceSubmissions)
      .set({
        status: "valid",
        documentUuid: summary.uuid,
        longId: summary.longId,
        validatedAt: summary.dateTimeValidated ? new Date(summary.dateTimeValidated) : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(einvoiceSubmissions.id, submissionId));
  } else if (summary.status === "Invalid") {
    // Pull the structured validation errors for the UI.
    let errors: EinvoiceErrorDetail[] = [{ message: "Document failed LHDN validation" }];
    try {
      const details = await getDocumentDetails(config, summary.uuid, submissionId);
      const steps = details.validationResults?.validationSteps ?? [];
      const failed = steps.filter((s) => s.status === "Invalid");
      if (failed.length > 0) {
        errors = failed.flatMap((s) =>
          flattenErrors(s.error).map((e) => ({ ...e, target: e.target ?? s.name })),
        );
      }
    } catch {
      // keep the generic error if details fetch fails
    }
    await db
      .update(einvoiceSubmissions)
      .set({
        status: "invalid",
        documentUuid: summary.uuid,
        errorDetails: errors,
        updatedAt: new Date(),
      })
      .where(eq(einvoiceSubmissions.id, submissionId));
  }
}

/** Cancel a valid e-invoice (allowed within 72 hours of validation). */
export async function cancelEinvoice(submissionId: string, reason: string): Promise<void> {
  const submission = await db.query.einvoiceSubmissions.findFirst({
    where: eq(einvoiceSubmissions.id, submissionId),
  });
  if (!submission) throw new Error("Submission not found");
  if (submission.status !== "valid" || !submission.documentUuid) {
    throw new Error("Only valid e-invoices can be cancelled");
  }
  if (submission.validatedAt && hoursSince(submission.validatedAt) > CANCELLATION_WINDOW_HOURS) {
    throw new Error(
      `The ${CANCELLATION_WINDOW_HOURS}-hour cancellation window has passed — issue a credit note instead`,
    );
  }
  if (!reason.trim()) throw new Error("A cancellation reason is required");

  const config = await getConfig();
  await cancelDocument(config, submission.documentUuid, reason.trim(), submissionId);

  await db
    .update(einvoiceSubmissions)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason.trim(),
      updatedAt: new Date(),
    })
    .where(eq(einvoiceSubmissions.id, submissionId));
}

export async function getValidationLink(submissionId: string): Promise<string | null> {
  const submission = await db.query.einvoiceSubmissions.findFirst({
    where: eq(einvoiceSubmissions.id, submissionId),
  });
  if (!submission?.documentUuid || !submission.longId) return null;
  const config = await getConfig();
  return validationUrl(config.portalBaseUrl, submission.documentUuid, submission.longId);
}

/** Latest submission per document, used by document screens. */
export async function latestSubmissionFor(documentId: string) {
  return db.query.einvoiceSubmissions.findFirst({
    where: eq(einvoiceSubmissions.salesDocumentId, documentId),
    orderBy: desc(einvoiceSubmissions.createdAt),
  });
}
