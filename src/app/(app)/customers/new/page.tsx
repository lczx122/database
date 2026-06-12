import { requireUser } from "@/server/auth";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { CustomerForm } from "../customer-form";
import { saveCustomer } from "../actions";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;

  return (
    <div>
      <PageHeader title="New Customer" />
      <ErrorBanner message={error} />
      <CustomerForm action={saveCustomer.bind(null, null)} />
    </div>
  );
}
