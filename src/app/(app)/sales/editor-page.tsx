import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { salesDocuments, salesDocumentLines } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { todayLocalISO, formatDate } from "@/lib/dates";
import {
  DocumentForm,
  type DocumentFormInitial,
  type ReferenceInvoiceOption,
} from "./document-form";
import { SALES_DOC_TYPES, salesBasePath, type SalesDocType } from "./doc-config";

export async function SalesEditorPage({
  docType,
  documentId,
}: {
  docType: SalesDocType;
  documentId?: string;
}) {
  await requireUser();
  const cfg = SALES_DOC_TYPES[docType];
  const base = salesBasePath(docType);

  const [customerRows, itemRows, taxRows, classRows, uomRows, payRows] = await Promise.all([
    db.query.customers.findMany({
      where: (t, { eq }) => eq(t.isActive, true),
      orderBy: (t, { asc }) => [asc(t.name)],
    }),
    db.query.items.findMany({
      where: (t, { eq }) => eq(t.isActive, true),
      orderBy: (t, { asc }) => [asc(t.code)],
    }),
    db.query.taxCodes.findMany({
      where: (t, { eq }) => eq(t.isActive, true),
      orderBy: (t, { asc }) => [asc(t.code)],
    }),
    db.query.classificationCodes.findMany({ orderBy: (t, { asc }) => [asc(t.code)] }),
    db.query.uomCodes.findMany({ orderBy: (t, { asc }) => [asc(t.code)] }),
    db.query.paymentModeCodes.findMany({ orderBy: (t, { asc }) => [asc(t.code)] }),
  ]);

  let referenceInvoices: ReferenceInvoiceOption[] = [];
  if (docType !== "INVOICE") {
    const rows = await db
      .select({
        id: salesDocuments.id,
        docNo: salesDocuments.docNo,
        docDate: salesDocuments.docDate,
        customerId: salesDocuments.customerId,
        total: salesDocuments.total,
      })
      .from(salesDocuments)
      .where(and(eq(salesDocuments.docType, "INVOICE"), eq(salesDocuments.status, "issued")))
      .orderBy(salesDocuments.docNo);
    referenceInvoices = rows.map((r) => ({
      id: r.id,
      docNo: r.docNo ?? "(no number)",
      docDate: formatDate(r.docDate),
      customerId: r.customerId,
      total: r.total,
    }));
  }

  let initial: DocumentFormInitial = {
    documentId: null,
    customerId: "",
    docDate: todayLocalISO(),
    paymentModeCode: "01",
    paymentTermsDays: 30,
    notes: "",
    referenceDocId: "",
    lines: [],
  };
  let title = `New ${cfg.singular.toLowerCase()}`;

  if (documentId) {
    const doc = await db.query.salesDocuments.findFirst({
      where: eq(salesDocuments.id, documentId),
    });
    if (!doc || doc.docType !== docType) notFound();
    if (doc.status !== "draft") {
      redirect(`${base}/${documentId}?error=${encodeURIComponent("Only draft documents can be edited")}`);
    }
    const lines = await db.query.salesDocumentLines.findMany({
      where: eq(salesDocumentLines.documentId, documentId),
      orderBy: (t, { asc }) => [asc(t.lineNo)],
    });
    initial = {
      documentId,
      customerId: doc.customerId,
      docDate: doc.docDate,
      paymentModeCode: doc.paymentModeCode,
      paymentTermsDays: doc.paymentTermsDays,
      notes: doc.notes ?? "",
      referenceDocId: doc.referenceDocId ?? "",
      lines: lines.map((l) => ({
        itemId: l.itemId ?? "",
        description: l.description,
        classificationCode: l.classificationCode,
        quantity: l.quantity,
        uomCode: l.uomCode,
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        taxCodeId: l.taxCodeId ?? "",
      })),
    };
    title = `Edit draft ${cfg.singular.toLowerCase()}`;
  }

  return (
    <div>
      <PageHeader title={title} subtitle={`${cfg.singular} amounts are recalculated on save.`} />
      <DocumentForm
        docType={docType}
        singular={cfg.singular}
        basePath={base}
        initial={initial}
        customers={customerRows.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          paymentModeCode: c.paymentModeCode,
          creditTermsDays: c.creditTermsDays,
        }))}
        items={itemRows.map((i) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          description: i.description,
          classificationCode: i.classificationCode,
          uomCode: i.uomCode,
          unitPrice: i.unitPrice,
          salesTaxCodeId: i.salesTaxCodeId,
        }))}
        taxCodes={taxRows.map((t) => ({
          id: t.id,
          code: t.code,
          description: t.description,
          rate: t.rate,
          myinvoisTaxTypeCode: t.myinvoisTaxTypeCode,
          exemptionReason: t.exemptionReason,
        }))}
        classificationCodes={classRows.map((c) => ({ code: c.code, label: c.description }))}
        uomCodes={uomRows.map((u) => ({ code: u.code, label: u.name }))}
        paymentModes={payRows.map((p) => ({ code: p.code, label: p.name }))}
        referenceInvoices={referenceInvoices}
      />
    </div>
  );
}
