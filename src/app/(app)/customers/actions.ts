"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { customers, idTypeEnum } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { getConfig, validateTin } from "@/server/einvoice/api/client";

type IdType = (typeof idTypeEnum)[number];

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const optional = (formData: FormData, key: string) => field(formData, key) || null;
const parseIdType = (value: string): IdType =>
  (idTypeEnum as readonly string[]).includes(value) ? (value as IdType) : "BRN";

export async function saveCustomer(id: string | null, formData: FormData): Promise<void> {
  await requireUser();

  const terms = Number.parseInt(field(formData, "creditTermsDays"), 10);
  const data = {
    code: field(formData, "code"),
    name: field(formData, "name"),
    tin: field(formData, "tin"),
    idType: parseIdType(field(formData, "idType")),
    idValue: field(formData, "idValue"),
    sstNo: optional(formData, "sstNo"),
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

  const backTo = id ? `/customers/${id}` : "/customers/new";
  if (!data.code || !data.name) {
    redirect(`${backTo}?error=${encodeURIComponent("Code and name are required")}`);
  }

  try {
    if (id) {
      await db.update(customers).set(data).where(eq(customers.id, id));
    } else {
      await db.insert(customers).values(data);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save customer";
    redirect(`${backTo}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/customers");
  if (id) revalidatePath(`/customers/${id}`);
  redirect("/customers");
}

export async function validateCustomerTin(id: string): Promise<void> {
  await requireUser();
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  if (!customer) redirect("/customers");

  let ok = false;
  let message: string;
  if (!customer.tin || !customer.idValue) {
    message = "Customer must have a TIN and ID value before validating";
  } else {
    try {
      const config = await getConfig();
      ok = await validateTin(config, customer.tin, customer.idType, customer.idValue);
      message = ok
        ? `TIN ${customer.tin} is valid for ${customer.idType} ${customer.idValue}`
        : `TIN ${customer.tin} was not found for ${customer.idType} ${customer.idValue}`;
    } catch (err) {
      message = err instanceof Error ? err.message : "TIN validation failed";
    }
  }

  redirect(`/customers/${id}?${ok ? "success" : "error"}=${encodeURIComponent(message)}`);
}
