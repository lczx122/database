import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { todayLocalISO } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { AdjustmentForm } from "./adjustment-form";

export default async function NewStockAdjustmentPage() {
  await requireUser();

  const itemRows = await db
    .select({ id: items.id, code: items.code, name: items.name, cost: items.cost })
    .from(items)
    .where(and(eq(items.trackStock, true), eq(items.isActive, true)))
    .orderBy(asc(items.code));

  return (
    <div>
      <PageHeader title="New Stock Adjustment" subtitle="Adjust quantities of tracked items" />
      <AdjustmentForm items={itemRows} defaultDate={todayLocalISO()} />
    </div>
  );
}
