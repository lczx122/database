import { requireUser } from "@/server/auth";
import { apAging, arAging, type AgingReport } from "@/server/arap/aging";
import { todayLocalISO, formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";

function AgingTable({ title, report }: { title: string; report: AgingReport }) {
  return (
    <div className="mb-8">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">{title}</h2>
      {report.rows.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No open balances.</p>
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-24">Code</Th>
              <Th>Name</Th>
              <Th className="text-right">Current (0-30)</Th>
              <Th className="text-right">31-60</Th>
              <Th className="text-right">61-90</Th>
              <Th className="text-right">Over 90</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.rows.map((row) => (
              <tr key={row.partyId}>
                <Td className="font-mono">{row.code}</Td>
                <Td>{row.name}</Td>
                <Td className="text-right tabular-nums">{formatMoney(row.current)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(row.days31to60)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(row.days61to90)}</Td>
                <Td className="text-right tabular-nums">{formatMoney(row.over90)}</Td>
                <Td className="text-right font-medium tabular-nums">{formatMoney(row.total)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
              <Td></Td>
              <Td>Total</Td>
              <Td className="text-right tabular-nums">{formatMoney(report.totals.current)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(report.totals.days31to60)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(report.totals.days61to90)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(report.totals.over90)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(report.totals.total)}</Td>
            </tr>
          </tfoot>
        </Table>
      )}
    </div>
  );
}

export default async function AgingPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  await requireUser();
  const { asOf } = await searchParams;
  const asOfDate = asOf || todayLocalISO();

  const [ar, ap] = await Promise.all([arAging(asOfDate), apAging(asOfDate)]);

  return (
    <div>
      <PageHeader title="AR / AP Aging" subtitle={`As of ${formatDate(asOfDate)}`} />

      <Card className="mb-4">
        <form method="get" className="flex items-end gap-3">
          <Field label="As of date">
            <Input type="date" name="asOf" defaultValue={asOfDate} required />
          </Field>
          <Button type="submit">Run</Button>
        </form>
      </Card>

      <AgingTable title="Accounts Receivable (customers)" report={ar} />
      <AgingTable title="Accounts Payable (suppliers)" report={ap} />
    </div>
  );
}
