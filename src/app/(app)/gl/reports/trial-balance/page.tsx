import { requireUser } from "@/server/auth";
import { trialBalance } from "@/server/gl/reports";
import { todayLocalISO, formatDate } from "@/lib/dates";
import { D, formatMoney } from "@/lib/money";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requireUser();
  const { asOf } = await searchParams;
  const asOfDate = asOf || todayLocalISO();

  const report = await trialBalance(asOfDate);
  const balanced = D(report.totalDebit).equals(D(report.totalCredit));

  return (
    <div>
      <PageHeader title="Trial Balance" subtitle={`As of ${formatDate(asOfDate)}`} />

      <Card className="mb-4">
        <form method="get" className="flex items-end gap-3">
          <Field label="As of date">
            <Input type="date" name="asOf" defaultValue={asOfDate} required />
          </Field>
          <Button type="submit">Run</Button>
        </form>
      </Card>

      {!balanced ? (
        <ErrorBanner
          message={`Trial balance does not balance: debits ${formatMoney(report.totalDebit)} vs credits ${formatMoney(report.totalCredit)}`}
        />
      ) : null}

      {report.rows.length === 0 ? (
        <EmptyState message="No postings up to this date." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-28">Code</Th>
              <Th>Account</Th>
              <Th className="w-24">Type</Th>
              <Th className="text-right">Debit</Th>
              <Th className="text-right">Credit</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.rows.map((row) => (
              <tr key={row.accountId}>
                <Td className="font-mono">{row.code}</Td>
                <Td>{row.name}</Td>
                <Td className="capitalize">{row.type}</Td>
                <Td className="text-right tabular-nums">{formatMoney(row.debit)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(row.credit)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
              <Td></Td>
              <Td>Total</Td>
              <Td></Td>
              <Td className="text-right tabular-nums">{formatMoney(report.totalDebit)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(report.totalCredit)}</Td>
            </tr>
          </tfoot>
        </Table>
      )}
    </div>
  );
}
