import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, suppliers } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  Badge,
  DOC_STATUS_COLOR,
  EmptyState,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";

export default async function PaymentsPage() {
  await requireUser();

  const rows = await db
    .select({ payment: payments, supplierName: suppliers.name })
    .from(payments)
    .innerJoin(suppliers, eq(payments.supplierId, suppliers.id))
    .orderBy(desc(payments.docDate), desc(payments.createdAt))
    .limit(500);

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Supplier payments made"
        actions={<LinkButton href="/ap/payments/new">New payment</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState message="No payments yet." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Doc No</Th>
              <Th>Date</Th>
              <Th>Supplier</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ payment, supplierName }) => (
              <tr key={payment.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`/ap/payments/${payment.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {payment.docNo}
                  </Link>
                </Td>
                <Td>{formatDate(payment.docDate)}</Td>
                <Td>{supplierName}</Td>
                <Td className="text-right tabular-nums">{formatMoney(payment.amount)}</Td>
                <Td>
                  <Badge color={DOC_STATUS_COLOR[payment.status]}>{payment.status}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
