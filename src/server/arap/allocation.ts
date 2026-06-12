import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { allocations, purchaseDocuments, salesDocuments } from "@/db/schema";
import { D, toDb2, ZERO } from "@/lib/money";

// Open balance of an invoice/bill = total - sum(allocations targeting it).

export interface OpenDocument {
  id: string;
  docNo: string | null;
  docType: string;
  docDate: string;
  total: string;
  allocated: string;
  openBalance: string;
}

/** Issued, not-cancelled invoices/debit notes with a positive open balance. */
export async function openSalesInvoices(customerId: string): Promise<OpenDocument[]> {
  const rows = await db
    .select({
      id: salesDocuments.id,
      docNo: salesDocuments.docNo,
      docType: salesDocuments.docType,
      docDate: salesDocuments.docDate,
      total: salesDocuments.total,
      allocated: sql<string>`coalesce((
        select sum(a.amount) from allocations a where a.target_document_id = ${salesDocuments.id}
      ), 0)`,
    })
    .from(salesDocuments)
    .where(
      and(
        eq(salesDocuments.customerId, customerId),
        eq(salesDocuments.status, "issued"),
        inArray(salesDocuments.docType, ["INVOICE", "DEBIT_NOTE"]),
      ),
    )
    .orderBy(asc(salesDocuments.docDate), asc(salesDocuments.docNo));

  return rows
    .map((r) => ({ ...r, openBalance: toDb2(D(r.total).minus(D(r.allocated))) }))
    .filter((r) => D(r.openBalance).gt(0))
    .map((r) => ({ ...r, allocated: toDb2(D(r.allocated)) }));
}

/** Issued, not-cancelled supplier bills with a positive open balance. */
export async function openPurchaseBills(supplierId: string): Promise<OpenDocument[]> {
  const rows = await db
    .select({
      id: purchaseDocuments.id,
      docNo: purchaseDocuments.docNo,
      docType: purchaseDocuments.docType,
      docDate: purchaseDocuments.docDate,
      total: purchaseDocuments.total,
      allocated: sql<string>`coalesce((
        select sum(a.amount) from allocations a where a.target_document_id = ${purchaseDocuments.id}
      ), 0)`,
    })
    .from(purchaseDocuments)
    .where(
      and(
        eq(purchaseDocuments.supplierId, supplierId),
        eq(purchaseDocuments.status, "issued"),
        eq(purchaseDocuments.docType, "SUPPLIER_BILL"),
      ),
    )
    .orderBy(asc(purchaseDocuments.docDate), asc(purchaseDocuments.docNo));

  return rows
    .map((r) => ({ ...r, openBalance: toDb2(D(r.total).minus(D(r.allocated))) }))
    .filter((r) => D(r.openBalance).gt(0))
    .map((r) => ({ ...r, allocated: toDb2(D(r.allocated)) }));
}

export type AllocationType = "receipt" | "payment" | "credit_note";

/** Total already allocated FROM a source (receipt/payment/credit note). */
export async function sourceAllocatedTotal(
  tx: Tx,
  type: AllocationType,
  sourceId: string,
): Promise<string> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${allocations.amount}), 0)` })
    .from(allocations)
    .where(and(eq(allocations.type, type), eq(allocations.sourceId, sourceId)));
  return toDb2(D(row?.total ?? 0));
}

/** Remaining unallocated portion of a source given its full amount. */
export async function sourceRemaining(
  tx: Tx,
  type: AllocationType,
  sourceId: string,
  sourceAmount: string,
): Promise<string> {
  const allocated = await sourceAllocatedTotal(tx, type, sourceId);
  return toDb2(D(sourceAmount).minus(D(allocated)));
}

/**
 * Knock an amount off a target document inside the caller's transaction.
 * Throws if the amount is not positive or exceeds the target's open balance.
 */
export async function allocate(
  tx: Tx,
  input: {
    type: AllocationType;
    sourceId: string;
    targetDocumentId: string;
    amount: string;
  },
): Promise<void> {
  const amount = D(input.amount);
  if (amount.lte(ZERO)) throw new Error("Allocation amount must be greater than zero");

  // Receipts and credit notes knock off sales documents; payments knock off bills.
  const doc =
    input.type === "payment"
      ? await tx.query.purchaseDocuments.findFirst({
          where: eq(purchaseDocuments.id, input.targetDocumentId),
        })
      : await tx.query.salesDocuments.findFirst({
          where: eq(salesDocuments.id, input.targetDocumentId),
        });
  if (!doc) throw new Error("Allocation target document not found");
  if (doc.status !== "issued") throw new Error(`Cannot allocate to a ${doc.status} document`);

  const [allocRow] = await tx
    .select({ total: sql<string>`coalesce(sum(${allocations.amount}), 0)` })
    .from(allocations)
    .where(eq(allocations.targetDocumentId, input.targetDocumentId));
  const open = D(doc.total).minus(D(allocRow?.total ?? 0));

  if (amount.gt(open)) {
    throw new Error(
      `Allocation of ${toDb2(amount)} to ${doc.docNo ?? doc.id} exceeds its open balance of ${toDb2(open)}`,
    );
  }

  await tx.insert(allocations).values({
    type: input.type,
    sourceId: input.sourceId,
    targetDocumentId: input.targetDocumentId,
    amount: toDb2(amount),
  });
}
