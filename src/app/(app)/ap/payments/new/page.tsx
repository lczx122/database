import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, paymentModeCodes, payments, suppliers } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { allocate, openPurchaseBills } from "@/server/arap/allocation";
import { postingForPayment, postJournalEntry } from "@/server/gl/posting";
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

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; error?: string }>;
}) {
  await requireUser();
  const { supplierId = "", error } = await searchParams;

  const [supplierRows, bankAccounts, modes] = await Promise.all([
    db
      .select({ id: suppliers.id, code: suppliers.code, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.isActive, true))
      .orderBy(asc(suppliers.name)),
    db
      .select({ id: accounts.id, code: accounts.code, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.type, "asset"), eq(accounts.isActive, true)))
      .orderBy(asc(accounts.code)),
    db.select().from(paymentModeCodes).orderBy(asc(paymentModeCodes.code)),
  ]);

  const openBills = supplierId ? await openPurchaseBills(supplierId) : [];

  async function createPayment(formData: FormData) {
    "use server";
    await requireUser();

    const suppId = String(formData.get("supplierId") ?? "");
    const docDate = String(formData.get("docDate") ?? "");
    const bankAccountId = String(formData.get("bankAccountId") ?? "");
    const paymentModeCode = String(formData.get("paymentModeCode") ?? "01");
    const amountRaw = String(formData.get("amount") ?? "");
    const reference = String(formData.get("reference") ?? "").trim();

    const fail = (msg: string) =>
      redirect(
        `/ap/payments/new?supplierId=${encodeURIComponent(suppId)}&error=${encodeURIComponent(msg)}`,
      );

    if (!suppId) fail("Choose a supplier");
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
        `Allocations (${toDb2(allocatedTotal)}) exceed the payment amount (${toDb2(amount)})`,
      );
    }

    let paymentId = "";
    try {
      paymentId = await db.transaction(async (tx) => {
        const supplier = await tx.query.suppliers.findFirst({ where: eq(suppliers.id, suppId) });
        if (!supplier) throw new Error("Supplier not found");
        const bank = await tx.query.accounts.findFirst({
          where: eq(accounts.id, bankAccountId),
        });
        if (!bank) throw new Error("Bank account not found");

        const docNo = await nextDocNo(tx, "PAYMENT");
        const [payment] = await tx
          .insert(payments)
          .values({
            docNo,
            docDate,
            supplierId: suppId,
            bankAccountId,
            paymentModeCode,
            amount: toDb2(amount),
            reference: reference || null,
          })
          .returning();

        const mappings = await getAccountMappings();
        const entryId = await postJournalEntry(
          tx,
          postingForPayment({
            docNo,
            docDate,
            supplierId: suppId,
            supplierName: supplier.name,
            amount: toDb2(amount),
            bankAccountCode: bank.code,
            apControlCode: mappings.apControl,
          }),
          payment.id,
        );
        await tx
          .update(payments)
          .set({ postedJournalEntryId: entryId })
          .where(eq(payments.id, payment.id));

        for (const alloc of allocs) {
          await allocate(tx, {
            type: "payment",
            sourceId: payment.id,
            targetDocumentId: alloc.targetDocumentId,
            amount: alloc.amount,
          });
        }

        return payment.id;
      });
    } catch (e) {
      fail(e instanceof Error ? e.message : "Failed to create payment");
    }

    revalidatePath("/ap/payments");
    redirect(`/ap/payments/${paymentId}`);
  }

  return (
    <div>
      <PageHeader title="New Payment" subtitle="Record a supplier payment" />
      <ErrorBanner message={error} />

      <form action={createPayment}>
        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Supplier">
              <PartyPicker
                name="supplierId"
                paramName="supplierId"
                options={supplierRows}
                value={supplierId}
                placeholder="— Choose supplier —"
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
              <Input name="reference" placeholder="e.g. cheque no" />
            </Field>
          </div>
        </Card>

        <Card className="mb-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Allocate to open bills</h2>
          {!supplierId ? (
            <p className="text-sm text-gray-500">Choose a supplier to see their open bills.</p>
          ) : openBills.length === 0 ? (
            <p className="text-sm text-gray-500">This supplier has no open bills.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Doc No</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Open balance</Th>
                  <Th className="w-40 text-right">Allocate</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {openBills.map((doc) => (
                  <tr key={doc.id}>
                    <Td className="font-medium">{doc.docNo}</Td>
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
            Allocations may total less than the payment amount — the remainder stays unallocated.
          </p>
        </Card>

        <Button type="submit">Create payment</Button>
      </form>
    </div>
  );
}
