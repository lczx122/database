import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { customers, einvoiceSubmissions, salesDocuments } from "@/db/schema";
import { requireUser } from "@/server/auth";
import {
  Badge,
  DOC_STATUS_COLOR,
  EINVOICE_STATUS_COLOR,
  EmptyState,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { SALES_DOC_TYPES, salesBasePath, type SalesDocType } from "./doc-config";

export async function SalesListPage({ docType }: { docType: SalesDocType }) {
  await requireUser();
  const cfg = SALES_DOC_TYPES[docType];
  const base = salesBasePath(docType);

  const docs = await db
    .select({
      id: salesDocuments.id,
      docNo: salesDocuments.docNo,
      docDate: salesDocuments.docDate,
      total: salesDocuments.total,
      status: salesDocuments.status,
      customerName: customers.name,
    })
    .from(salesDocuments)
    .innerJoin(customers, eq(salesDocuments.customerId, customers.id))
    .where(eq(salesDocuments.docType, docType))
    .orderBy(desc(salesDocuments.createdAt));

  // Latest e-invoice submission per document.
  const latestByDoc = new Map<string, string>();
  if (docs.length > 0) {
    const subs = await db
      .select({
        salesDocumentId: einvoiceSubmissions.salesDocumentId,
        status: einvoiceSubmissions.status,
      })
      .from(einvoiceSubmissions)
      .where(inArray(einvoiceSubmissions.salesDocumentId, docs.map((d) => d.id)))
      .orderBy(desc(einvoiceSubmissions.createdAt));
    for (const sub of subs) {
      if (sub.salesDocumentId && !latestByDoc.has(sub.salesDocumentId)) {
        latestByDoc.set(sub.salesDocumentId, sub.status);
      }
    }
  }

  return (
    <div>
      <PageHeader
        title={cfg.plural}
        actions={<LinkButton href={`${base}/new`}>New {cfg.singular.toLowerCase()}</LinkButton>}
      />
      {docs.length === 0 ? (
        <EmptyState message={`No ${cfg.plural.toLowerCase()} yet.`} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Doc no</Th>
              <Th>Date</Th>
              <Th>Customer</Th>
              <Th className="text-right">Total</Th>
              <Th>Status</Th>
              <Th>e-Invoice</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {docs.map((doc) => {
              const einvoiceStatus = latestByDoc.get(doc.id);
              return (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <Td>
                    <Link href={`${base}/${doc.id}`} className="font-medium text-blue-600 hover:underline">
                      {doc.docNo ?? "Draft"}
                    </Link>
                  </Td>
                  <Td>{formatDate(doc.docDate)}</Td>
                  <Td>{doc.customerName}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(doc.total)}</Td>
                  <Td>
                    <Badge color={DOC_STATUS_COLOR[doc.status]}>{doc.status}</Badge>
                  </Td>
                  <Td>
                    {einvoiceStatus ? (
                      <Badge color={EINVOICE_STATUS_COLOR[einvoiceStatus]}>{einvoiceStatus}</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
