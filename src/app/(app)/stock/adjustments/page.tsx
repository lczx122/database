import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { stockAdjustments } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { formatDate } from "@/lib/dates";
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

export default async function StockAdjustmentsPage() {
  await requireUser();

  const rows = await db
    .select()
    .from(stockAdjustments)
    .orderBy(desc(stockAdjustments.docDate), desc(stockAdjustments.createdAt))
    .limit(500);

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        actions={<LinkButton href="/stock/adjustments/new">New adjustment</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState message="No stock adjustments yet." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Doc No</Th>
              <Th>Date</Th>
              <Th>Reason</Th>
              <Th>Status</Th>
              <Th>Journal</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((adj) => (
              <tr key={adj.id} className="hover:bg-gray-50">
                <Td className="font-medium">{adj.docNo}</Td>
                <Td>{formatDate(adj.docDate)}</Td>
                <Td>{adj.reason}</Td>
                <Td>
                  <Badge color={DOC_STATUS_COLOR[adj.status]}>{adj.status}</Badge>
                </Td>
                <Td>
                  {adj.postedJournalEntryId ? (
                    <Link
                      href={`/gl/journals/${adj.postedJournalEntryId}`}
                      className="text-blue-600 hover:underline"
                    >
                      View journal
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
