import { SalesEditorPage } from "../../../editor-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SalesEditorPage docType="DEBIT_NOTE" documentId={id} />;
}
