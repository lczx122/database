import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { taxCodes } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { taxTypeLabel } from "./tax-types";

export default async function TaxCodesPage() {
  await requireUser();

  const rows = await db.select().from(taxCodes).orderBy(asc(taxCodes.code));

  return (
    <div>
      <PageHeader
        title="Tax Codes"
        actions={<LinkButton href="/tax-codes/new">New Tax Code</LinkButton>}
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState message="No tax codes yet. Create your first tax code." />
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Description</Th>
              <Th className="text-right">Rate (%)</Th>
              <Th>MyInvois Tax Type</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`/tax-codes/${t.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {t.code}
                  </Link>
                </Td>
                <Td>{t.description}</Td>
                <Td className="text-right">{Number(t.rate).toString()}</Td>
                <Td>{taxTypeLabel(t.myinvoisTaxTypeCode)}</Td>
                <Td>
                  <Badge color={t.isActive ? "green" : "gray"}>
                    {t.isActive ? "active" : "inactive"}
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
