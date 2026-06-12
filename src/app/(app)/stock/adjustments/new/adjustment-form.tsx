"use client";

import { useActionState, useState } from "react";
import { Button, Card, ErrorBanner, Field, Input, Select, Td, Th } from "@/components/ui";
import { createAdjustmentAction, type AdjustmentFormState } from "./actions";

export interface ItemOption {
  id: string;
  code: string;
  name: string;
  cost: string;
}

interface Row {
  id: number;
  itemId: string;
  cost: string;
}

const initialState: AdjustmentFormState = { error: null };

export function AdjustmentForm({
  items,
  defaultDate,
}: {
  items: ItemOption[];
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(createAdjustmentAction, initialState);
  const [rows, setRows] = useState<Row[]>([{ id: 0, itemId: "", cost: "" }]);
  const [nextId, setNextId] = useState(1);

  const addRow = () => {
    setRows((r) => [...r, { id: nextId, itemId: "", cost: "" }]);
    setNextId((id) => id + 1);
  };
  const removeRow = (id: number) => setRows((r) => r.filter((row) => row.id !== id));
  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <form action={formAction}>
      <ErrorBanner message={state.error} />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Date">
            <Input type="date" name="docDate" defaultValue={defaultDate} required />
          </Field>
          <Field label="Reason" className="sm:col-span-2">
            <Input name="reason" placeholder="e.g. Stocktake variance" />
          </Field>
        </div>
      </Card>

      <div className="mb-3 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr>
              <Th>Item</Th>
              <Th className="w-40">Qty change (+/-)</Th>
              <Th className="w-40">Unit cost (for +)</Th>
              <Th className="w-12"></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>
                  <Select
                    name="lineItem"
                    value={row.itemId}
                    onChange={(e) => {
                      const item = items.find((i) => i.id === e.target.value);
                      updateRow(row.id, { itemId: e.target.value, cost: item?.cost ?? "" });
                    }}
                  >
                    <option value="">— Item —</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} — {i.name}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Input
                    name="lineQty"
                    type="number"
                    step="0.0001"
                    placeholder="e.g. -2 or 5"
                    className="text-right"
                  />
                </Td>
                <Td>
                  <Input
                    name="lineCost"
                    type="number"
                    step="0.000001"
                    min="0"
                    value={row.cost}
                    onChange={(e) => updateRow(row.id, { cost: e.target.value })}
                    placeholder="0.00"
                    className="text-right"
                  />
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
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

      <p className="mb-3 text-xs text-gray-500">
        Positive quantities receive stock at the unit cost entered. Negative quantities issue stock
        at the current weighted-average cost.
      </p>

      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" onClick={addRow}>
          Add line
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Create adjustment"}
        </Button>
      </div>
    </form>
  );
}
