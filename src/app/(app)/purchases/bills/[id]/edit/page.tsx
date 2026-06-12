import { PurchaseEditScreen } from "../../../shared";

export default async function EditSupplierBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseEditScreen docType="SUPPLIER_BILL" id={id} />;
}
