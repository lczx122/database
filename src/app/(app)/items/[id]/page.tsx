import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { ErrorBanner, PageHeader, SuccessBanner } from "@/components/ui";
import { ItemForm } from "../item-form";
import { saveItem } from "../actions";

export default async function EditItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { error, success } = await searchParams;

  const item = await db.query.items.findFirst({ where: eq(items.id, id) }).catch(() => undefined);
  if (!item) notFound();

  return (
    <div>
      <PageHeader title={`Item ${item.code}`} subtitle={item.name} />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />
      <ItemForm item={item} action={saveItem.bind(null, item.id)} />
    </div>
  );
}
