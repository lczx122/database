import { requireUser } from "@/server/auth";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { SupplierForm } from "../supplier-form";
import { saveSupplier } from "../actions";

export default async function NewSupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;

  return (
    <div>
      <PageHeader title="New Supplier" />
      <ErrorBanner message={error} />
      <SupplierForm action={saveSupplier.bind(null, null)} />
    </div>
  );
}
