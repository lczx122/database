import { requireUser } from "@/server/auth";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { ItemForm } from "../item-form";
import { saveItem } from "../actions";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { error } = await searchParams;

  return (
    <div>
      <PageHeader title="New Item" />
      <ErrorBanner message={error} />
      <ItemForm action={saveItem.bind(null, null)} />
    </div>
  );
}
