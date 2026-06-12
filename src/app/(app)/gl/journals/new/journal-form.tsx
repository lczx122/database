"use client";

import { useActionState, useState } from "react";
import { Button, Card, ErrorBanner, Field, Input, Select, Td, Th } from "@/components/ui";
import { createJournalAction, type JournalFormState } from "./actions";

export interface AccountOption {
  code: string;
  name: string;
}

const initialState: JournalFormState = { error: null };

export function JournalForm({
  accounts,
  defaultDate,
}: {
  accounts: AccountOption[];
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(createJournalAction, initialState);
  const [rowIds, setRowIds] = useState<number[]>([0, 1]);
  const [nextId, setNextId] = useState(2);

  const addRow = () => {
    setRowIds((rows) => [...rows, nextId]);
    setNextId((id) => id + 1);
  };
  const removeRow = (id: number) => setRowIds((rows) => rows.filter((r) => r !== id));

  return (
    <form action={formAction}>
      <ErrorBanner message={state.error} />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Date">
            <Input type="date" name="entryDate" defaultValue={defaultDate} required />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input name="description" placeholder="e.g. Month-end accrual" />
          </Field>
        </div>
      </Card>

      <div className="mb-3 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Description</Th>
              <Th className="w-36">Debit</Th>
              <Th className="w-36">Credit</Th>
              <Th className="w-12"></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rowIds.map((id) => (
              <tr key={id}>
                <Td>
                  <Select name="lineAccount" defaultValue="">
                    <option value="">— Account —</option>
                    {accounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Input name="lineDescription" placeholder="Line description" />
                </Td>
                <Td>
                  <Input
                    name="lineDebit"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="text-right"
                  />
                </Td>
                <Td>
                  <Input
                    name="lineCredit"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="text-right"
                  />
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => removeRow(id)}
                    disabled={rowIds.length <= 1}
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

      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" onClick={addRow}>
          Add line
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Posting..." : "Post journal"}
        </Button>
      </div>
    </form>
  );
}
