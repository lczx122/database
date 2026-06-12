import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { formatMoney } from "@/lib/money";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";

export default async function ItemsPage() {
  await requireUser();

  const rows = await db.select().from(items).orderBy(asc(items.code));

  return (
    <div>
      <PageHeader title="Items" actions={<LinkButton href="/items/new">New Item</LinkButton>} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState message="No items yet. Create your first item." />
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Classification</Th>
              <Th>UOM</Th>
              <Th className="text-right">Unit Price</Th>
              <Th>Stock</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`/items/${item.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {item.code}
                  </Link>
                </Td>
                <Td>{item.name}</Td>
                <Td className="capitalize">{item.type}</Td>
                <Td>{item.classificationCode}</Td>
                <Td>{item.uomCode}</Td>
                <Td className="text-right">{formatMoney(item.unitPrice)}</Td>
                <Td>{item.trackStock ? <Badge color="blue">tracked</Badge> : ""}</Td>
                <Td>
                  <Badge color={item.isActive ? "green" : "gray"}>
                    {item.isActive ? "active" : "inactive"}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
