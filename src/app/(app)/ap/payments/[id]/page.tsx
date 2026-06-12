import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, allocations, payments, purchaseDocuments, suppliers } from "@/db/schema";
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

export default async function PaymentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { error } = await searchParams;

  const payment = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!payment) notFound();

  const [supplier, bank, allocRows] = await Promise.all([
    db.query.suppliers.findFirst({ where: eq(suppliers.id, payment.supplierId) }),
    db.query.accounts.findFirst({ where: eq(accounts.id, payment.bankAccountId) }),
    db
      .select({
        id: allocations.id,
        amount: allocations.amount,
        docNo: purchaseDocuments.docNo,
        docDate: purchaseDocuments.docDate,
        total: purchaseDocuments.total,
      })
      .from(allocations)
      .innerJoin(purchaseDocuments, eq(allocations.targetDocumentId, purchaseDocuments.id))
      .where(and(eq(allocations.type, "payment"), eq(allocations.sourceId, id))),
  ]);

  const allocatedTotal = sum(allocRows.map((a) => D(a.amount)));
  const unallocated = D(payment.amount).minus(allocatedTotal);

  async function cancelPayment() {
    "use server";
    await requireUser();
    try {
      await db.transaction(async (tx) => {
        const current = await tx.query.payments.findFirst({ where: eq(payments.id, id) });
        if (!current) throw new Error("Payment not found");
        if (current.status !== "issued") throw new Error("Only issued payments can be cancelled");
        if (current.postedJournalEntryId) {
          await reverseJournalEntry(tx, current.postedJournalEntryId, todayLocalISO());
        }
        await tx
          .delete(allocations)
          .where(and(eq(allocations.type, "payment"), eq(allocations.sourceId, id)));
        await tx.update(payments).set({ status: "cancelled" }).where(eq(payments.id, id));
      });
    } catch (e) {
      redirect(
        `/ap/payments/${id}?error=${encodeURIComponent(
          e instanceof Error ? e.message : "Failed to cancel payment",
        )}`,
      );
    }
    revalidatePath("/ap/payments");
    revalidatePath(`/ap/payments/${id}`);
    redirect(`/ap/payments/${id}`);
  }

  return (
    <div>
      <PageHeader
        title={`Payment ${payment.docNo ?? ""}`}
        subtitle={`${formatDate(payment.docDate)} — ${supplier?.name ?? ""}`}
        actions={
          payment.status === "issued" ? (
            <form action={cancelPayment}>
              <Button type="submit" variant="danger">
                Cancel payment
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
              <Badge color={DOC_STATUS_COLOR[payment.status]}>{payment.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Amount</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-gray-900">
              {formatMoney(payment.amount)}
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
            <dd className="mt-0.5 text-gray-900">{payment.paymentModeCode}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Reference</dt>
            <dd className="mt-0.5 text-gray-900">{payment.reference ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Journal entry</dt>
            <dd className="mt-0.5">
              {payment.postedJournalEntryId ? (
                <Link
                  href={`/gl/journals/${payment.postedJournalEntryId}`}
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
              <Th>Bill</Th>
              <Th>Date</Th>
              <Th className="text-right">Bill total</Th>
              <Th className="text-right">Allocated</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allocRows.map((a) => (
              <tr key={a.id}>
                <Td className="font-medium">{a.docNo}</Td>
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
