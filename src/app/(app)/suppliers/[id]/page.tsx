import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { ErrorBanner, PageHeader, SuccessBanner } from "@/components/ui";
import { SupplierForm } from "../supplier-form";
import { saveSupplier } from "../actions";

export default async function EditSupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { error, success } = await searchParams;

  const supplier = await db.query.suppliers
    .findFirst({ where: eq(suppliers.id, id) })
    .catch(() => undefined);
  if (!supplier) notFound();

  return (
    <div>
      <PageHeader title={`Supplier ${supplier.code}`} subtitle={supplier.name} />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />
      <SupplierForm supplier={supplier} action={saveSupplier.bind(null, supplier.id)} />
    </div>
  );
}
