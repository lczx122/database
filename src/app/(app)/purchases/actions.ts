"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { items, purchaseDocumentLines, purchaseDocuments, taxCodes } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { computeTotalsFromLines, issuePurchaseDocument } from "@/server/documents/service";
import { calcLine, D, toDb2, toDb4 } from "@/lib/money";

export type PurchaseDocType = "SUPPLIER_BILL" | "PURCHASE_ORDER";

export interface PurchaseFormState {
  error: string | null;
}

// "use server" modules may only export async functions, so this stays private.
function purchaseBasePath(docType: PurchaseDocType): string {
  return docType === "PURCHASE_ORDER" ? "/purchases/orders" : "/purchases/bills";
}

function parseDocType(value: unknown): PurchaseDocType | null {
  return value === "SUPPLIER_BILL" || value === "PURCHASE_ORDER" ? value : null;
}

/** Create or update a draft supplier bill / purchase order with its lines. */
export async function savePurchaseDocumentAction(
  _prev: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  await requireUser();

  const docType = parseDocType(formData.get("docType"));
  if (!docType) return { error: "Invalid document type" };
  const documentId = String(formData.get("documentId") ?? "") || null;
  const supplierId = String(formData.get("supplierId") ?? "");
  const docDate = String(formData.get("docDate") ?? "");
  const supplierRef = String(formData.get("supplierRef") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!supplierId) return { error: "Choose a supplier" };
  if (!docDate) return { error: "Date is required" };

  const itemIds = formData.getAll("lineItem").map(String);
  const descriptions = formData.getAll("lineDescription").map(String);
  const quantities = formData.getAll("lineQty").map(String);
  const unitPrices = formData.getAll("lineUnitPrice").map(String);
  const discounts = formData.getAll("lineDiscount").map(String);
  const taxCodeIds = formData.getAll("lineTaxCode").map(String);

  const rawLines = itemIds
    .map((itemId, i) => ({
      itemId,
      description: (descriptions[i] ?? "").trim(),
      quantity: quantities[i] ?? "1",
      unitPrice: unitPrices[i] ?? "0",
      discount: discounts[i] ?? "0",
      taxCodeId: taxCodeIds[i] ?? "",
    }))
    .filter((l) => l.itemId || l.description);

  if (rawLines.length === 0) return { error: "Add at least one line" };
  for (const l of rawLines) {
    if (D(l.quantity).lte(0)) return { error: "Line quantities must be greater than zero" };
    if (D(l.unitPrice).lt(0) || D(l.discount).lt(0)) {
      return { error: "Prices and discounts cannot be negative" };
    }
  }

  let savedId = documentId ?? "";
  try {
    await db.transaction(async (tx) => {
      const taxIds = [...new Set(rawLines.map((l) => l.taxCodeId).filter(Boolean))];
      const taxRows = taxIds.length
        ? await tx.select().from(taxCodes).where(inArray(taxCodes.id, taxIds))
        : [];
      const taxById = new Map(taxRows.map((t) => [t.id, t]));

      const lineItemIds = [...new Set(rawLines.map((l) => l.itemId).filter(Boolean))];
      const itemRows = lineItemIds.length
        ? await tx.select().from(items).where(inArray(items.id, lineItemIds))
        : [];
      const itemById = new Map(itemRows.map((i) => [i.id, i]));

      const lineRecords = rawLines.map((l, idx) => {
        const tax = l.taxCodeId ? taxById.get(l.taxCodeId) : undefined;
        const item = l.itemId ? itemById.get(l.itemId) : undefined;
        const totals = calcLine({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discount,
          taxRate: tax?.rate ?? 0,
        });
        return {
          lineNo: idx + 1,
          itemId: l.itemId || null,
          description: l.description || item?.name || "",
          classificationCode: item?.classificationCode ?? "022",
          quantity: toDb4(D(l.quantity)),
          uomCode: item?.uomCode ?? "C62",
          unitPrice: toDb2(D(l.unitPrice)),
          discountAmount: toDb2(D(l.discount)),
          taxCodeId: tax?.id ?? null,
          taxTypeCode: tax?.myinvoisTaxTypeCode ?? "06",
          taxRate: tax?.rate ?? "0",
          taxExemptionReason: tax?.exemptionReason ?? null,
          taxAmount: toDb2(totals.taxAmount),
          lineSubtotal: toDb2(totals.subtotal),
          lineTotal: toDb2(totals.total),
        };
      });

      const totals = computeTotalsFromLines(lineRecords);

      if (documentId) {
        const doc = await tx.query.purchaseDocuments.findFirst({
          where: eq(purchaseDocuments.id, documentId),
        });
        if (!doc) throw new Error("Document not found");
        if (doc.status !== "draft") throw new Error("Only draft documents can be edited");
        await tx
          .update(purchaseDocuments)
          .set({
            supplierId,
            docDate,
            supplierRef: supplierRef || null,
            notes: notes || null,
            ...totals,
            updatedAt: new Date(),
          })
          .where(eq(purchaseDocuments.id, documentId));
        await tx
          .delete(purchaseDocumentLines)
          .where(eq(purchaseDocumentLines.documentId, documentId));
      } else {
        const [doc] = await tx
          .insert(purchaseDocuments)
          .values({
            docType,
            supplierId,
            docDate,
            supplierRef: supplierRef || null,
            notes: notes || null,
            ...totals,
          })
          .returning();
        savedId = doc.id;
      }

      await tx
        .insert(purchaseDocumentLines)
        .values(lineRecords.map((r) => ({ ...r, documentId: savedId })));
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save document" };
  }

  const base = purchaseBasePath(docType);
  revalidatePath(base);
  redirect(`${base}/${savedId}`);
}

/** Issue a draft bill/PO (GL posting + stock-in handled by the service). */
export async function issuePurchaseAction(formData: FormData): Promise<void> {
  await requireUser();
  const docType = parseDocType(formData.get("docType")) ?? "SUPPLIER_BILL";
  const documentId = String(formData.get("documentId") ?? "");
  const base = purchaseBasePath(docType);

  try {
    await issuePurchaseDocument(documentId);
  } catch (e) {
    redirect(
      `${base}/${documentId}?error=${encodeURIComponent(
        e instanceof Error ? e.message : "Failed to issue document",
      )}`,
    );
  }
  revalidatePath(base);
  revalidatePath(`${base}/${documentId}`);
  revalidatePath("/stock");
  revalidatePath("/gl/journals");
  redirect(`${base}/${documentId}`);
}

/** Delete a draft bill/PO (lines cascade). */
export async function deletePurchaseDraftAction(formData: FormData): Promise<void> {
  await requireUser();
  const docType = parseDocType(formData.get("docType")) ?? "SUPPLIER_BILL";
  const documentId = String(formData.get("documentId") ?? "");
  const base = purchaseBasePath(docType);

  try {
    const doc = await db.query.purchaseDocuments.findFirst({
      where: eq(purchaseDocuments.id, documentId),
    });
    if (!doc) throw new Error("Document not found");
    if (doc.status !== "draft") throw new Error("Only draft documents can be deleted");
    await db.delete(purchaseDocuments).where(eq(purchaseDocuments.id, documentId));
  } catch (e) {
    redirect(
      `${base}/${documentId}?error=${encodeURIComponent(
        e instanceof Error ? e.message : "Failed to delete document",
      )}`,
    );
  }
  revalidatePath(base);
  redirect(base);
}
