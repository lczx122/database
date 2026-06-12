import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { todayLocalISO } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { JournalForm } from "./journal-form";

export default async function NewJournalPage() {
  await requireUser();

  const accountRows = await db
    .select({ code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(and(eq(accounts.isActive, true)))
    .orderBy(asc(accounts.code));

  return (
    <div>
      <PageHeader title="New Journal Entry" subtitle="Manual general ledger posting" />
      <JournalForm accounts={accountRows} defaultDate={todayLocalISO()} />
    </div>
  );
}
