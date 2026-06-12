"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  LinkButton,
  Select,
  Textarea,
} from "@/components/ui";
import { saveDocumentAction, type SaveDocumentState } from "./actions";
import type { SalesDocType } from "./doc-config";

// All numeric math in this component is plain JS and DISPLAY ONLY — the
// server action recomputes every amount with Decimal before saving.

export interface CustomerOption {
  id: string;
  name: string;
  code: string;
  paymentModeCode: string;
  creditTermsDays: number;
}

export interface ItemOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  classificationCode: string;
  uomCode: string;
  unitPrice: string;
  salesTaxCodeId: string | null;
}

export interface TaxCodeOption {
  id: string;
  code: string;
  description: string;
  rate: string;
  myinvoisTaxTypeCode: string;
  exemptionReason: string | null;
}

export interface CodeOption {
  code: string;
  label: string;
}

export interface ReferenceInvoiceOption {
  id: string;
  docNo: string;
  docDate: string;
  customerId: string;
  total: string;
}

export interface LineDraft {
  itemId: string;
  description: string;
  classificationCode: string;
  quantity: string;
  uomCode: string;
  unitPrice: string;
  discountAmount: string;
  taxCodeId: string;
}

export interface DocumentFormInitial {
  documentId: string | null;
  customerId: string;
  docDate: string;
  paymentModeCode: string;
  paymentTermsDays: number;
  notes: string;
  referenceDocId: string;
  lines: LineDraft[];
}

const emptyLine = (): LineDraft => ({
  itemId: "",
  description: "",
  classificationCode: "022",
  quantity: "1",
  uomCode: "C62",
  unitPrice: "0",
  discountAmount: "0",
  taxCodeId: "",
});

const num = (v: string): number => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number): string =>
  n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function lineDisplayTotals(line: LineDraft, taxRateByCodeId: Map<string, number>) {
  const subtotal = num(line.quantity) * num(line.unitPrice) - num(line.discountAmount);
  const rate = line.taxCodeId ? (taxRateByCodeId.get(line.taxCodeId) ?? 0) : 0;
  const tax = (subtotal * rate) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

export function DocumentForm({
  docType,
  singular,
  basePath,
  initial,
  customers,
  items,
  taxCodes,
  classificationCodes,
  uomCodes,
  paymentModes,
  referenceInvoices,
}: {
  docType: SalesDocType;
  singular: string;
  basePath: string;
  initial: DocumentFormInitial;
  customers: CustomerOption[];
  items: ItemOption[];
  taxCodes: TaxCodeOption[];
  classificationCodes: CodeOption[];
  uomCodes: CodeOption[];
  paymentModes: CodeOption[];
  referenceInvoices: ReferenceInvoiceOption[];
}) {
  const [state, formAction, pending] = useActionState<SaveDocumentState, FormData>(
    saveDocumentAction,
    { error: null },
  );

  const [customerId, setCustomerId] = useState(initial.customerId);
  const [paymentModeCode, setPaymentModeCode] = useState(initial.paymentModeCode);
  const [paymentTermsDays, setPaymentTermsDays] = useState(String(initial.paymentTermsDays));
  const [referenceDocId, setReferenceDocId] = useState(initial.referenceDocId);
  const [lines, setLines] = useState<LineDraft[]>(
    initial.lines.length > 0 ? initial.lines : [emptyLine()],
  );

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const taxRateByCodeId = useMemo(
    () => new Map(taxCodes.map((t) => [t.id, num(t.rate)])),
    [taxCodes],
  );

  const isCreditOrDebit = docType !== "INVOICE";
  const customerInvoices = useMemo(
    () => referenceInvoices.filter((r) => r.customerId === customerId),
    [referenceInvoices, customerId],
  );

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const onItemSelect = (index: number, itemId: string) => {
    if (!itemId) {
      updateLine(index, { itemId: "" });
      return;
    }
    const item = itemById.get(itemId);
    if (!item) return;
    updateLine(index, {
      itemId,
      description: item.description?.trim() ? item.description : item.name,
      classificationCode: item.classificationCode,
      uomCode: item.uomCode,
      unitPrice: item.unitPrice,
      taxCodeId: item.salesTaxCodeId ?? "",
    });
  };

  const onCustomerSelect = (id: string) => {
    setCustomerId(id);
    setReferenceDocId("");
    const customer = customers.find((c) => c.id === id);
    if (customer) {
      setPaymentModeCode(customer.paymentModeCode);
      setPaymentTermsDays(String(customer.creditTermsDays));
    }
  };

  const totals = lines.reduce(
    (acc, line) => {
      const t = lineDisplayTotals(line, taxRateByCodeId);
      return { subtotal: acc.subtotal + t.subtotal, tax: acc.tax + t.tax, total: acc.total + t.total };
    },
    { subtotal: 0, tax: 0, total: 0 },
  );

  return (
    <form action={formAction} className="space-y-4">
      <ErrorBanner message={state.error} />
      <input type="hidden" name="docType" value={docType} />
      {initial.documentId ? <input type="hidden" name="documentId" value={initial.documentId} /> : null}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="referenceDocId" value={referenceDocId} />

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Customer">
            <Select
              name="customerId"
              value={customerId}
              onChange={(e) => onCustomerSelect(e.target.value)}
              required
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Document date">
            <Input name="docDate" type="date" defaultValue={initial.docDate} required />
          </Field>
          {isCreditOrDebit ? (
            <Field label="Reference invoice (required)">
              <Select
                value={referenceDocId}
                onChange={(e) => setReferenceDocId(e.target.value)}
                required
                disabled={!customerId}
              >
                <option value="">
                  {customerId
                    ? customerInvoices.length > 0
                      ? "Select issued invoice…"
                      : "No issued invoices for this customer"
                    : "Select a customer first"}
                </option>
                {customerInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.docNo} — {inv.docDate} — {fmt(num(inv.total))}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Payment mode">
            <Select
              name="paymentModeCode"
              value={paymentModeCode}
              onChange={(e) => setPaymentModeCode(e.target.value)}
            >
              {paymentModes.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment terms (days)">
            <Input
              name="paymentTermsDays"
              type="number"
              min={0}
              step={1}
              value={paymentTermsDays}
              onChange={(e) => setPaymentTermsDays(e.target.value)}
              required
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
            <Textarea name="notes" rows={2} defaultValue={initial.notes} />
          </Field>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Description</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Classification</th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Qty</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">UOM</th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Unit price</th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Discount</th>
              <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tax</th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Subtotal</th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Tax amt</th>
              <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Total</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((line, index) => {
              const display = lineDisplayTotals(line, taxRateByCodeId);
              return (
                <tr key={index} className="align-top">
                  <td className="px-2 py-1.5">
                    <Select
                      value={line.itemId}
                      onChange={(e) => onItemSelect(index, e.target.value)}
                      className="min-w-36"
                    >
                      <option value="">— none —</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.code} — {i.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                      className="min-w-44"
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={line.classificationCode}
                      onChange={(e) => updateLine(index, { classificationCode: e.target.value })}
                      className="min-w-28"
                    >
                      {classificationCodes.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                      className="w-20 text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={line.uomCode}
                      onChange={(e) => updateLine(index, { uomCode: e.target.value })}
                      className="min-w-24"
                    >
                      {uomCodes.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.code} — {u.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                      className="w-24 text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={line.discountAmount}
                      onChange={(e) => updateLine(index, { discountAmount: e.target.value })}
                      className="w-24 text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select
                      value={line.taxCodeId}
                      onChange={(e) => updateLine(index, { taxCodeId: e.target.value })}
                      className="min-w-28"
                    >
                      <option value="">No tax</option>
                      {taxCodes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} ({num(t.rate)}%)
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-700">{fmt(display.subtotal)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-700">{fmt(display.tax)}</td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums text-gray-900">{fmt(display.total)}</td>
                  <td className="px-2 py-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      disabled={lines.length === 1}
                      title="Remove line"
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-gray-200 bg-gray-50">
            <tr>
              <td colSpan={8} className="px-2 py-2 text-right text-sm font-medium text-gray-600">
                Totals
              </td>
              <td className="px-2 py-2 text-right font-medium tabular-nums text-gray-900">{fmt(totals.subtotal)}</td>
              <td className="px-2 py-2 text-right font-medium tabular-nums text-gray-900">{fmt(totals.tax)}</td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums text-gray-900">{fmt(totals.total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <div className="border-t border-gray-200 px-3 py-2">
          <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            + Add line
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <LinkButton variant="secondary" href={initial.documentId ? `${basePath}/${initial.documentId}` : basePath}>
          Cancel
        </LinkButton>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : `Save ${singular.toLowerCase()} draft`}
        </Button>
      </div>
    </form>
  );
}
