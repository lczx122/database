import { requireUser } from "@/server/auth";
import { balanceSheet, type BsRow } from "@/server/gl/reports";
import { todayLocalISO, formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  SuccessBanner,
  Table,
  Td,
  Th,
} from "@/components/ui";

function Section({ title, rows, total }: { title: string; rows: BsRow[]; total: string }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">{title}</h2>
      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No balances.</p>
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
              <tr key={`${row.code}-${row.name}`}>
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

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requireUser();
  const { asOf } = await searchParams;
  const asOfDate = asOf || todayLocalISO();

  const report = await balanceSheet(asOfDate);

  return (
    <div>
      <PageHeader title="Balance Sheet" subtitle={`As of ${formatDate(asOfDate)}`} />

      <Card className="mb-4">
        <form method="get" className="flex items-end gap-3">
          <Field label="As of date">
            <Input type="date" name="asOf" defaultValue={asOfDate} required />
          </Field>
          <Button type="submit">Run</Button>
        </form>
      </Card>

      {report.balanced ? (
        <SuccessBanner
          message={`Balanced: assets ${formatMoney(report.totalAssets)} = liabilities ${formatMoney(report.totalLiabilities)} + equity ${formatMoney(report.totalEquity)}`}
        />
      ) : (
        <ErrorBanner
          message={`Out of balance by ${formatMoney(report.difference)}: assets ${formatMoney(report.totalAssets)} vs liabilities + equity ${formatMoney(report.totalLiabilities)} + ${formatMoney(report.totalEquity)}`}
        />
      )}

      <Section title="Assets" rows={report.assets} total={report.totalAssets} />
      <Section title="Liabilities" rows={report.liabilities} total={report.totalLiabilities} />
      <Section title="Equity" rows={report.equity} total={report.totalEquity} />
    </div>
  );
}
