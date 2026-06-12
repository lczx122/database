import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/server/auth";
import { D, formatMoney, ZERO } from "@/lib/money";
import { EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";

interface BalanceRow {
  id: string;
  code: string;
  name: string;
  uomCode: string;
  runningQty: string;
  runningValue: string;
}

export default async function StockBalancesPage() {
  await requireUser();

  const result = await db.execute(sql`
    select i.id,
           i.code,
           i.name,
           i.uom_code as "uomCode",
           coalesce(m.running_qty, 0) as "runningQty",
           coalesce(m.running_value, 0) as "runningValue"
    from items i
    left join lateral (
      select running_qty, running_value
      from stock_movements
      where item_id = i.id
      order by created_at desc, id desc
      limit 1
    ) m on true
    where i.track_stock = true
    order by i.code
  `);
  const rows = result.rows as unknown as BalanceRow[];

  return (
    <div>
      <PageHeader
        title="Stock Balances"
        subtitle="Tracked items at weighted-average cost"
        actions={<LinkButton href="/stock/adjustments/new">New adjustment</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState message="No stock-tracked items." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Item</Th>
              <Th>UOM</Th>
              <Th className="text-right">Qty on hand</Th>
              <Th className="text-right">Avg cost</Th>
              <Th className="text-right">Stock value</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const qty = D(row.runningQty);
              const value = D(row.runningValue);
              const avgCost = qty.gt(0) ? value.div(qty) : ZERO;
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <Td className="font-mono">{row.code}</Td>
                  <Td>
                    <Link
                      href={`/stock/${row.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </Td>
                  <Td>{row.uomCode}</Td>
                  <Td className="text-right tabular-nums">{qty.toFixed(4)}</Td>
                  <Td className="text-right tabular-nums">{avgCost.toFixed(4)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(value)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
