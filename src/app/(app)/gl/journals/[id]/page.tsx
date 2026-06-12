import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, journalEntries, journalLines } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { reverseJournalEntry } from "@/server/gl/posting";
import { formatDate, todayLocalISO } from "@/lib/dates";
import { D, formatMoney, sum } from "@/lib/money";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";

const STATUS_COLOR: Record<string, string> = { posted: "green", reversed: "yellow" };

export default async function JournalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { error } = await searchParams;

  const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, id) });
  if (!entry) notFound();

  const lines = await db
    .select({
      id: journalLines.id,
      debit: journalLines.debit,
      credit: journalLines.credit,
      description: journalLines.description,
      accountCode: accounts.code,
      accountName: accounts.name,
    })
    .from(journalLines)
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(eq(journalLines.journalEntryId, id))
    .orderBy(asc(journalLines.id));

  const totalDebit = sum(lines.map((l) => D(l.debit)));
  const totalCredit = sum(lines.map((l) => D(l.credit)));

  const reversedBy = entry.reversedById
    ? await db.query.journalEntries.findFirst({
        where: eq(journalEntries.id, entry.reversedById),
      })
    : null;

  async function reverseAction() {
    "use server";
    await requireUser();
    try {
      await db.transaction(async (tx) => {
        await reverseJournalEntry(tx, id, todayLocalISO());
      });
    } catch (e) {
      redirect(
        `/gl/journals/${id}?error=${encodeURIComponent(
          e instanceof Error ? e.message : "Failed to reverse entry",
        )}`,
      );
    }
    revalidatePath("/gl/journals");
    revalidatePath(`/gl/journals/${id}`);
    redirect(`/gl/journals/${id}`);
  }

  const canReverse = entry.status === "posted" && entry.sourceType === "manual";

  return (
    <div>
      <PageHeader
        title={entry.entryNo}
        subtitle={`${formatDate(entry.entryDate)} — ${entry.description}`}
        actions={
          canReverse ? (
            <form action={reverseAction}>
              <Button type="submit" variant="danger">
                Reverse
              </Button>
            </form>
          ) : undefined
        }
      />
      <ErrorBanner message={error} />

      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd className="mt-0.5">
              <Badge color={STATUS_COLOR[entry.status]}>{entry.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Source</dt>
            <dd className="mt-0.5 text-gray-900">{entry.sourceType}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Date</dt>
            <dd className="mt-0.5 text-gray-900">{formatDate(entry.entryDate)}</dd>
          </div>
          {reversedBy ? (
            <div>
              <dt className="text-gray-500">Reversed by</dt>
              <dd className="mt-0.5">
                <Link
                  href={`/gl/journals/${reversedBy.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {reversedBy.entryNo}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Table>
        <thead>
          <tr>
            <Th>Account</Th>
            <Th>Description</Th>
            <Th className="text-right">Debit</Th>
            <Th className="text-right">Credit</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map((line) => (
            <tr key={line.id}>
              <Td>
                <span className="font-mono text-xs text-gray-500">{line.accountCode}</span>{" "}
                {line.accountName}
              </Td>
              <Td>{line.description}</Td>
              <Td className="text-right tabular-nums">
                {D(line.debit).isZero() ? "" : formatMoney(line.debit)}
              </Td>
              <Td className="text-right tabular-nums">
                {D(line.credit).isZero() ? "" : formatMoney(line.credit)}
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
            <Td>Total</Td>
            <Td></Td>
            <Td className="text-right tabular-nums">{formatMoney(totalDebit)}</Td>
            <Td className="text-right tabular-nums">{formatMoney(totalCredit)}</Td>
          </tr>
        </tfoot>
      </Table>
    </div>
  );
}
