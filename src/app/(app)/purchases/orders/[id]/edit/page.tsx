import { PurchaseEditScreen } from "../../../shared";

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseEditScreen docType="PURCHASE_ORDER" id={id} />;
}
