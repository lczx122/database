import { SalesDetailPage } from "../../detail-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  return <SalesDetailPage docType="CREDIT_NOTE" id={id} searchParams={await searchParams} />;
}
