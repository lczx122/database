import { eq, inArray } from "drizzle-orm";
import { D, sum, toDb2, ZERO } from "@/lib/money";
import type { Tx } from "@/db";
import { accounts, journalEntries, journalLines } from "@/db/schema";
import type { AccountMappings } from "@/server/settings";
import { nextDocNo } from "@/server/documents/numbering";

export interface JournalLineDraft {
  accountCode: string;
  debit: string; // "0.00" when crediting
  credit: string;
  description: string;
  partyType?: "customer" | "supplier";
  partyId?: string;
}

export interface JournalEntryDraft {
  entryDate: string; // yyyy-MM-dd
  description: string;
  sourceType: "manual" | "sales_doc" | "purchase_doc" | "receipt" | "payment" | "stock_adj";
  sourceId?: string;
  lines: JournalLineDraft[];
}

export function assertBalanced(draft: JournalEntryDraft): void {
  const debits = sum(draft.lines.map((l) => D(l.debit)));
  const credits = sum(draft.lines.map((l) => D(l.credit)));
  if (!debits.equals(credits)) {
    throw new Error(`Journal entry is unbalanced: debits ${debits} != credits ${credits}`);
  }
  if (debits.isZero() && credits.isZero()) {
    throw new Error("Journal entry has no value");
  }
}

/** Pure posting rules — unit-testable without a database. */

export interface SalesPostingInput {
  docType: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";
  docNo: string;
  docDate: string;
  customerId: string;
  customerName: string;
  subtotal: string;
  taxTotal: string;
  total: string;
}

export function postingForSalesDocument(
  doc: SalesPostingInput,
  mapping: AccountMappings,
): JournalEntryDraft {
  // Invoice/DN: DR AR control, CR Sales (+ CR SST payable).
  // Credit note: the exact reverse.
  const isReversal = doc.docType === "CREDIT_NOTE";
  const total = D(doc.total);
  const subtotal = D(doc.subtotal);
  const tax = D(doc.taxTotal);

  const ar: JournalLineDraft = {
    accountCode: mapping.arControl,
    debit: isReversal ? "0.00" : toDb2(total),
    credit: isReversal ? toDb2(total) : "0.00",
    description: `${doc.docNo} ${doc.customerName}`,
    partyType: "customer",
    partyId: doc.customerId,
  };
  const sales: JournalLineDraft = {
    accountCode: mapping.sales,
    debit: isReversal ? toDb2(subtotal) : "0.00",
    credit: isReversal ? "0.00" : toDb2(subtotal),
    description: doc.docNo,
  };

  const lines = [ar, sales];
  if (!tax.equals(ZERO)) {
    lines.push({
      accountCode: mapping.sstPayable,
      debit: isReversal ? toDb2(tax) : "0.00",
      credit: isReversal ? "0.00" : toDb2(tax),
      description: `${doc.docNo} SST`,
    });
  }

  return {
    entryDate: doc.docDate,
    description: `${doc.docType} ${doc.docNo} — ${doc.customerName}`,
    sourceType: "sales_doc",
    lines,
  };
}

export interface PurchasePostingInput {
  docNo: string;
  docDate: string;
  supplierId: string;
  supplierName: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  /** Portion of the subtotal that is stocked goods (DR Stock instead of expense). */
  stockAmount: string;
}

export function postingForSupplierBill(
  doc: PurchasePostingInput,
  mapping: AccountMappings,
): JournalEntryDraft {
  const stockAmount = D(doc.stockAmount);
  const expenseAmount = D(doc.subtotal).minus(stockAmount).plus(D(doc.taxTotal));

  const lines: JournalLineDraft[] = [];
  if (stockAmount.greaterThan(0)) {
    lines.push({
      accountCode: mapping.stock,
      debit: toDb2(stockAmount),
      credit: "0.00",
      description: `${doc.docNo} stock received`,
    });
  }
  if (expenseAmount.greaterThan(0)) {
    lines.push({
      accountCode: mapping.cogs,
      debit: toDb2(expenseAmount),
      credit: "0.00",
      description: doc.docNo,
    });
  }
  lines.push({
    accountCode: mapping.apControl,
    debit: "0.00",
    credit: toDb2(D(doc.total)),
    description: `${doc.docNo} ${doc.supplierName}`,
    partyType: "supplier",
    partyId: doc.supplierId,
  });

  return {
    entryDate: doc.docDate,
    description: `SUPPLIER_BILL ${doc.docNo} — ${doc.supplierName}`,
    sourceType: "purchase_doc",
    lines,
  };
}

export function postingForReceipt(input: {
  docNo: string;
  docDate: string;
  customerId: string;
  customerName: string;
  amount: string;
  bankAccountCode: string;
  arControlCode: string;
}): JournalEntryDraft {
  return {
    entryDate: input.docDate,
    description: `RECEIPT ${input.docNo} — ${input.customerName}`,
    sourceType: "receipt",
    lines: [
      {
        accountCode: input.bankAccountCode,
        debit: toDb2(D(input.amount)),
        credit: "0.00",
        description: input.docNo,
      },
      {
        accountCode: input.arControlCode,
        debit: "0.00",
        credit: toDb2(D(input.amount)),
        description: `${input.docNo} ${input.customerName}`,
        partyType: "customer",
        partyId: input.customerId,
      },
    ],
  };
}

export function postingForPayment(input: {
  docNo: string;
  docDate: string;
  supplierId: string;
  supplierName: string;
  amount: string;
  bankAccountCode: string;
  apControlCode: string;
}): JournalEntryDraft {
  return {
    entryDate: input.docDate,
    description: `PAYMENT ${input.docNo} — ${input.supplierName}`,
    sourceType: "payment",
    lines: [
      {
        accountCode: input.apControlCode,
        debit: toDb2(D(input.amount)),
        credit: "0.00",
        description: `${input.docNo} ${input.supplierName}`,
        partyType: "supplier",
        partyId: input.supplierId,
      },
      {
        accountCode: input.bankAccountCode,
        debit: "0.00",
        credit: toDb2(D(input.amount)),
        description: input.docNo,
      },
    ],
  };
}

/** COGS recognition when stocked goods leave on an issued invoice. */
export function postingForCogs(input: {
  docNo: string;
  docDate: string;
  cogsAmount: string;
  isReversal: boolean;
}, mapping: AccountMappings): JournalEntryDraft | null {
  const amount = D(input.cogsAmount);
  if (amount.isZero()) return null;
  const dr = input.isReversal ? mapping.stock : mapping.cogs;
  const cr = input.isReversal ? mapping.cogs : mapping.stock;
  return {
    entryDate: input.docDate,
    description: `COGS ${input.docNo}`,
    sourceType: "stock_adj",
    lines: [
      { accountCode: dr, debit: toDb2(amount), credit: "0.00", description: input.docNo },
      { accountCode: cr, debit: "0.00", credit: toDb2(amount), description: input.docNo },
    ],
  };
}

/** Persist a draft inside the caller's transaction; returns the entry id. */
export async function postJournalEntry(tx: Tx, draft: JournalEntryDraft, sourceId?: string): Promise<string> {
  assertBalanced(draft);

  const codes = [...new Set(draft.lines.map((l) => l.accountCode))];
  const accountRows = await tx
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(inArray(accounts.code, codes));
  const byCode = new Map(accountRows.map((a) => [a.code, a.id]));
  for (const code of codes) {
    if (!byCode.has(code)) throw new Error(`GL account ${code} not found — check Settings → Account Mappings`);
  }

  const entryNo = await nextDocNo(tx, "JOURNAL");
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      entryNo,
      entryDate: draft.entryDate,
      description: draft.description,
      sourceType: draft.sourceType,
      sourceId: sourceId ?? draft.sourceId,
    })
    .returning();

  await tx.insert(journalLines).values(
    draft.lines.map((l) => ({
      journalEntryId: entry.id,
      accountId: byCode.get(l.accountCode)!,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
      partyType: l.partyType,
      partyId: l.partyId,
    })),
  );

  return entry.id;
}

/** Reverse a posted entry (used when a document is cancelled). */
export async function reverseJournalEntry(tx: Tx, entryId: string, date: string): Promise<string> {
  const entry = await tx.query.journalEntries.findFirst({ where: eq(journalEntries.id, entryId) });
  if (!entry) throw new Error("Journal entry not found");
  if (entry.status === "reversed") throw new Error("Journal entry already reversed");
  const lines = await tx.query.journalLines.findMany({ where: eq(journalLines.journalEntryId, entryId) });

  const entryNo = await nextDocNo(tx, "JOURNAL");
  const [reversal] = await tx
    .insert(journalEntries)
    .values({
      entryNo,
      entryDate: date,
      description: `Reversal of ${entry.entryNo}: ${entry.description}`,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
    })
    .returning();

  await tx.insert(journalLines).values(
    lines.map((l) => ({
      journalEntryId: reversal.id,
      accountId: l.accountId,
      debit: l.credit,
      credit: l.debit,
      description: l.description,
      partyType: l.partyType ?? undefined,
      partyId: l.partyId ?? undefined,
    })),
  );

  await tx
    .update(journalEntries)
    .set({ status: "reversed", reversedById: reversal.id })
    .where(eq(journalEntries.id, entryId));

  return reversal.id;
}
