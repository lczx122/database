import { PurchaseDetailScreen } from "../../shared";

export default async function SupplierBillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  return <PurchaseDetailScreen docType="SUPPLIER_BILL" id={id} error={error} />;
}
