import { sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { documentCounters } from "@/db/schema";

export const DEFAULT_COUNTERS: Record<string, { prefix: string; padding: number }> = {
  INVOICE: { prefix: "INV-", padding: 5 },
  CREDIT_NOTE: { prefix: "CN-", padding: 5 },
  DEBIT_NOTE: { prefix: "DN-", padding: 5 },
  DELIVERY_ORDER: { prefix: "DO-", padding: 5 },
  PURCHASE_ORDER: { prefix: "PO-", padding: 5 },
  SUPPLIER_BILL: { prefix: "BILL-", padding: 5 },
  RECEIPT: { prefix: "OR-", padding: 5 },
  PAYMENT: { prefix: "PV-", padding: 5 },
  JOURNAL: { prefix: "JV-", padding: 5 },
  STOCK_ADJ: { prefix: "ADJ-", padding: 5 },
};

/**
 * Allocate the next document number inside the caller's transaction. The
 * UPDATE ... RETURNING on the counter row serializes concurrent issuers.
 */
export async function nextDocNo(tx: Tx, docType: string): Promise<string> {
  const defaults = DEFAULT_COUNTERS[docType] ?? { prefix: `${docType}-`, padding: 5 };

  await tx
    .insert(documentCounters)
    .values({ docType, prefix: defaults.prefix, padding: defaults.padding, nextNumber: 1 })
    .onConflictDoNothing();

  const [counter] = await tx
    .update(documentCounters)
    .set({ nextNumber: sql`${documentCounters.nextNumber} + 1` })
    .where(sql`${documentCounters.docType} = ${docType}`)
    .returning();

  const number = counter.nextNumber - 1;
  return `${counter.prefix}${String(number).padStart(counter.padding, "0")}`;
}
