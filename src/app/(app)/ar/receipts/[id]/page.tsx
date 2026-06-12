import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, allocations, customers, receipts, salesDocuments } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { reverseJournalEntry } from "@/server/gl/posting";
import { formatDate, todayLocalISO } from "@/lib/dates";
import { D, formatMoney, sum, toDb2 } from "@/lib/money";
import {
  Badge,
  Button,
  Card,
  DOC_STATUS_COLOR,
  ErrorBanner,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";

export default async function ReceiptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { error } = await searchParams;

  const receipt = await db.query.receipts.findFirst({ where: eq(receipts.id, id) });
  if (!receipt) notFound();

  const [customer, bank, allocRows] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, receipt.customerId) }),
    db.query.accounts.findFirst({ where: eq(accounts.id, receipt.bankAccountId) }),
    db
      .select({
        id: allocations.id,
        amount: allocations.amount,
        docNo: salesDocuments.docNo,
        docType: salesDocuments.docType,
        docDate: salesDocuments.docDate,
        total: salesDocuments.total,
      })
      .from(allocations)
      .innerJoin(salesDocuments, eq(allocations.targetDocumentId, salesDocuments.id))
      .where(and(eq(allocations.type, "receipt"), eq(allocations.sourceId, id))),
  ]);

  const allocatedTotal = sum(allocRows.map((a) => D(a.amount)));
  const unallocated = D(receipt.amount).minus(allocatedTotal);

  async function cancelReceipt() {
    "use server";
    await requireUser();
    try {
      await db.transaction(async (tx) => {
        const current = await tx.query.receipts.findFirst({ where: eq(receipts.id, id) });
        if (!current) throw new Error("Receipt not found");
        if (current.status !== "issued") throw new Error("Only issued receipts can be cancelled");
        if (current.postedJournalEntryId) {
          await reverseJournalEntry(tx, current.postedJournalEntryId, todayLocalISO());
        }
        await tx
          .delete(allocations)
          .where(and(eq(allocations.type, "receipt"), eq(allocations.sourceId, id)));
        await tx.update(receipts).set({ status: "cancelled" }).where(eq(receipts.id, id));
      });
    } catch (e) {
      redirect(
        `/ar/receipts/${id}?error=${encodeURIComponent(
          e instanceof Error ? e.message : "Failed to cancel receipt",
        )}`,
      );
    }
    revalidatePath("/ar/receipts");
    revalidatePath(`/ar/receipts/${id}`);
    redirect(`/ar/receipts/${id}`);
  }

  return (
    <div>
      <PageHeader
        title={`Receipt ${receipt.docNo ?? ""}`}
        subtitle={`${formatDate(receipt.docDate)} — ${customer?.name ?? ""}`}
        actions={
          receipt.status === "issued" ? (
            <form action={cancelReceipt}>
              <Button type="submit" variant="danger">
                Cancel receipt
              </Button>
            </form>
          ) : undefined
        }
      />
      <ErrorBanner message={error} />

      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="mt-0.5">
              <Badge color={DOC_STATUS_COLOR[receipt.status]}>{receipt.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Amount</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-gray-900">
              {formatMoney(receipt.amount)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Bank account</dt>
            <dd className="mt-0.5 text-gray-900">
              {bank ? `${bank.code} — ${bank.name}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Payment mode</dt>
            <dd className="mt-0.5 text-gray-900">{receipt.paymentModeCode}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Reference</dt>
            <dd className="mt-0.5 text-gray-900">{receipt.reference ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Journal entry</dt>
            <dd className="mt-0.5">
              {receipt.postedJournalEntryId ? (
                <Link
                  href={`/gl/journals/${receipt.postedJournalEntryId}`}
                  className="text-blue-600 hover:underline"
                >
                  View journal
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Allocated</dt>
            <dd className="mt-0.5 tabular-nums text-gray-900">{formatMoney(allocatedTotal)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Unallocated</dt>
            <dd className="mt-0.5 tabular-nums text-gray-900">{formatMoney(toDb2(unallocated))}</dd>
          </div>
        </dl>
      </Card>

      <h2 className="mb-2 text-sm font-semibold text-gray-900">Allocations</h2>
      {allocRows.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No allocations.</p>
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Document</Th>
              <Th>Type</Th>
              <Th>Date</Th>
              <Th className="text-right">Document total</Th>
              <Th className="text-right">Allocated</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allocRows.map((a) => (
              <tr key={a.id}>
                <Td className="font-medium">{a.docNo}</Td>
                <Td>{a.docType}</Td>
                <Td>{formatDate(a.docDate)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(a.total)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(a.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
