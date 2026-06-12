import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  items,
  salesDocuments,
  salesDocumentLines,
  suppliers,
  purchaseDocuments,
  purchaseDocumentLines,
  type PartySnapshot,
} from "@/db/schema";
import { D, sum, toDb2, ZERO } from "@/lib/money";
import { getAccountMappings } from "@/server/settings";
import {
  postingForSalesDocument,
  postingForSupplierBill,
  postingForCogs,
  postJournalEntry,
  reverseJournalEntry,
} from "@/server/gl/posting";
import { applyMovement } from "@/server/stock/costing";
import { nextDocNo } from "./numbering";
import { todayLocalISO } from "@/lib/dates";

function snapshotParty(party: typeof customers.$inferSelect | typeof suppliers.$inferSelect): PartySnapshot {
  return {
    name: party.name,
    tin: party.tin,
    idType: party.idType,
    idValue: party.idValue,
    sstNo: party.sstNo,
    email: party.email,
    phone: party.phone,
    addressLine1: party.addressLine1,
    addressLine2: party.addressLine2,
    addressLine3: party.addressLine3,
    postcode: party.postcode,
    city: party.city,
    stateCode: party.stateCode,
    countryCode: party.countryCode,
  };
}

/**
 * Issue a draft sales document: assign number, freeze the customer snapshot,
 * post to GL, and (for stocked items on invoices/CNs) record stock movements
 * and COGS — all in one transaction.
 */
export async function issueSalesDocument(documentId: string): Promise<{ docNo: string }> {
  return db.transaction(async (tx) => {
    const doc = await tx.query.salesDocuments.findFirst({ where: eq(salesDocuments.id, documentId) });
    if (!doc) throw new Error("Document not found");
    if (doc.status !== "draft") throw new Error("Only draft documents can be issued");

    const lines = await tx.query.salesDocumentLines.findMany({
      where: eq(salesDocumentLines.documentId, documentId),
      orderBy: (t, { asc }) => [asc(t.lineNo)],
    });
    if (lines.length === 0) throw new Error("Cannot issue a document with no lines");

    const customer = await tx.query.customers.findFirst({ where: eq(customers.id, doc.customerId) });
    if (!customer) throw new Error("Customer not found");

    const docNo = doc.docNo ?? (await nextDocNo(tx, doc.docType));

    // GL posting (delivery orders don't post).
    let journalEntryId: string | null = null;
    let cogsTotal = ZERO;

    if (doc.docType !== "DELIVERY_ORDER") {
      const draft = postingForSalesDocument(
        {
          docType: doc.docType as "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE",
          docNo,
          docDate: doc.docDate,
          customerId: customer.id,
          customerName: customer.name,
          subtotal: doc.subtotal,
          taxTotal: doc.taxTotal,
          total: doc.total,
        },
        await getAccountMappings(),
      );
      journalEntryId = await postJournalEntry(tx, draft, doc.id);
    }

    // Stock movements for tracked items: out on invoice/DO, back in on CN.
    if (doc.docType === "INVOICE" || doc.docType === "DELIVERY_ORDER" || doc.docType === "CREDIT_NOTE") {
      for (const line of lines) {
        if (!line.itemId) continue;
        const item = await tx.query.items.findFirst({ where: eq(items.id, line.itemId) });
        if (!item?.trackStock) continue;

        if (doc.docType === "CREDIT_NOTE") {
          const result = await applyMovement(tx, {
            itemId: item.id,
            movementDate: doc.docDate,
            type: "sale",
            sourceType: doc.docType,
            sourceId: doc.id,
            qtyIn: line.quantity,
            unitCost: item.cost,
          });
          cogsTotal = cogsTotal.minus(D(result.totalCost));
        } else {
          const result = await applyMovement(tx, {
            itemId: item.id,
            movementDate: doc.docDate,
            type: "sale",
            sourceType: doc.docType,
            sourceId: doc.id,
            qtyOut: line.quantity,
          });
          cogsTotal = cogsTotal.plus(D(result.totalCost));
        }
      }
    }

    if (!cogsTotal.isZero() && doc.docType !== "DELIVERY_ORDER") {
      const cogsDraft = postingForCogs(
        {
          docNo,
          docDate: doc.docDate,
          cogsAmount: toDb2(cogsTotal.abs()),
          isReversal: cogsTotal.lessThan(0),
        },
        await getAccountMappings(),
      );
      if (cogsDraft) await postJournalEntry(tx, cogsDraft, doc.id);
    }

    await tx
      .update(salesDocuments)
      .set({
        docNo,
        status: "issued",
        partySnapshot: snapshotParty(customer),
        postedJournalEntryId: journalEntryId,
        issuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(salesDocuments.id, documentId));

    return { docNo };
  });
}

/** Cancel an issued sales document and reverse its postings/stock. */
export async function cancelSalesDocument(documentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const doc = await tx.query.salesDocuments.findFirst({ where: eq(salesDocuments.id, documentId) });
    if (!doc) throw new Error("Document not found");
    if (doc.status !== "issued") throw new Error("Only issued documents can be cancelled");

    if (doc.postedJournalEntryId) {
      await reverseJournalEntry(tx, doc.postedJournalEntryId, todayLocalISO());
    }

    // Reverse stock movements.
    const lines = await tx.query.salesDocumentLines.findMany({
      where: eq(salesDocumentLines.documentId, documentId),
    });
    for (const line of lines) {
      if (!line.itemId) continue;
      const item = await tx.query.items.findFirst({ where: eq(items.id, line.itemId) });
      if (!item?.trackStock) continue;
      if (doc.docType === "CREDIT_NOTE") {
        await applyMovement(tx, {
          itemId: item.id,
          movementDate: todayLocalISO(),
          type: "adjustment",
          sourceType: "CANCEL",
          sourceId: doc.id,
          qtyOut: line.quantity,
        });
      } else if (doc.docType === "INVOICE" || doc.docType === "DELIVERY_ORDER") {
        await applyMovement(tx, {
          itemId: item.id,
          movementDate: todayLocalISO(),
          type: "adjustment",
          sourceType: "CANCEL",
          sourceId: doc.id,
          qtyIn: line.quantity,
          unitCost: item.cost,
        });
      }
    }

    await tx
      .update(salesDocuments)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(salesDocuments.id, documentId));
  });
}

/** Issue a supplier bill: number, snapshot, GL posting, stock in. */
export async function issuePurchaseDocument(documentId: string): Promise<{ docNo: string }> {
  return db.transaction(async (tx) => {
    const doc = await tx.query.purchaseDocuments.findFirst({
      where: eq(purchaseDocuments.id, documentId),
    });
    if (!doc) throw new Error("Document not found");
    if (doc.status !== "draft") throw new Error("Only draft documents can be issued");

    const lines = await tx.query.purchaseDocumentLines.findMany({
      where: eq(purchaseDocumentLines.documentId, documentId),
      orderBy: (t, { asc }) => [asc(t.lineNo)],
    });
    if (lines.length === 0) throw new Error("Cannot issue a document with no lines");

    const supplier = await tx.query.suppliers.findFirst({ where: eq(suppliers.id, doc.supplierId) });
    if (!supplier) throw new Error("Supplier not found");

    const docNo = doc.docNo ?? (await nextDocNo(tx, doc.docType));

    let journalEntryId: string | null = null;

    if (doc.docType === "SUPPLIER_BILL") {
      // Stock in for tracked items; the stocked portion posts to Stock.
      let stockAmount = ZERO;
      for (const line of lines) {
        if (!line.itemId) continue;
        const item = await tx.query.items.findFirst({ where: eq(items.id, line.itemId) });
        if (!item?.trackStock) continue;
        const qty = D(line.quantity);
        const unitCost = qty.isZero() ? ZERO : D(line.lineSubtotal).div(qty);
        await applyMovement(tx, {
          itemId: item.id,
          movementDate: doc.docDate,
          type: "purchase",
          sourceType: doc.docType,
          sourceId: doc.id,
          qtyIn: line.quantity,
          unitCost: unitCost.toFixed(6),
        });
        stockAmount = stockAmount.plus(D(line.lineSubtotal));
        // Keep the item's reference cost current.
        await tx.update(items).set({ cost: toDb2(unitCost), updatedAt: new Date() }).where(eq(items.id, item.id));
      }

      const draft = postingForSupplierBill(
        {
          docNo,
          docDate: doc.docDate,
          supplierId: supplier.id,
          supplierName: supplier.name,
          subtotal: doc.subtotal,
          taxTotal: doc.taxTotal,
          total: doc.total,
          stockAmount: toDb2(stockAmount),
        },
        await getAccountMappings(),
      );
      journalEntryId = await postJournalEntry(tx, draft, doc.id);
    }

    await tx
      .update(purchaseDocuments)
      .set({
        docNo,
        status: "issued",
        partySnapshot: snapshotParty(supplier),
        postedJournalEntryId: journalEntryId,
        issuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(purchaseDocuments.id, documentId));

    return { docNo };
  });
}

/** Recompute document totals from its lines (used by save actions). */
export function computeTotalsFromLines(
  lines: Array<{ lineSubtotal: string; taxAmount: string }>,
): { subtotal: string; taxTotal: string; total: string } {
  const subtotal = sum(lines.map((l) => D(l.lineSubtotal)));
  const taxTotal = sum(lines.map((l) => D(l.taxAmount)));
  return {
    subtotal: toDb2(subtotal),
    taxTotal: toDb2(taxTotal),
    total: toDb2(subtotal.plus(taxTotal)),
  };
}
