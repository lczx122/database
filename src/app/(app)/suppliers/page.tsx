import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { stateCodes, suppliers } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";

export default async function SuppliersPage() {
  await requireUser();

  const rows = await db
    .select({
      id: suppliers.id,
      code: suppliers.code,
      name: suppliers.name,
      tin: suppliers.tin,
      idType: suppliers.idType,
      idValue: suppliers.idValue,
      isActive: suppliers.isActive,
      stateName: stateCodes.name,
    })
    .from(suppliers)
    .leftJoin(stateCodes, eq(suppliers.stateCode, stateCodes.code))
    .orderBy(asc(suppliers.code));

  return (
    <div>
      <PageHeader
        title="Suppliers"
        actions={<LinkButton href="/suppliers/new">New Supplier</LinkButton>}
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState message="No suppliers yet. Create your first supplier." />
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>TIN</Th>
              <Th>ID</Th>
              <Th>State</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`/suppliers/${s.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {s.code}
                  </Link>
                </Td>
                <Td>{s.name}</Td>
                <Td>{s.tin}</Td>
                <Td>{s.idValue ? `${s.idType} ${s.idValue}` : s.idType}</Td>
                <Td>{s.stateName ?? ""}</Td>
                <Td>
                  <Badge color={s.isActive ? "green" : "gray"}>
                    {s.isActive ? "active" : "inactive"}
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
