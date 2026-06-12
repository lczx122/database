"use client";

import { useActionState, useState } from "react";
import { Button, Card, ErrorBanner, Field, Input, Select, Td, Th } from "@/components/ui";
import { calcLine, D, formatMoney, sum } from "@/lib/money";
import {
  savePurchaseDocumentAction,
  type PurchaseDocType,
  type PurchaseFormState,
} from "./actions";

export interface SupplierOption {
  id: string;
  code: string;
  name: string;
}

export interface ItemOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitPrice: string;
  cost: string;
  purchaseTaxCodeId: string | null;
}

export interface TaxCodeOption {
  id: string;
  code: string;
  description: string;
  rate: string;
}

export interface LineDefaults {
  itemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxCodeId: string;
}

interface Row extends LineDefaults {
  key: number;
}

const EMPTY_LINE: LineDefaults = {
  itemId: "",
  description: "",
  quantity: "1",
  unitPrice: "",
  discount: "",
  taxCodeId: "",
};

const initialState: PurchaseFormState = { error: null };

export function PurchaseDocForm({
  docType,
  documentId,
  defaults,
  initialLines,
  suppliers,
  items,
  taxCodes,
}: {
  docType: PurchaseDocType;
  documentId?: string;
  defaults?: { supplierId: string; docDate: string; supplierRef: string; notes: string };
  initialLines?: LineDefaults[];
  suppliers: SupplierOption[];
  items: ItemOption[];
  taxCodes: TaxCodeOption[];
}) {
  const [state, formAction, pending] = useActionState(savePurchaseDocumentAction, initialState);

  const startLines: LineDefaults[] =
    initialLines && initialLines.length > 0 ? initialLines : [EMPTY_LINE];
  const [rows, setRows] = useState<Row[]>(startLines.map((l, i) => ({ ...l, key: i })));
  const [nextKey, setNextKey] = useState(startLines.length);

  const addRow = () => {
    setRows((r) => [...r, { ...EMPTY_LINE, key: nextKey }]);
    setNextKey((k) => k + 1);
  };
  const removeRow = (key: number) => setRows((r) => r.filter((row) => row.key !== key));
  const updateRow = (key: number, patch: Partial<LineDefaults>) =>
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const onItemChange = (key: number, itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      updateRow(key, { itemId });
      return;
    }
    updateRow(key, {
      itemId,
      description: item.description || item.name,
      unitPrice: D(item.cost).gt(0) ? item.cost : item.unitPrice,
      taxCodeId: item.purchaseTaxCodeId ?? "",
    });
  };

  const taxRate = (taxCodeId: string) => taxCodes.find((t) => t.id === taxCodeId)?.rate ?? "0";
  const lineTotals = rows.map((row) =>
    calcLine({
      quantity: row.quantity || "0",
      unitPrice: row.unitPrice || "0",
      discountAmount: row.discount || "0",
      taxRate: taxRate(row.taxCodeId),
    }),
  );
  const subtotal = sum(lineTotals.map((l) => l.subtotal));
  const taxTotal = sum(lineTotals.map((l) => l.taxAmount));

  const docLabel = docType === "PURCHASE_ORDER" ? "purchase order" : "bill";

  return (
    <form action={formAction}>
      <input type="hidden" name="docType" value={docType} />
      {documentId ? <input type="hidden" name="documentId" value={documentId} /> : null}

      <ErrorBanner message={state.error} />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Supplier">
            <Select
              name="supplierId"
              required
              defaultValue={defaults?.supplierId ?? ""}
            >
              <option value="" disabled>
                — Choose supplier —
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" name="docDate" defaultValue={defaults?.docDate} required />
          </Field>
          <Field label="Supplier ref">
            <Input
              name="supplierRef"
              defaultValue={defaults?.supplierRef}
              placeholder="Supplier's document no"
            />
          </Field>
          <Field label="Notes">
            <Input name="notes" defaultValue={defaults?.notes} />
          </Field>
        </div>
      </Card>

      <div className="mb-3 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr>
              <Th className="min-w-44">Item</Th>
              <Th className="min-w-48">Description</Th>
              <Th className="w-24">Qty</Th>
              <Th className="w-32">Unit price</Th>
              <Th className="w-28">Discount</Th>
              <Th className="w-36">Tax</Th>
              <Th className="w-28 text-right">Amount</Th>
              <Th className="w-12"></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => (
              <tr key={row.key}>
                <Td>
                  <Select
                    name="lineItem"
                    value={row.itemId}
                    onChange={(e) => onItemChange(row.key, e.target.value)}
                  >
                    <option value="">— None —</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} — {i.name}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Input
                    name="lineDescription"
                    value={row.description}
                    onChange={(e) => updateRow(row.key, { description: e.target.value })}
                    placeholder="Description"
                  />
                </Td>
                <Td>
                  <Input
                    name="lineQty"
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                    className="text-right"
                  />
                </Td>
                <Td>
                  <Input
                    name="lineUnitPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.unitPrice}
                    onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                    placeholder="0.00"
                    className="text-right"
                  />
                </Td>
                <Td>
                  <Input
                    name="lineDiscount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.discount}
                    onChange={(e) => updateRow(row.key, { discount: e.target.value })}
                    placeholder="0.00"
                    className="text-right"
                  />
                </Td>
                <Td>
                  <Select
                    name="lineTaxCode"
                    value={row.taxCodeId}
                    onChange={(e) => updateRow(row.key, { taxCodeId: e.target.value })}
                  >
                    <option value="">No tax</option>
                    {taxCodes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} ({D(t.rate).toFixed(2)}%)
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(lineTotals[idx].total)}
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length <= 1}
                    className="text-xs text-red-600 underline hover:text-red-800 disabled:text-gray-300"
                  >
                    Remove
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <Button type="button" variant="secondary" onClick={addRow}>
          Add line
        </Button>
        <Card className="w-64">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Subtotal</dt>
              <dd className="tabular-nums text-gray-900">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Tax</dt>
              <dd className="tabular-nums text-gray-900">{formatMoney(taxTotal)}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold">
              <dt className="text-gray-900">Total</dt>
              <dd className="tabular-nums text-gray-900">
                {formatMoney(subtotal.plus(taxTotal))}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : documentId ? `Save ${docLabel}` : `Create draft ${docLabel}`}
      </Button>
    </form>
  );
}
