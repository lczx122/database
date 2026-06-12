import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { einvoiceSubmissions, salesDocuments } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { refreshSubmissionStatus } from "@/server/einvoice/service";
import { formatMoney } from "@/lib/money";
import {
  Badge,
  Button,
  EINVOICE_STATUS_COLOR,
  EmptyState,
  ErrorBanner,
  PageHeader,
  SuccessBanner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { isSalesDocType, salesBasePath } from "../sales/doc-config";

const FILTERS: Record<string, { label: string; statuses: string[] | null }> = {
  all: { label: "All", statuses: null },
  attention: { label: "Needs attention", statuses: ["invalid", "error"] },
  awaiting: { label: "Awaiting", statuses: ["submitting", "submitted"] },
  valid: { label: "Valid", statuses: ["valid"] },
  cancelled: { label: "Cancelled", statuses: ["cancelled"] },
};

function formatTimestamp(value: Date | null): string {
  if (!value) return "—";
  const dd = String(value.getDate()).padStart(2, "0");
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const hh = String(value.getHours()).padStart(2, "0");
  const mi = String(value.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${value.getFullYear()} ${hh}:${mi}`;
}

export default async function EinvoiceMonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; success?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const filterKey = params.status && params.status in FILTERS ? params.status : "all";
  const filter = FILTERS[filterKey];

  const rows = await db
    .select({
      sub: einvoiceSubmissions,
      docId: salesDocuments.id,
      docType: salesDocuments.docType,
      partySnapshot: salesDocuments.partySnapshot,
      total: salesDocuments.total,
    })
    .from(einvoiceSubmissions)
    .leftJoin(salesDocuments, eq(einvoiceSubmissions.salesDocumentId, salesDocuments.id))
    .where(
      filter.statuses
        ? inArray(
            einvoiceSubmissions.status,
            filter.statuses as (typeof einvoiceSubmissions.status.enumValues)[number][],
          )
        : undefined,
    )
    .orderBy(desc(einvoiceSubmissions.createdAt));

  async function refreshAllPendingAction() {
    "use server";
    await requireUser();
    const pending = await db
      .select({ id: einvoiceSubmissions.id })
      .from(einvoiceSubmissions)
      .where(eq(einvoiceSubmissions.status, "submitted"));

    let refreshed = 0;
    const failures: string[] = [];
    for (const row of pending) {
      try {
        await refreshSubmissionStatus(row.id);
        refreshed++;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    revalidatePath("/einvoice");
    if (failures.length > 0) {
      redirect(
        `/einvoice?error=${encodeURIComponent(
          `Refreshed ${refreshed} of ${pending.length} submissions. First failure: ${failures[0]}`,
        )}`,
      );
    }
    redirect(
      `/einvoice?success=${encodeURIComponent(
        pending.length === 0 ? "No pending submissions to refresh" : `Refreshed ${refreshed} submission(s)`,
      )}`,
    );
  }

  return (
    <div>
      <PageHeader
        title="e-Invoice Monitor"
        subtitle="All MyInvois submissions, newest first"
        actions={
          <form action={refreshAllPendingAction}>
            <Button type="submit" variant="secondary">
              Refresh all pending
            </Button>
          </form>
        }
      />
      <ErrorBanner message={params.error} />
      <SuccessBanner message={params.success} />

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(FILTERS).map(([key, f]) => (
          <Link
            key={key}
            href={key === "all" ? "/einvoice" : `/einvoice?status=${key}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              key === filterKey
                ? "bg-blue-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState message="No e-invoice submissions match this filter." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Internal ID</Th>
              <Th>Type</Th>
              <Th>Version</Th>
              <Th>Customer</Th>
              <Th className="text-right">Total</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
              <Th>Validated</Th>
              <Th>LHDN UUID</Th>
              <Th>Document</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ sub, docId, docType, partySnapshot, total }) => {
              const docHref =
                docId && docType && isSalesDocType(docType)
                  ? `${salesBasePath(docType)}/${docId}`
                  : null;
              return (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <Td className="font-medium">{sub.internalId}</Td>
                  <Td>{sub.einvoiceTypeCode}</Td>
                  <Td>{sub.version}</Td>
                  <Td>{partySnapshot?.name ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{total ? formatMoney(total) : "—"}</Td>
                  <Td>
                    <Badge color={EINVOICE_STATUS_COLOR[sub.status]}>{sub.status}</Badge>
                  </Td>
                  <Td>{formatTimestamp(sub.submittedAt)}</Td>
                  <Td>{formatTimestamp(sub.validatedAt)}</Td>
                  <Td className="max-w-48 truncate font-mono text-xs" >
                    {sub.documentUuid ?? "—"}
                  </Td>
                  <Td>
                    {docHref ? (
                      <Link href={docHref} className="text-blue-600 hover:underline">
                        View
                      </Link>
                    ) : (
                      "—"
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
