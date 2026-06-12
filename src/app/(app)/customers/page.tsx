import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, stateCodes } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";

export default async function CustomersPage() {
  await requireUser();

  const rows = await db
    .select({
      id: customers.id,
      code: customers.code,
      name: customers.name,
      tin: customers.tin,
      idType: customers.idType,
      idValue: customers.idValue,
      isActive: customers.isActive,
      stateName: stateCodes.name,
    })
    .from(customers)
    .leftJoin(stateCodes, eq(customers.stateCode, stateCodes.code))
    .orderBy(asc(customers.code));

  return (
    <div>
      <PageHeader
        title="Customers"
        actions={<LinkButton href="/customers/new">New Customer</LinkButton>}
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState message="No customers yet. Create your first customer." />
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
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`/customers/${c.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {c.code}
                  </Link>
                </Td>
                <Td>{c.name}</Td>
                <Td>{c.tin}</Td>
                <Td>{c.idValue ? `${c.idType} ${c.idValue}` : c.idType}</Td>
                <Td>{c.stateName ?? ""}</Td>
                <Td>
                  <Badge color={c.isActive ? "green" : "gray"}>
                    {c.isActive ? "active" : "inactive"}
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
