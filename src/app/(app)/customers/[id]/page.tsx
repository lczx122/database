import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { Button, ErrorBanner, PageHeader, SuccessBanner } from "@/components/ui";
import { CustomerForm } from "../customer-form";
import { saveCustomer, validateCustomerTin } from "../actions";

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { error, success } = await searchParams;

  const customer = await db.query.customers
    .findFirst({ where: eq(customers.id, id) })
    .catch(() => undefined);
  if (!customer) notFound();

  return (
    <div>
      <PageHeader
        title={`Customer ${customer.code}`}
        subtitle={customer.name}
        actions={
          <form action={validateCustomerTin.bind(null, customer.id)}>
            <Button type="submit" variant="secondary">
              Validate TIN with LHDN
            </Button>
          </form>
        }
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />
      <CustomerForm customer={customer} action={saveCustomer.bind(null, customer.id)} />
    </div>
  );
}
