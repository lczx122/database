import Link from "next/link";
import { and, count, desc, eq, gte, inArray, ne, sum } from "drizzle-orm";
import { db } from "@/db";
import { customers, einvoiceSubmissions, items, salesDocuments } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import {
  Badge,
  Card,
  DOC_STATUS_COLOR,
  EINVOICE_STATUS_COLOR,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      {detail ? <div className="mt-0.5 text-sm text-gray-500">{detail}</div> : null}
    </Card>
  );
}

export default async function DashboardPage() {
  await requireUser();

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [[customerCount], [itemCount], [invoicesThisMonth], attention, recentInvoices] =
    await Promise.all([
      db.select({ n: count() }).from(customers),
      db.select({ n: count() }).from(items),
      db
        .select({ n: count(), total: sum(salesDocuments.total) })
        .from(salesDocuments)
        .where(
          and(
            eq(salesDocuments.docType, "INVOICE"),
            ne(salesDocuments.status, "cancelled"),
            gte(salesDocuments.docDate, monthStart),
          ),
        ),
      db
        .select({
          id: einvoiceSubmissions.id,
          salesDocumentId: einvoiceSubmissions.salesDocumentId,
          internalId: einvoiceSubmissions.internalId,
          status: einvoiceSubmissions.status,
          updatedAt: einvoiceSubmissions.updatedAt,
        })
        .from(einvoiceSubmissions)
        .where(inArray(einvoiceSubmissions.status, ["invalid", "error"]))
        .orderBy(desc(einvoiceSubmissions.updatedAt))
        .limit(5),
      db
        .select({
          id: salesDocuments.id,
          docNo: salesDocuments.docNo,
          docDate: salesDocuments.docDate,
          total: salesDocuments.total,
          status: salesDocuments.status,
          customerName: customers.name,
        })
        .from(salesDocuments)
        .innerJoin(customers, eq(salesDocuments.customerId, customers.id))
        .where(eq(salesDocuments.docType, "INVOICE"))
        .orderBy(desc(salesDocuments.createdAt))
        .limit(5),
    ]);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your business" />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Customers" value={String(customerCount.n)} />
        <StatCard label="Items" value={String(itemCount.n)} />
        <StatCard
          label="Invoices this month"
          value={String(invoicesThisMonth.n)}
          detail={`MYR ${formatMoney(invoicesThisMonth.total ?? 0)}`}
        />
        <StatCard label="e-Invoices needing attention" value={String(attention.length)} />
      </div>

      <div className="mb-6">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            e-Invoice submissions needing attention
          </h2>
          {attention.length === 0 ? (
            <EmptyState message="No invalid or failed e-invoice submissions." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {attention.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    {s.salesDocumentId ? (
                      <Link
                        href={`/sales/invoices/${s.salesDocumentId}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {s.internalId}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-gray-700">{s.internalId}</span>
                    )}
                    <span className="ml-2 text-xs text-gray-500">
                      updated {formatDate(s.updatedAt)}
                    </span>
                  </div>
                  <Badge color={EINVOICE_STATUS_COLOR[s.status] ?? "gray"}>{s.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-900">Recent invoices</h2>
      {recentInvoices.length === 0 ? (
        <Card>
          <EmptyState message="No invoices yet." />
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Doc No</Th>
              <Th>Date</Th>
              <Th>Customer</Th>
              <Th className="text-right">Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recentInvoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`/sales/invoices/${inv.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {inv.docNo ?? "(draft)"}
                  </Link>
                </Td>
                <Td>{formatDate(inv.docDate)}</Td>
                <Td>{inv.customerName}</Td>
                <Td className="text-right">{formatMoney(inv.total)}</Td>
                <Td>
                  <Badge color={DOC_STATUS_COLOR[inv.status] ?? "gray"}>{inv.status}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
