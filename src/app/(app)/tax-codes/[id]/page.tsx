import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { taxCodes } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { ErrorBanner, PageHeader, SuccessBanner } from "@/components/ui";
import { TaxCodeForm } from "../tax-code-form";
import { saveTaxCode } from "../actions";

export default async function EditTaxCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { error, success } = await searchParams;

  const taxCode = await db.query.taxCodes
    .findFirst({ where: eq(taxCodes.id, id) })
    .catch(() => undefined);
  if (!taxCode) notFound();

  return (
    <div>
      <PageHeader title={`Tax Code ${taxCode.code}`} subtitle={taxCode.description} />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />
      <TaxCodeForm taxCode={taxCode} action={saveTaxCode.bind(null, taxCode.id)} />
    </div>
  );
}
