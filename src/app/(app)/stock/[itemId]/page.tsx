import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { items, stockMovements } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { formatDate } from "@/lib/dates";
import { D, formatMoney } from "@/lib/money";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";

const TYPE_LABELS: Record<string, string> = {
  opening: "Opening",
  purchase: "Purchase",
  sale: "Sale",
  adjustment: "Adjustment",
};

export default async function StockMovementsPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  await requireUser();
  const { itemId } = await params;

  const item = await db.query.items.findFirst({ where: eq(items.id, itemId) });
  if (!item) notFound();

  const movements = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.itemId, itemId))
    .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));

  const last = movements[movements.length - 1];

  return (
    <div>
      <PageHeader title={`${item.code} — ${item.name}`} subtitle="Stock movement history" />

      <Card className="mb-4">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-gray-500">Qty on hand</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-gray-900">
              {last ? D(last.runningQty).toFixed(4) : "0.0000"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Stock value</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-gray-900">
              {formatMoney(last ? last.runningValue : 0)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Avg cost</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-gray-900">
              {last && D(last.runningQty).gt(0)
                ? D(last.runningValue).div(D(last.runningQty)).toFixed(4)
                : "0.0000"}
            </dd>
          </div>
        </dl>
      </Card>

      {movements.length === 0 ? (
        <EmptyState message="No stock movements for this item." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Source</Th>
              <Th className="text-right">In</Th>
              <Th className="text-right">Out</Th>
              <Th className="text-right">Unit cost</Th>
              <Th className="text-right">Running qty</Th>
              <Th className="text-right">Running value</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {movements.map((m) => (
              <tr key={m.id}>
                <Td>{formatDate(m.movementDate)}</Td>
                <Td>{TYPE_LABELS[m.type] ?? m.type}</Td>
                <Td>{m.sourceType ?? "—"}</Td>
                <Td className="text-right tabular-nums">
                  {D(m.qtyIn).isZero() ? "" : D(m.qtyIn).toFixed(4)}
                </Td>
                <Td className="text-right tabular-nums">
                  {D(m.qtyOut).isZero() ? "" : D(m.qtyOut).toFixed(4)}
                </Td>
                <Td className="text-right tabular-nums">{D(m.unitCost).toFixed(4)}</Td>
                <Td className="text-right tabular-nums">{D(m.runningQty).toFixed(4)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(m.runningValue)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
