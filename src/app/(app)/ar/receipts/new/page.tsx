import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, customers, paymentModeCodes, receipts } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { allocate, openSalesInvoices } from "@/server/arap/allocation";
import { postingForReceipt, postJournalEntry } from "@/server/gl/posting";
import { nextDocNo } from "@/server/documents/numbering";
import { getAccountMappings } from "@/server/settings";
import { formatDate, todayLocalISO } from "@/lib/dates";
import { D, formatMoney, toDb2, ZERO } from "@/lib/money";
import { PartyPicker } from "@/components/party-picker";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; error?: string }>;
}) {
  await requireUser();
  const { customerId = "", error } = await searchParams;

  const [customerRows, bankAccounts, modes] = await Promise.all([
    db
      .select({ id: customers.id, code: customers.code, name: customers.name })
      .from(customers)
      .where(eq(customers.isActive, true))
      .orderBy(asc(customers.name)),
    db
      .select({ id: accounts.id, code: accounts.code, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.type, "asset"), eq(accounts.isActive, true)))
      .orderBy(asc(accounts.code)),
    db.select().from(paymentModeCodes).orderBy(asc(paymentModeCodes.code)),
  ]);

  const openInvoices = customerId ? await openSalesInvoices(customerId) : [];

  async function createReceipt(formData: FormData) {
    "use server";
    await requireUser();

    const custId = String(formData.get("customerId") ?? "");
    const docDate = String(formData.get("docDate") ?? "");
    const bankAccountId = String(formData.get("bankAccountId") ?? "");
    const paymentModeCode = String(formData.get("paymentModeCode") ?? "01");
    const amountRaw = String(formData.get("amount") ?? "");
    const reference = String(formData.get("reference") ?? "").trim();

    const fail = (msg: string) =>
      redirect(
        `/ar/receipts/new?customerId=${encodeURIComponent(custId)}&error=${encodeURIComponent(msg)}`,
      );

    if (!custId) fail("Choose a customer");
    if (!docDate) fail("Date is required");
    if (!bankAccountId) fail("Choose a bank account");
    const amount = D(amountRaw);
    if (amount.lte(ZERO)) fail("Amount must be greater than zero");

    const allocs: Array<{ targetDocumentId: string; amount: string }> = [];
    let allocatedTotal = ZERO;
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("alloc_")) continue;
      const allocAmount = D(String(value));
      if (allocAmount.lte(ZERO)) continue;
      allocs.push({ targetDocumentId: key.slice("alloc_".length), amount: toDb2(allocAmount) });
      allocatedTotal = allocatedTotal.plus(allocAmount);
    }
    if (allocatedTotal.gt(amount)) {
      fail(
        `Allocations (${toDb2(allocatedTotal)}) exceed the receipt amount (${toDb2(amount)})`,
      );
    }

    let receiptId = "";
    try {
      receiptId = await db.transaction(async (tx) => {
        const customer = await tx.query.customers.findFirst({ where: eq(customers.id, custId) });
        if (!customer) throw new Error("Customer not found");
        const bank = await tx.query.accounts.findFirst({
          where: eq(accounts.id, bankAccountId),
        });
        if (!bank) throw new Error("Bank account not found");

        const docNo = await nextDocNo(tx, "RECEIPT");
        const [receipt] = await tx
          .insert(receipts)
          .values({
            docNo,
            docDate,
            customerId: custId,
            bankAccountId,
            paymentModeCode,
            amount: toDb2(amount),
            reference: reference || null,
          })
          .returning();

        const mappings = await getAccountMappings();
        const entryId = await postJournalEntry(
          tx,
          postingForReceipt({
            docNo,
            docDate,
            customerId: custId,
            customerName: customer.name,
            amount: toDb2(amount),
            bankAccountCode: bank.code,
            arControlCode: mappings.arControl,
          }),
          receipt.id,
        );
        await tx
          .update(receipts)
          .set({ postedJournalEntryId: entryId })
          .where(eq(receipts.id, receipt.id));

        for (const alloc of allocs) {
          await allocate(tx, {
            type: "receipt",
            sourceId: receipt.id,
            targetDocumentId: alloc.targetDocumentId,
            amount: alloc.amount,
          });
        }

        return receipt.id;
      });
    } catch (e) {
      fail(e instanceof Error ? e.message : "Failed to create receipt");
    }

    revalidatePath("/ar/receipts");
    redirect(`/ar/receipts/${receiptId}`);
  }

  return (
    <div>
      <PageHeader title="New Receipt" subtitle="Record a customer payment" />
      <ErrorBanner message={error} />

      <form action={createReceipt}>
        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Customer">
              <PartyPicker
                name="customerId"
                paramName="customerId"
                options={customerRows}
                value={customerId}
                placeholder="— Choose customer —"
              />
            </Field>
            <Field label="Date">
              <Input type="date" name="docDate" defaultValue={todayLocalISO()} required />
            </Field>
            <Field label="Bank / cash account">
              <Select name="bankAccountId" required defaultValue="">
                <option value="" disabled>
                  — Choose account —
                </option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payment mode">
              <Select name="paymentModeCode" defaultValue="01">
                {modes.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount">
              <Input
                type="number"
                name="amount"
                step="0.01"
                min="0.01"
                required
                className="text-right"
              />
            </Field>
            <Field label="Reference">
              <Input name="reference" placeholder="e.g. bank slip no" />
            </Field>
          </div>
        </Card>

        <Card className="mb-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Allocate to open invoices</h2>
          {!customerId ? (
            <p className="text-sm text-gray-500">Choose a customer to see their open invoices.</p>
          ) : openInvoices.length === 0 ? (
            <p className="text-sm text-gray-500">This customer has no open invoices.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Doc No</Th>
                  <Th>Type</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Open balance</Th>
                  <Th className="w-40 text-right">Allocate</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {openInvoices.map((doc) => (
                  <tr key={doc.id}>
                    <Td className="font-medium">{doc.docNo}</Td>
                    <Td>{doc.docType}</Td>
                    <Td>{formatDate(doc.docDate)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(doc.total)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(doc.openBalance)}</Td>
                    <Td>
                      <Input
                        type="number"
                        name={`alloc_${doc.id}`}
                        step="0.01"
                        min="0"
                        max={doc.openBalance}
                        placeholder="0.00"
                        className="text-right"
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="mt-2 text-xs text-gray-500">
            Allocations may total less than the receipt amount — the remainder stays unallocated.
          </p>
        </Card>

        <Button type="submit">Create receipt</Button>
      </form>
    </div>
  );
}
