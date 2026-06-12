import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, receipts } from "@/db/schema";
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

export default async function ReceiptsPage() {
  await requireUser();

  const rows = await db
    .select({ receipt: receipts, customerName: customers.name })
    .from(receipts)
    .innerJoin(customers, eq(receipts.customerId, customers.id))
    .orderBy(desc(receipts.docDate), desc(receipts.createdAt))
    .limit(500);

  return (
    <div>
      <PageHeader
        title="Receipts"
        subtitle="Customer payments received"
        actions={<LinkButton href="/ar/receipts/new">New receipt</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState message="No receipts yet." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Doc No</Th>
              <Th>Date</Th>
              <Th>Customer</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ receipt, customerName }) => (
              <tr key={receipt.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`/ar/receipts/${receipt.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {receipt.docNo}
                  </Link>
                </Td>
                <Td>{formatDate(receipt.docDate)}</Td>
                <Td>{customerName}</Td>
                <Td className="text-right tabular-nums">{formatMoney(receipt.amount)}</Td>
                <Td>
                  <Badge color={DOC_STATUS_COLOR[receipt.status]}>{receipt.status}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
