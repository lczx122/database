"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { customers, einvoiceSubmissions, salesDocuments, salesDocumentLines } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { issueSalesDocument, cancelSalesDocument } from "@/server/documents/service";
import {
  submitToMyinvois,
  refreshSubmissionStatus,
  cancelEinvoice,
} from "@/server/einvoice/service";
import { D, calcLine, calcDocumentTotals, toDb2, toDb4 } from "@/lib/money";
import {
  ACTIVE_EINVOICE_STATUSES,
  isSalesDocType,
  salesBasePath,
  SALES_DOC_TYPES,
  type SalesDocType,
} from "./doc-config";

export interface SaveDocumentState {
  error: string | null;
}

interface RawLine {
  itemId?: string;
  description?: string;
  classificationCode?: string;
  quantity?: string;
  uomCode?: string;
  unitPrice?: string;
  discountAmount?: string;
  taxCodeId?: string;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Create or update a draft sales document. Lines come in as JSON from the
 * client editor; every amount is recomputed here with Decimal math — client
 * numbers are display-only and never trusted.
 */
export async function saveDocumentAction(
  _prev: SaveDocumentState,
  formData: FormData,
): Promise<SaveDocumentState> {
  await requireUser();

  const docTypeRaw = String(formData.get("docType") ?? "");
  if (!isSalesDocType(docTypeRaw)) return { error: "Invalid document type" };
  const docType: SalesDocType = docTypeRaw;
  const base = salesBasePath(docType);

  const documentId = String(formData.get("documentId") ?? "").trim() || null;
  const customerId = String(formData.get("customerId") ?? "").trim();
  const docDate = String(formData.get("docDate") ?? "").trim();
  const paymentModeCode = String(formData.get("paymentModeCode") ?? "01").trim() || "01";
  const paymentTermsRaw = String(formData.get("paymentTermsDays") ?? "30").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const referenceDocId = String(formData.get("referenceDocId") ?? "").trim() || null;

  if (!customerId) return { error: "Please select a customer" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) return { error: "Please enter a valid document date" };
  const paymentTermsDays = Number.parseInt(paymentTermsRaw, 10);
  if (!Number.isFinite(paymentTermsDays) || paymentTermsDays < 0) {
    return { error: "Payment terms must be a non-negative number of days" };
  }

  const customer = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
  if (!customer) return { error: "Selected customer not found" };

  if (docType !== "INVOICE") {
    if (!referenceDocId) {
      return { error: `A ${SALES_DOC_TYPES[docType].singular.toLowerCase()} must reference an issued invoice` };
    }
    const reference = await db.query.salesDocuments.findFirst({
      where: eq(salesDocuments.id, referenceDocId),
    });
    if (
      !reference ||
      reference.docType !== "INVOICE" ||
      reference.status !== "issued" ||
      reference.customerId !== customerId
    ) {
      return { error: "The referenced document must be an issued invoice belonging to the selected customer" };
    }
  }

  let rawLines: RawLine[];
  try {
    const parsed = JSON.parse(String(formData.get("lines") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error("not an array");
    rawLines = parsed as RawLine[];
  } catch {
    return { error: "Could not read document lines — please try again" };
  }

  // Drop fully empty rows, then require at least one real line.
  const usable = rawLines.filter(
    (l) => (l.description ?? "").trim() !== "" || (l.itemId ?? "") !== "" || D(l.quantity || 0).times(D(l.unitPrice || 0)).abs().greaterThan(0),
  );
  if (usable.length === 0) return { error: "Add at least one line" };

  const taxRows = await db.query.taxCodes.findMany();
  const taxById = new Map(taxRows.map((t) => [t.id, t]));

  let preparedLines;
  try {
    preparedLines = usable.map((l, idx) => {
      const description = (l.description ?? "").trim();
      if (!description) throw new Error(`Line ${idx + 1}: description is required`);
      const quantity = D(l.quantity || 0);
      const unitPrice = D(l.unitPrice || 0);
      const discountAmount = D(l.discountAmount || 0);
      if (quantity.lessThanOrEqualTo(0)) throw new Error(`Line ${idx + 1}: quantity must be greater than zero`);
      if (discountAmount.lessThan(0)) throw new Error(`Line ${idx + 1}: discount cannot be negative`);

      const tax = l.taxCodeId ? taxById.get(l.taxCodeId) : undefined;
      if (l.taxCodeId && !tax) throw new Error(`Line ${idx + 1}: unknown tax code`);
      const taxRate = tax?.rate ?? "0";
      const totals = calcLine({
        quantity: l.quantity || "0",
        unitPrice: l.unitPrice || "0",
        discountAmount: l.discountAmount || "0",
        taxRate,
      });

      return {
        row: {
          lineNo: idx + 1,
          itemId: l.itemId || null,
          description,
          classificationCode: (l.classificationCode ?? "").trim() || "022",
          quantity: toDb4(quantity),
          uomCode: (l.uomCode ?? "").trim() || "C62",
          unitPrice: toDb2(unitPrice),
          discountAmount: toDb2(discountAmount),
          taxCodeId: tax?.id ?? null,
          // Snapshot of the tax code at save time — the document must keep
          // these values even if the tax code master record changes later.
          taxTypeCode: tax?.myinvoisTaxTypeCode ?? "06",
          taxRate: D(taxRate).toFixed(4),
          taxExemptionReason: tax?.exemptionReason ?? null,
          taxAmount: toDb2(totals.taxAmount),
          lineSubtotal: toDb2(totals.subtotal),
          lineTotal: toDb2(totals.total),
        },
        computed: totals,
      };
    });
  } catch (err) {
    return { error: errMessage(err) };
  }

  const docTotals = calcDocumentTotals(preparedLines.map((l) => l.computed));
  const header = {
    docDate,
    customerId,
    paymentModeCode,
    paymentTermsDays,
    notes,
    referenceDocId: docType === "INVOICE" ? null : referenceDocId,
    subtotal: toDb2(docTotals.subtotal),
    taxTotal: toDb2(docTotals.taxTotal),
    total: toDb2(docTotals.total),
    updatedAt: new Date(),
  };

  let savedId: string;
  try {
    savedId = await db.transaction(async (tx) => {
      let id = documentId;
      if (id) {
        const existing = await tx.query.salesDocuments.findFirst({ where: eq(salesDocuments.id, id) });
        if (!existing || existing.docType !== docType) throw new Error("Document not found");
        if (existing.status !== "draft") throw new Error("Only draft documents can be edited");
        await tx.update(salesDocuments).set(header).where(eq(salesDocuments.id, id));
        await tx.delete(salesDocumentLines).where(eq(salesDocumentLines.documentId, id));
      } else {
        const [created] = await tx
          .insert(salesDocuments)
          .values({ ...header, docType, status: "draft" })
          .returning({ id: salesDocuments.id });
        id = created.id;
      }
      await tx.insert(salesDocumentLines).values(
        preparedLines.map((l) => ({ ...l.row, documentId: id! })),
      );
      return id!;
    });
  } catch (err) {
    return { error: errMessage(err) };
  }

  revalidatePath(base);
  revalidatePath(`${base}/${savedId}`);
  redirect(`${base}/${savedId}?success=${encodeURIComponent("Draft saved")}`);
}

function detailContext(formData: FormData): { id: string; base: string } {
  const docTypeRaw = String(formData.get("docType") ?? "");
  const id = String(formData.get("documentId") ?? "");
  if (!isSalesDocType(docTypeRaw) || !id) redirect("/sales/invoices");
  return { id, base: salesBasePath(docTypeRaw) };
}

function finish(base: string, id: string, error: string | null, success: string | null): never {
  revalidatePath(base);
  revalidatePath(`${base}/${id}`);
  revalidatePath("/einvoice");
  if (error) redirect(`${base}/${id}?error=${encodeURIComponent(error)}`);
  redirect(`${base}/${id}?success=${encodeURIComponent(success ?? "Done")}`);
}

export async function issueDocumentAction(formData: FormData): Promise<void> {
  await requireUser();
  const { id, base } = detailContext(formData);
  let error: string | null = null;
  let success: string | null = null;
  try {
    const { docNo } = await issueSalesDocument(id);
    success = `Document issued as ${docNo}`;
  } catch (err) {
    error = errMessage(err);
  }
  finish(base, id, error, success);
}

export async function cancelDocumentAction(formData: FormData): Promise<void> {
  await requireUser();
  const { id, base } = detailContext(formData);
  let error: string | null = null;
  let success: string | null = null;

  const activeSubmission = await db.query.einvoiceSubmissions.findFirst({
    where: and(
      eq(einvoiceSubmissions.salesDocumentId, id),
      inArray(einvoiceSubmissions.status, [...ACTIVE_EINVOICE_STATUSES]),
    ),
  });
  if (activeSubmission) {
    error =
      "This document has an active e-invoice submission — cancel the e-invoice with LHDN first, then cancel the document.";
  } else {
    try {
      await cancelSalesDocument(id);
      success = "Document cancelled";
    } catch (err) {
      error = errMessage(err);
    }
  }
  finish(base, id, error, success);
}

export async function submitEinvoiceAction(formData: FormData): Promise<void> {
  await requireUser();
  const { id, base } = detailContext(formData);
  let error: string | null = null;
  let success: string | null = null;
  try {
    await submitToMyinvois(id);
    success = "Submitted to LHDN — refresh status to check the validation outcome";
  } catch (err) {
    error = errMessage(err);
  }
  finish(base, id, error, success);
}

export async function refreshEinvoiceAction(formData: FormData): Promise<void> {
  await requireUser();
  const { id, base } = detailContext(formData);
  const submissionId = String(formData.get("submissionId") ?? "");
  let error: string | null = null;
  let success: string | null = null;
  try {
    if (!submissionId) throw new Error("Missing submission");
    await refreshSubmissionStatus(submissionId);
    success = "Status refreshed";
  } catch (err) {
    error = errMessage(err);
  }
  finish(base, id, error, success);
}

export async function cancelEinvoiceAction(formData: FormData): Promise<void> {
  await requireUser();
  const { id, base } = detailContext(formData);
  const submissionId = String(formData.get("submissionId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  let error: string | null = null;
  let success: string | null = null;
  try {
    if (!submissionId) throw new Error("Missing submission");
    await cancelEinvoice(submissionId, reason);
    success = "e-Invoice cancelled with LHDN";
  } catch (err) {
    error = errMessage(err);
  }
  finish(base, id, error, success);
}
