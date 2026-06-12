/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { customers, einvoiceSubmissions, salesDocuments, salesDocumentLines } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getCompanyProfile } from "@/server/settings";
import { preflightInvoice } from "@/server/einvoice/preflight";
import { getValidationLink, CANCELLATION_WINDOW_HOURS } from "@/server/einvoice/service";
import { hoursSince, formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  Badge,
  Button,
  Card,
  DOC_STATUS_COLOR,
  EINVOICE_STATUS_COLOR,
  ErrorBanner,
  Field,
  Input,
  LinkButton,
  PageHeader,
  SuccessBanner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  ACTIVE_EINVOICE_STATUSES,
  SALES_DOC_TYPES,
  salesBasePath,
  type SalesDocType,
} from "./doc-config";
import {
  cancelDocumentAction,
  cancelEinvoiceAction,
  issueDocumentAction,
  refreshEinvoiceAction,
  submitEinvoiceAction,
} from "./actions";

function formatTimestamp(value: Date | null | undefined): string {
  if (!value) return "—";
  const dd = String(value.getDate()).padStart(2, "0");
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const hh = String(value.getHours()).padStart(2, "0");
  const mi = String(value.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${value.getFullYear()} ${hh}:${mi}`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right text-gray-900">{value}</span>
    </div>
  );
}

export async function SalesDetailPage({
  docType,
  id,
  searchParams,
}: {
  docType: SalesDocType;
  id: string;
  searchParams: { error?: string; success?: string };
}) {
  await requireUser();
  const cfg = SALES_DOC_TYPES[docType];
  const base = salesBasePath(docType);

  const doc = await db.query.salesDocuments.findFirst({ where: eq(salesDocuments.id, id) });
  if (!doc || doc.docType !== docType) notFound();

  const [customer, lines, submissions] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, doc.customerId) }),
    db.query.salesDocumentLines.findMany({
      where: eq(salesDocumentLines.documentId, id),
      orderBy: (t, { asc }) => [asc(t.lineNo)],
    }),
    db
      .select()
      .from(einvoiceSubmissions)
      .where(eq(einvoiceSubmissions.salesDocumentId, id))
      .orderBy(desc(einvoiceSubmissions.createdAt)),
  ]);

  const referenceDoc = doc.referenceDocId
    ? await db.query.salesDocuments.findFirst({ where: eq(salesDocuments.id, doc.referenceDocId) })
    : null;

  const latest = submissions[0] ?? null;
  const hasActiveSubmission = submissions.some((s) =>
    (ACTIVE_EINVOICE_STATUSES as readonly string[]).includes(s.status),
  );

  // Preflight only when a fresh submission would be possible.
  let preflightProblems: string[] | null = null;
  if (doc.status === "issued" && !hasActiveSubmission) {
    try {
      const company = await getCompanyProfile();
      preflightProblems = preflightInvoice(company, doc, lines);
    } catch (err) {
      preflightProblems = [err instanceof Error ? err.message : String(err)];
    }
  }

  // Validation link + QR for a valid submission.
  let validation: { url: string; qrDataUrl: string } | null = null;
  let validationLinkError: string | null = null;
  if (latest?.status === "valid") {
    try {
      const url = await getValidationLink(latest.id);
      if (url) validation = { url, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 160 }) };
    } catch (err) {
      validationLinkError = err instanceof Error ? err.message : String(err);
    }
  }

  const withinCancellationWindow =
    latest?.status === "valid" &&
    latest.validatedAt != null &&
    hoursSince(latest.validatedAt) <= CANCELLATION_WINDOW_HOURS;
  const cancellationDeadline =
    latest?.validatedAt != null
      ? new Date(latest.validatedAt.getTime() + CANCELLATION_WINDOW_HOURS * 3_600_000)
      : null;

  const party = doc.partySnapshot;
  const hidden = (
    <>
      <input type="hidden" name="docType" value={docType} />
      <input type="hidden" name="documentId" value={doc.id} />
    </>
  );

  return (
    <div>
      <PageHeader
        title={`${cfg.singular} ${doc.docNo ?? "(draft)"}`}
        subtitle={customer ? `${customer.code} — ${customer.name}` : undefined}
        actions={
          <>
            {doc.status === "draft" ? (
              <>
                <LinkButton variant="secondary" href={`${base}/${doc.id}/edit`}>
                  Edit
                </LinkButton>
                <form action={issueDocumentAction}>
                  {hidden}
                  <Button type="submit">Issue</Button>
                </form>
              </>
            ) : null}
            {doc.status === "issued" ? (
              <form action={cancelDocumentAction}>
                {hidden}
                <Button type="submit" variant="danger">
                  Cancel document
                </Button>
              </form>
            ) : null}
            <LinkButton variant="secondary" href={`${base}/${doc.id}/pdf`} target="_blank">
              Download PDF
            </LinkButton>
          </>
        }
      />
      <ErrorBanner message={searchParams.error} />
      <SuccessBanner message={searchParams.success} />

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Document</h2>
          <InfoRow label="Status" value={<Badge color={DOC_STATUS_COLOR[doc.status]}>{doc.status}</Badge>} />
          <InfoRow label="Date" value={formatDate(doc.docDate)} />
          <InfoRow label="Currency" value={doc.currencyCode} />
          <InfoRow label="Payment mode" value={doc.paymentModeCode} />
          <InfoRow label="Payment terms" value={`${doc.paymentTermsDays} days`} />
          {referenceDoc ? (
            <InfoRow
              label="Reference invoice"
              value={
                <Link href={`/sales/invoices/${referenceDoc.id}`} className="text-blue-600 hover:underline">
                  {referenceDoc.docNo ?? "(draft)"}
                </Link>
              }
            />
          ) : null}
          {doc.issuedAt ? <InfoRow label="Issued at" value={formatTimestamp(doc.issuedAt)} /> : null}
          {doc.cancelledAt ? <InfoRow label="Cancelled at" value={formatTimestamp(doc.cancelledAt)} /> : null}
          {doc.notes ? (
            <div className="mt-2 border-t border-gray-100 pt-2 text-sm">
              <div className="text-gray-500">Notes</div>
              <div className="whitespace-pre-wrap text-gray-900">{doc.notes}</div>
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">
            Buyer {party ? "(snapshot at issue)" : "(current customer record)"}
          </h2>
          {party ? (
            <div className="text-sm text-gray-700">
              <div className="font-medium text-gray-900">{party.name}</div>
              <div>TIN: {party.tin || "—"}</div>
              <div>
                {party.idType}: {party.idValue || "—"}
              </div>
              {party.sstNo ? <div>SST: {party.sstNo}</div> : null}
              <div className="mt-1">
                {[party.addressLine1, party.addressLine2, party.addressLine3]
                  .filter(Boolean)
                  .join(", ")}
              </div>
              <div>
                {party.postcode} {party.city}, {party.stateCode}, {party.countryCode}
              </div>
              {party.email ? <div>{party.email}</div> : null}
              {party.phone ? <div>{party.phone}</div> : null}
            </div>
          ) : customer ? (
            <div className="text-sm text-gray-700">
              <div className="font-medium text-gray-900">{customer.name}</div>
              <div>TIN: {customer.tin || "—"}</div>
              <div className="mt-1 text-xs text-gray-500">
                The buyer snapshot is frozen when the document is issued.
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Customer not found.</div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Totals</h2>
          <InfoRow label="Subtotal" value={formatMoney(doc.subtotal)} />
          <InfoRow label="Tax" value={formatMoney(doc.taxTotal)} />
          {doc.rounding !== "0.00" && doc.rounding !== "0" ? (
            <InfoRow label="Rounding" value={formatMoney(doc.rounding)} />
          ) : null}
          <div className="mt-1 border-t border-gray-200 pt-1">
            <InfoRow
              label="Total"
              value={<span className="font-semibold">{`${doc.currencyCode} ${formatMoney(doc.total)}`}</span>}
            />
          </div>
        </Card>
      </div>

      <div className="mb-4">
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Description</Th>
              <Th>Class.</Th>
              <Th className="text-right">Qty</Th>
              <Th>UOM</Th>
              <Th className="text-right">Unit price</Th>
              <Th className="text-right">Discount</Th>
              <Th>Tax</Th>
              <Th className="text-right">Subtotal</Th>
              <Th className="text-right">Tax amt</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((line) => (
              <tr key={line.id}>
                <Td>{line.lineNo}</Td>
                <Td>{line.description}</Td>
                <Td>{line.classificationCode}</Td>
                <Td className="text-right tabular-nums">{line.quantity}</Td>
                <Td>{line.uomCode}</Td>
                <Td className="text-right tabular-nums">{formatMoney(line.unitPrice)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(line.discountAmount)}</Td>
                <Td>
                  {line.taxTypeCode} @ {Number.parseFloat(line.taxRate)}%
                </Td>
                <Td className="text-right tabular-nums">{formatMoney(line.lineSubtotal)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(line.taxAmount)}</Td>
                <Td className="text-right font-medium tabular-nums">{formatMoney(line.lineTotal)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">e-Invoice (MyInvois)</h2>
          {latest ? <Badge color={EINVOICE_STATUS_COLOR[latest.status]}>{latest.status}</Badge> : null}
        </div>

        {doc.status === "draft" ? (
          <p className="text-sm text-gray-500">Issue the document before submitting to LHDN.</p>
        ) : null}

        {doc.status === "issued" && !hasActiveSubmission ? (
          preflightProblems && preflightProblems.length > 0 ? (
            <div className="mb-3 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              <div className="mb-1 font-medium">Fix these before submitting:</div>
              <ul className="list-inside list-disc space-y-0.5">
                {preflightProblems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            <form action={submitEinvoiceAction} className="mb-3">
              {hidden}
              <Button type="submit">{latest ? "Resubmit to LHDN" : "Submit to LHDN"}</Button>
            </form>
          )
        ) : null}

        {latest?.status === "submitted" ? (
          <form action={refreshEinvoiceAction} className="mb-3">
            {hidden}
            <input type="hidden" name="submissionId" value={latest.id} />
            <Button type="submit" variant="secondary">
              Refresh status
            </Button>
          </form>
        ) : null}

        {latest?.status === "valid" ? (
          <div className="mb-3 flex flex-wrap items-start gap-6">
            <div className="text-sm text-gray-700">
              <div>
                <span className="text-gray-500">LHDN UUID: </span>
                <span className="font-mono">{latest.documentUuid}</span>
              </div>
              {latest.longId ? (
                <div className="break-all">
                  <span className="text-gray-500">Long ID: </span>
                  <span className="font-mono">{latest.longId}</span>
                </div>
              ) : null}
              <div>
                <span className="text-gray-500">Validated at: </span>
                {formatTimestamp(latest.validatedAt)}
              </div>
              {validation ? (
                <div className="mt-1">
                  <a
                    href={validation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Open LHDN validation page
                  </a>
                </div>
              ) : null}
              {validationLinkError ? (
                <div className="mt-1 text-xs text-red-600">
                  Validation link unavailable: {validationLinkError}
                </div>
              ) : null}

              <div className="mt-4 max-w-sm">
                {withinCancellationWindow && cancellationDeadline ? (
                  <form action={cancelEinvoiceAction} className="space-y-2">
                    {hidden}
                    <input type="hidden" name="submissionId" value={latest.id} />
                    <Field label={`Cancel e-invoice (until ${formatTimestamp(cancellationDeadline)})`}>
                      <Input name="reason" placeholder="Cancellation reason" required />
                    </Field>
                    <Button type="submit" variant="danger">
                      Cancel e-invoice
                    </Button>
                  </form>
                ) : (
                  <p className="text-xs text-gray-500">
                    The {CANCELLATION_WINDOW_HOURS}-hour cancellation window
                    {cancellationDeadline ? ` ended ${formatTimestamp(cancellationDeadline)}` : " has passed"} —
                    issue a credit note to reverse this document.
                  </p>
                )}
              </div>
            </div>
            {validation ? (
              <div className="text-center">
                <img src={validation.qrDataUrl} alt="LHDN validation QR code" className="h-40 w-40" />
                <div className="mt-1 text-xs text-gray-500">Validated by LHDN</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {latest && (latest.status === "invalid" || latest.status === "error") ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <div className="mb-1 font-medium">
              {latest.status === "invalid" ? "LHDN rejected this submission:" : "Submission failed:"}
            </div>
            <ul className="list-inside list-disc space-y-0.5">
              {(latest.errorDetails ?? [{ message: "No error details recorded" }]).map((e, i) => (
                <li key={i}>
                  {e.code ? <span className="font-mono">[{e.code}] </span> : null}
                  {e.message}
                  {e.target ? <span className="text-red-600"> ({e.target})</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {submissions.length > 0 ? (
          <div className="mt-2 border-t border-gray-100 pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Submission history
            </h3>
            <ol className="space-y-2">
              {submissions.map((sub) => (
                <li key={sub.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <Badge color={EINVOICE_STATUS_COLOR[sub.status]}>{sub.status}</Badge>
                  <span className="text-gray-500">submitted {formatTimestamp(sub.submittedAt ?? sub.createdAt)}</span>
                  {sub.validatedAt ? (
                    <span className="text-gray-500">validated {formatTimestamp(sub.validatedAt)}</span>
                  ) : null}
                  {sub.documentUuid ? (
                    <span className="font-mono text-xs text-gray-600">{sub.documentUuid}</span>
                  ) : null}
                  {sub.cancellationReason ? (
                    <span className="text-xs text-gray-500">reason: {sub.cancellationReason}</span>
                  ) : null}
                  {sub.errorDetails && sub.errorDetails.length > 0 ? (
                    <span className="text-xs text-red-600">
                      {sub.errorDetails.map((e) => e.message).join("; ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No e-invoice submissions yet.</p>
        )}
      </Card>
    </div>
  );
}
