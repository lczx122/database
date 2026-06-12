import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, purchaseDocuments, salesDocuments, suppliers } from "@/db/schema";
import { D, toDb2, ZERO, type Money } from "@/lib/money";

// AR/AP aging: open balances of issued documents bucketed by days outstanding
// from docDate to the as-of date.

export interface AgingBuckets {
  current: string; // 0-30 days
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
}

export interface AgingRow extends AgingBuckets {
  partyId: string;
  code: string;
  name: string;
}

export interface AgingReport {
  asOfDate: string;
  rows: AgingRow[];
  totals: AgingBuckets;
}

interface OpenDocRow {
  partyId: string;
  partyCode: string;
  partyName: string;
  docDate: string;
  total: string;
  allocated: string;
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`);
  return Math.floor((to - from) / 86_400_000);
}

function buildReport(asOfDate: string, docs: OpenDocRow[]): AgingReport {
  interface Accum {
    code: string;
    name: string;
    buckets: [Money, Money, Money, Money];
  }
  const byParty = new Map<string, Accum>();

  for (const doc of docs) {
    const open = D(doc.total).minus(D(doc.allocated));
    if (open.lte(ZERO)) continue;

    const days = daysBetween(doc.docDate, asOfDate);
    const bucket = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;

    let acc = byParty.get(doc.partyId);
    if (!acc) {
      acc = { code: doc.partyCode, name: doc.partyName, buckets: [ZERO, ZERO, ZERO, ZERO] };
      byParty.set(doc.partyId, acc);
    }
    acc.buckets[bucket] = acc.buckets[bucket].plus(open);
  }

  const totals: [Money, Money, Money, Money] = [ZERO, ZERO, ZERO, ZERO];
  const rows: AgingRow[] = [];
  for (const [partyId, acc] of byParty) {
    const total = acc.buckets[0].plus(acc.buckets[1]).plus(acc.buckets[2]).plus(acc.buckets[3]);
    for (let i = 0; i < 4; i += 1) totals[i] = totals[i].plus(acc.buckets[i]);
    rows.push({
      partyId,
      code: acc.code,
      name: acc.name,
      current: toDb2(acc.buckets[0]),
      days31to60: toDb2(acc.buckets[1]),
      days61to90: toDb2(acc.buckets[2]),
      over90: toDb2(acc.buckets[3]),
      total: toDb2(total),
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const grandTotal = totals[0].plus(totals[1]).plus(totals[2]).plus(totals[3]);
  return {
    asOfDate,
    rows,
    totals: {
      current: toDb2(totals[0]),
      days31to60: toDb2(totals[1]),
      days61to90: toDb2(totals[2]),
      over90: toDb2(totals[3]),
      total: toDb2(grandTotal),
    },
  };
}

export async function arAging(asOfDate: string): Promise<AgingReport> {
  const docs = await db
    .select({
      partyId: customers.id,
      partyCode: customers.code,
      partyName: customers.name,
      docDate: salesDocuments.docDate,
      total: salesDocuments.total,
      allocated: sql<string>`coalesce((
        select sum(a.amount) from allocations a where a.target_document_id = ${salesDocuments.id}
      ), 0)`,
    })
    .from(salesDocuments)
    .innerJoin(customers, eq(salesDocuments.customerId, customers.id))
    .where(
      and(
        eq(salesDocuments.status, "issued"),
        inArray(salesDocuments.docType, ["INVOICE", "DEBIT_NOTE"]),
        lte(salesDocuments.docDate, asOfDate),
      ),
    )
    .orderBy(asc(salesDocuments.docDate));

  return buildReport(asOfDate, docs);
}

export async function apAging(asOfDate: string): Promise<AgingReport> {
  const docs = await db
    .select({
      partyId: suppliers.id,
      partyCode: suppliers.code,
      partyName: suppliers.name,
      docDate: purchaseDocuments.docDate,
      total: purchaseDocuments.total,
      allocated: sql<string>`coalesce((
        select sum(a.amount) from allocations a where a.target_document_id = ${purchaseDocuments.id}
      ), 0)`,
    })
    .from(purchaseDocuments)
    .innerJoin(suppliers, eq(purchaseDocuments.supplierId, suppliers.id))
    .where(
      and(
        eq(purchaseDocuments.status, "issued"),
        eq(purchaseDocuments.docType, "SUPPLIER_BILL"),
        lte(purchaseDocuments.docDate, asOfDate),
      ),
    )
    .orderBy(asc(purchaseDocuments.docDate));

  return buildReport(asOfDate, docs);
}
