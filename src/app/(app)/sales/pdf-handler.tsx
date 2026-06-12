import { and, desc, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/db";
import { customers, einvoiceSubmissions, salesDocuments, salesDocumentLines } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getCompanyProfile } from "@/server/settings";
import { getValidationLink } from "@/server/einvoice/service";
import { InvoicePdf, type PdfBuyer, type PdfValidation } from "@/server/pdf/InvoicePdf";
import { SALES_DOC_TYPES, type SalesDocType } from "./doc-config";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Shared GET handler for /sales/{slug}/[id]/pdf. requireUser() throws a
 * redirect for anonymous requests, which Next handles in route handlers.
 */
export function createPdfHandler(docType: SalesDocType) {
  return async function GET(_request: Request, context: RouteContext): Promise<Response> {
    await requireUser();
    const { id } = await context.params;
    const cfg = SALES_DOC_TYPES[docType];

    const doc = await db.query.salesDocuments.findFirst({ where: eq(salesDocuments.id, id) });
    if (!doc || doc.docType !== docType) {
      return new Response("Not found", { status: 404 });
    }

    const [company, lines] = await Promise.all([
      getCompanyProfile(),
      db.query.salesDocumentLines.findMany({
        where: eq(salesDocumentLines.documentId, id),
        orderBy: (t, { asc }) => [asc(t.lineNo)],
      }),
    ]);

    // Buyer: the issue-time snapshot, or the live customer record for drafts.
    let buyer: PdfBuyer | null = doc.partySnapshot;
    if (!buyer) {
      const customer = await db.query.customers.findFirst({
        where: eq(customers.id, doc.customerId),
      });
      if (customer) {
        buyer = {
          name: customer.name,
          tin: customer.tin,
          idType: customer.idType,
          idValue: customer.idValue,
          sstNo: customer.sstNo,
          email: customer.email,
          phone: customer.phone,
          addressLine1: customer.addressLine1,
          addressLine2: customer.addressLine2,
          addressLine3: customer.addressLine3,
          postcode: customer.postcode,
          city: customer.city,
          stateCode: customer.stateCode,
          countryCode: customer.countryCode,
        };
      }
    }
    if (!buyer) return new Response("Customer not found", { status: 404 });

    // LHDN validation block, when a valid e-invoice exists.
    let validation: PdfValidation | null = null;
    const validSubmission = await db.query.einvoiceSubmissions.findFirst({
      where: and(
        eq(einvoiceSubmissions.salesDocumentId, id),
        eq(einvoiceSubmissions.status, "valid"),
      ),
      orderBy: desc(einvoiceSubmissions.validatedAt),
    });
    if (validSubmission?.documentUuid && validSubmission.longId) {
      try {
        const url = await getValidationLink(validSubmission.id);
        if (url) {
          validation = {
            url,
            qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 256 }),
            uuid: validSubmission.documentUuid,
            longId: validSubmission.longId,
          };
        }
      } catch {
        // MyInvois not configured — render the PDF without the validation block.
      }
    }

    const docNo = doc.docNo ?? "DRAFT";
    const buffer = await renderToBuffer(
      <InvoicePdf
        title={cfg.pdfTitle}
        company={{
          name: company.name,
          tin: company.tin,
          brn: company.brn,
          sstRegistrationNo: company.sstRegistrationNo,
          addressLine1: company.addressLine1,
          addressLine2: company.addressLine2,
          addressLine3: company.addressLine3,
          postcode: company.postcode,
          city: company.city,
          stateCode: company.stateCode,
          countryCode: company.countryCode,
          phone: company.phone,
          email: company.email,
        }}
        docNo={docNo}
        docDate={doc.docDate}
        status={doc.status}
        currencyCode={doc.currencyCode}
        paymentTermsDays={doc.paymentTermsDays}
        notes={doc.notes}
        buyer={buyer}
        lines={lines.map((l) => ({
          lineNo: l.lineNo,
          description: l.description,
          quantity: l.quantity,
          uomCode: l.uomCode,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
        }))}
        subtotal={doc.subtotal}
        taxTotal={doc.taxTotal}
        total={doc.total}
        validation={validation}
      />,
    );

    const filename = `${cfg.singular.replace(/ /g, "-")}-${docNo}.pdf`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  };
}
