"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { items } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { D, toDb2 } from "@/lib/money";

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const optional = (formData: FormData, key: string) => field(formData, key) || null;

export async function saveItem(id: string | null, formData: FormData): Promise<void> {
  await requireUser();

  const backTo = id ? `/items/${id}` : "/items/new";
  const fail = (message: string) => redirect(`${backTo}?error=${encodeURIComponent(message)}`);

  const unitPriceRaw = field(formData, "unitPrice") || "0";
  const costRaw = field(formData, "cost") || "0";
  if (Number.isNaN(Number(unitPriceRaw)) || Number.isNaN(Number(costRaw))) {
    fail("Unit price and cost must be numbers");
  }

  const data = {
    code: field(formData, "code"),
    name: field(formData, "name"),
    description: optional(formData, "description"),
    type: (field(formData, "type") === "service" ? "service" : "product") as "product" | "service",
    classificationCode: field(formData, "classificationCode"),
    uomCode: field(formData, "uomCode"),
    unitPrice: toDb2(D(unitPriceRaw)),
    cost: toDb2(D(costRaw)),
    salesTaxCodeId: optional(formData, "salesTaxCodeId"),
    purchaseTaxCodeId: optional(formData, "purchaseTaxCodeId"),
    trackStock: formData.get("trackStock") === "on",
    isActive: formData.get("isActive") === "on",
    updatedAt: new Date(),
  };

  if (!data.code || !data.name) fail("Code and name are required");

  try {
    if (id) {
      await db.update(items).set(data).where(eq(items.id, id));
    } else {
      await db.insert(items).values(data);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : "Failed to save item");
  }

  revalidatePath("/items");
  if (id) revalidatePath(`/items/${id}`);
  redirect("/items");
}
