import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { formatDate } from "@/lib/dates";
import { Badge, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";

const STATUS_COLOR: Record<string, string> = { posted: "green", reversed: "yellow" };

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  sales_doc: "Sales",
  purchase_doc: "Purchase",
  receipt: "Receipt",
  payment: "Payment",
  stock_adj: "Stock Adj",
};

export default async function JournalsPage() {
  await requireUser();

  const entries = await db
    .select()
    .from(journalEntries)
    .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt))
    .limit(500);

  return (
    <div>
      <PageHeader
        title="Journal Entries"
        actions={<LinkButton href="/gl/journals/new">New journal</LinkButton>}
      />
      {entries.length === 0 ? (
        <EmptyState message="No journal entries yet." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Entry No</Th>
              <Th>Date</Th>
              <Th>Description</Th>
              <Th>Source</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`/gl/journals/${entry.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {entry.entryNo}
                  </Link>
                </Td>
                <Td>{formatDate(entry.entryDate)}</Td>
                <Td>{entry.description}</Td>
                <Td>{SOURCE_LABELS[entry.sourceType] ?? entry.sourceType}</Td>
                <Td>
                  <Badge color={STATUS_COLOR[entry.status]}>{entry.status}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
