"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { taxCodes } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { MYINVOIS_TAX_TYPES } from "./tax-types";

const field = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function saveTaxCode(id: string | null, formData: FormData): Promise<void> {
  await requireUser();

  const backTo = id ? `/tax-codes/${id}` : "/tax-codes/new";
  const fail = (message: string) => redirect(`${backTo}?error=${encodeURIComponent(message)}`);

  const rateRaw = field(formData, "rate") || "0";
  const taxType = field(formData, "myinvoisTaxTypeCode");
  const exemptionReason = field(formData, "exemptionReason") || null;

  const data = {
    code: field(formData, "code"),
    description: field(formData, "description"),
    rate: rateRaw,
    myinvoisTaxTypeCode: MYINVOIS_TAX_TYPES.some((t) => t.code === taxType) ? taxType : "06",
    exemptionReason,
    isActive: formData.get("isActive") === "on",
  };

  if (!data.code || !data.description) fail("Code and description are required");
  if (Number.isNaN(Number(rateRaw))) fail("Rate must be a number");
  if (data.myinvoisTaxTypeCode === "E" && !exemptionReason) {
    fail("Exemption reason is required when tax type is E (Tax Exempt)");
  }

  try {
    if (id) {
      await db.update(taxCodes).set(data).where(eq(taxCodes.id, id));
    } else {
      await db.insert(taxCodes).values(data);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : "Failed to save tax code");
  }

  revalidatePath("/tax-codes");
  if (id) revalidatePath(`/tax-codes/${id}`);
  redirect("/tax-codes");
}
