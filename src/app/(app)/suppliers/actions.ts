"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { idTypeEnum, suppliers } from "@/db/schema";
import { requireUser } from "@/server/auth";

type IdType = (typeof idTypeEnum)[number];

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const optional = (formData: FormData, key: string) => field(formData, key) || null;
const parseIdType = (value: string): IdType =>
  (idTypeEnum as readonly string[]).includes(value) ? (value as IdType) : "BRN";

export async function saveSupplier(id: string | null, formData: FormData): Promise<void> {
  await requireUser();

  const terms = Number.parseInt(field(formData, "creditTermsDays"), 10);
  const data = {
    code: field(formData, "code"),
    name: field(formData, "name"),
    tin: field(formData, "tin"),
    idType: parseIdType(field(formData, "idType")),
    idValue: field(formData, "idValue"),
    sstNo: optional(formData, "sstNo"),
    msicCode: optional(formData, "msicCode"),
    email: optional(formData, "email"),
    phone: optional(formData, "phone"),
    addressLine1: field(formData, "addressLine1"),
    addressLine2: optional(formData, "addressLine2"),
    addressLine3: optional(formData, "addressLine3"),
    postcode: field(formData, "postcode"),
    city: field(formData, "city"),
    stateCode: field(formData, "stateCode"),
    countryCode: field(formData, "countryCode"),
    creditTermsDays: Number.isFinite(terms) ? terms : 30,
    paymentModeCode: field(formData, "paymentModeCode"),
    isActive: formData.get("isActive") === "on",
    updatedAt: new Date(),
  };

  const backTo = id ? `/suppliers/${id}` : "/suppliers/new";
  if (!data.code || !data.name) {
    redirect(`${backTo}?error=${encodeURIComponent("Code and name are required")}`);
  }

  try {
    if (id) {
      await db.update(suppliers).set(data).where(eq(suppliers.id, id));
    } else {
      await db.insert(suppliers).values(data);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save supplier";
    redirect(`${backTo}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/suppliers");
  if (id) revalidatePath(`/suppliers/${id}`);
  redirect("/suppliers");
}
