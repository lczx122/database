"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth";
import { postJournalEntry, type JournalEntryDraft } from "@/server/gl/posting";
import { D, toDb2 } from "@/lib/money";

export interface JournalFormState {
  error: string | null;
}

export async function createJournalAction(
  _prev: JournalFormState,
  formData: FormData,
): Promise<JournalFormState> {
  await requireUser();

  const entryDate = String(formData.get("entryDate") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  if (!entryDate) return { error: "Date is required" };

  const accountCodes = formData.getAll("lineAccount").map(String);
  const debits = formData.getAll("lineDebit").map(String);
  const credits = formData.getAll("lineCredit").map(String);
  const lineDescriptions = formData.getAll("lineDescription").map(String);

  const lines = accountCodes
    .map((accountCode, i) => ({
      accountCode,
      debit: D(debits[i] ?? 0),
      credit: D(credits[i] ?? 0),
      description: (lineDescriptions[i] ?? "").trim(),
    }))
    .filter((l) => l.accountCode && !(l.debit.isZero() && l.credit.isZero()));

  if (lines.length === 0) return { error: "Add at least one line with an amount" };
  for (const l of lines) {
    if (l.debit.lt(0) || l.credit.lt(0)) return { error: "Amounts cannot be negative" };
    if (!l.debit.isZero() && !l.credit.isZero()) {
      return { error: "A line cannot have both a debit and a credit" };
    }
  }

  const draft: JournalEntryDraft = {
    entryDate,
    description,
    sourceType: "manual",
    lines: lines.map((l) => ({
      accountCode: l.accountCode,
      debit: toDb2(l.debit),
      credit: toDb2(l.credit),
      description: l.description,
    })),
  };

  try {
    await db.transaction(async (tx) => {
      await postJournalEntry(tx, draft);
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to post journal entry" };
  }

  revalidatePath("/gl/journals");
  redirect("/gl/journals");
}
