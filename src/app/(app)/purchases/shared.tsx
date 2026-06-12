import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  items,
  purchaseDocumentLines,
  purchaseDocuments,
  suppliers,
  taxCodes,
} from "@/db/schema";
import { requireUser } from "@/server/auth";
import { formatDate, todayLocalISO } from "@/lib/dates";
import { D, formatMoney } from "@/lib/money";
import {
  Badge,
  Button,
  Card,
  DOC_STATUS_COLOR,
  EmptyState,
  ErrorBanner,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  deletePurchaseDraftAction,
  issuePurchaseAction,
  type PurchaseDocType,
} from "./actions";
import { PurchaseDocForm, type LineDefaults } from "./purchase-doc-form";

// Shared server-rendered screens for supplier bills and purchase orders — the
// two docTypes differ only in labels and base path.

const LABELS: Record<PurchaseDocType, { title: string; singular: string; base: string }> = {
  SUPPLIER_BILL: { title: "Supplier Bills", singular: "Supplier bill", base: "/purchases/bills" },
  PURCHASE_ORDER: {
    title: "Purchase Orders",
    singular: "Purchase order",
    base: "/purchases/orders",
  },
};

async function loadFormData() {
  const [supplierRows, itemRows, taxRows] = await Promise.all([
    db
      .select({ id: suppliers.id, code: suppliers.code, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.isActive, true))
      .orderBy(asc(suppliers.name)),
    db
      .select({
        id: items.id,
        code: items.code,
        name: items.name,
        description: items.description,
        unitPrice: items.unitPrice,
        cost: items.cost,
        purchaseTaxCodeId: items.purchaseTaxCodeId,
      })
      .from(items)
      .where(eq(items.isActive, true))
      .orderBy(asc(items.code)),
    db
      .select({
        id: taxCodes.id,
        code: taxCodes.code,
        description: taxCodes.description,
        rate: taxCodes.rate,
      })
      .from(taxCodes)
      .where(eq(taxCodes.isActive, true))
      .orderBy(asc(taxCodes.code)),
  ]);
  return { supplierRows, itemRows, taxRows };
}

export async function PurchaseListScreen({ docType }: { docType: PurchaseDocType }) {
  await requireUser();
  const labels = LABELS[docType];

  const rows = await db
    .select({ doc: purchaseDocuments, supplierName: suppliers.name })
    .from(purchaseDocuments)
    .innerJoin(suppliers, eq(purchaseDocuments.supplierId, suppliers.id))
    .where(eq(purchaseDocuments.docType, docType))
    .orderBy(desc(purchaseDocuments.docDate), desc(purchaseDocuments.createdAt))
    .limit(500);

  return (
    <div>
      <PageHeader
        title={labels.title}
        actions={<LinkButton href={`${labels.base}/new`}>New {labels.singular.toLowerCase()}</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState message={`No ${labels.title.toLowerCase()} yet.`} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Doc No</Th>
              <Th>Date</Th>
              <Th>Supplier</Th>
              <Th>Supplier ref</Th>
              <Th className="text-right">Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ doc, supplierName }) => (
              <tr key={doc.id} className="hover:bg-gray-50">
                <Td>
                  <Link
                    href={`${labels.base}/${doc.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {doc.docNo ?? "(draft)"}
                  </Link>
                </Td>
                <Td>{formatDate(doc.docDate)}</Td>
                <Td>{supplierName}</Td>
                <Td>{doc.supplierRef ?? "—"}</Td>
                <Td className="text-right tabular-nums">{formatMoney(doc.total)}</Td>
                <Td>
                  <Badge color={DOC_STATUS_COLOR[doc.status]}>{doc.status}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export async function PurchaseNewScreen({ docType }: { docType: PurchaseDocType }) {
  await requireUser();
  const labels = LABELS[docType];
  const { supplierRows, itemRows, taxRows } = await loadFormData();

  return (
    <div>
      <PageHeader title={`New ${labels.singular}`} />
      <PurchaseDocForm
        docType={docType}
        defaults={{ supplierId: "", docDate: todayLocalISO(), supplierRef: "", notes: "" }}
        suppliers={supplierRows}
        items={itemRows}
        taxCodes={taxRows}
      />
    </div>
  );
}

export async function PurchaseEditScreen({
  docType,
  id,
}: {
  docType: PurchaseDocType;
  id: string;
}) {
  await requireUser();
  const labels = LABELS[docType];

  const doc = await db.query.purchaseDocuments.findFirst({
    where: and(eq(purchaseDocuments.id, id), eq(purchaseDocuments.docType, docType)),
  });
  if (!doc) notFound();
  if (doc.status !== "draft") redirect(`${labels.base}/${id}`);

  const lines = await db
    .select()
    .from(purchaseDocumentLines)
    .where(eq(purchaseDocumentLines.documentId, id))
    .orderBy(asc(purchaseDocumentLines.lineNo));

  const initialLines: LineDefaults[] = lines.map((l) => ({
    itemId: l.itemId ?? "",
    description: l.description,
    quantity: D(l.quantity).toString(),
    unitPrice: D(l.unitPrice).toFixed(2),
    discount: D(l.discountAmount).isZero() ? "" : D(l.discountAmount).toFixed(2),
    taxCodeId: l.taxCodeId ?? "",
  }));

  const { supplierRows, itemRows, taxRows } = await loadFormData();

  return (
    <div>
      <PageHeader title={`Edit ${labels.singular}`} subtitle={doc.docNo ?? "Draft"} />
      <PurchaseDocForm
        docType={docType}
        documentId={doc.id}
        defaults={{
          supplierId: doc.supplierId,
          docDate: doc.docDate,
          supplierRef: doc.supplierRef ?? "",
          notes: doc.notes ?? "",
        }}
        initialLines={initialLines}
        suppliers={supplierRows}
        items={itemRows}
        taxCodes={taxRows}
      />
    </div>
  );
}

export async function PurchaseDetailScreen({
  docType,
  id,
  error,
}: {
  docType: PurchaseDocType;
  id: string;
  error?: string;
}) {
  await requireUser();
  const labels = LABELS[docType];

  const doc = await db.query.purchaseDocuments.findFirst({
    where: and(eq(purchaseDocuments.id, id), eq(purchaseDocuments.docType, docType)),
  });
  if (!doc) notFound();

  const [supplier, lines] = await Promise.all([
    db.query.suppliers.findFirst({ where: eq(suppliers.id, doc.supplierId) }),
    db
      .select()
      .from(purchaseDocumentLines)
      .where(eq(purchaseDocumentLines.documentId, id))
      .orderBy(asc(purchaseDocumentLines.lineNo)),
  ]);

  const isDraft = doc.status === "draft";

  return (
    <div>
      <PageHeader
        title={`${labels.singular} ${doc.docNo ?? "(draft)"}`}
        subtitle={`${formatDate(doc.docDate)} — ${supplier?.name ?? ""}`}
        actions={
          isDraft ? (
            <>
              <LinkButton variant="secondary" href={`${labels.base}/${doc.id}/edit`}>
                Edit
              </LinkButton>
              <form action={issuePurchaseAction}>
                <input type="hidden" name="docType" value={docType} />
                <input type="hidden" name="documentId" value={doc.id} />
                <Button type="submit">Issue</Button>
              </form>
              <form action={deletePurchaseDraftAction}>
                <input type="hidden" name="docType" value={docType} />
                <input type="hidden" name="documentId" value={doc.id} />
                <Button type="submit" variant="danger">
                  Delete draft
                </Button>
              </form>
            </>
          ) : undefined
        }
      />
      <ErrorBanner message={error} />

      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="mt-0.5">
              <Badge color={DOC_STATUS_COLOR[doc.status]}>{doc.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Supplier</dt>
            <dd className="mt-0.5 text-gray-900">{supplier?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Supplier ref</dt>
            <dd className="mt-0.5 text-gray-900">{doc.supplierRef ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Journal entry</dt>
            <dd className="mt-0.5">
              {doc.postedJournalEntryId ? (
                <Link
                  href={`/gl/journals/${doc.postedJournalEntryId}`}
                  className="text-blue-600 hover:underline"
                >
                  View journal
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          {doc.notes ? (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-gray-500">Notes</dt>
              <dd className="mt-0.5 text-gray-900">{doc.notes}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Table>
        <thead>
          <tr>
            <Th className="w-10">#</Th>
            <Th>Description</Th>
            <Th className="text-right">Qty</Th>
            <Th className="text-right">Unit price</Th>
            <Th className="text-right">Discount</Th>
            <Th className="text-right">Tax</Th>
            <Th className="text-right">Amount</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map((line) => (
            <tr key={line.id}>
              <Td>{line.lineNo}</Td>
              <Td>{line.description}</Td>
              <Td className="text-right tabular-nums">{D(line.quantity).toString()}</Td>
              <Td className="text-right tabular-nums">{formatMoney(line.unitPrice)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(line.discountAmount)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(line.taxAmount)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(line.lineTotal)}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50">
            <Td></Td>
            <Td className="font-medium">Subtotal</Td>
            <Td></Td>
            <Td></Td>
            <Td></Td>
            <Td></Td>
            <Td className="text-right tabular-nums">{formatMoney(doc.subtotal)}</Td>
          </tr>
          <tr className="bg-gray-50">
            <Td></Td>
            <Td className="font-medium">Tax</Td>
            <Td></Td>
            <Td></Td>
            <Td></Td>
            <Td></Td>
            <Td className="text-right tabular-nums">{formatMoney(doc.taxTotal)}</Td>
          </tr>
          <tr className="bg-gray-50 font-semibold">
            <Td></Td>
            <Td>Total</Td>
            <Td></Td>
            <Td></Td>
            <Td></Td>
            <Td></Td>
            <Td className="text-right tabular-nums">{formatMoney(doc.total)}</Td>
          </tr>
        </tfoot>
      </Table>
    </div>
  );
}
