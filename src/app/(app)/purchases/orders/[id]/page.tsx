import { PurchaseDetailScreen } from "../../shared";

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  return <PurchaseDetailScreen docType="PURCHASE_ORDER" id={id} error={error} />;
}
