import { requireUser } from "@/server/auth";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { TaxCodeForm } from "../tax-code-form";
import { saveTaxCode } from "../actions";

export default async function NewTaxCodePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;

  return (
    <div>
      <PageHeader title="New Tax Code" />
      <ErrorBanner message={error} />
      <TaxCodeForm action={saveTaxCode.bind(null, null)} />
    </div>
  );
}
