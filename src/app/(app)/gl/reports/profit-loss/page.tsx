import { requireUser } from "@/server/auth";
import { profitAndLoss, type PlRow } from "@/server/gl/reports";
import { todayLocalISO, formatDate } from "@/lib/dates";
import { D, formatMoney } from "@/lib/money";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";

function Section({ title, rows, total }: { title: string; rows: PlRow[]; total: string }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">{title}</h2>
      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No activity in this period.</p>
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-28">Code</Th>
              <Th>Account</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.accountId}>
                <Td className="font-mono">{row.code}</Td>
                <Td>{row.name}</Td>
                <Td className="text-right tabular-nums">{formatMoney(row.amount)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
              <Td></Td>
              <Td>Total {title.toLowerCase()}</Td>
              <Td className="text-right tabular-nums">{formatMoney(total)}</Td>
            </tr>
          </tfoot>
        </Table>
      )}
    </div>
  );
}

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser();
  const { from, to } = await searchParams;
  const today = todayLocalISO();
  const toDate = to || today;
  const fromDate = from || `${toDate.slice(0, 4)}-01-01`;

  const report = await profitAndLoss(fromDate, toDate);
  const netProfit = D(report.netProfit);

  return (
    <div>
      <PageHeader
        title="Profit & Loss"
        subtitle={`${formatDate(fromDate)} — ${formatDate(toDate)}`}
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <Input type="date" name="from" defaultValue={fromDate} required />
          </Field>
          <Field label="To">
            <Input type="date" name="to" defaultValue={toDate} required />
          </Field>
          <Button type="submit">Run</Button>
        </form>
      </Card>

      {report.income.length === 0 && report.expense.length === 0 ? (
        <EmptyState message="No income or expense postings in this period." />
      ) : (
        <>
          <Section title="Income" rows={report.income} total={report.totalIncome} />
          <Section title="Expenses" rows={report.expense} total={report.totalExpense} />

          <Card>
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-gray-900">
                {netProfit.lt(0) ? "Net loss" : "Net profit"}
              </span>
              <span
                className={`tabular-nums ${netProfit.lt(0) ? "text-red-600" : "text-green-700"}`}
              >
                {formatMoney(report.netProfit)}
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
