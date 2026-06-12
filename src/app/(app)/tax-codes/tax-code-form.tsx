import type { taxCodes } from "@/db/schema";
import { Button, Card, Field, Input, LinkButton, Select } from "@/components/ui";
import { MYINVOIS_TAX_TYPES } from "./tax-types";

type TaxCode = typeof taxCodes.$inferSelect;

export function TaxCodeForm({
  taxCode,
  action,
}: {
  taxCode?: TaxCode;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <Card>
      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Code">
          <Input name="code" defaultValue={taxCode?.code ?? ""} placeholder="e.g. SV-8" required />
        </Field>
        <Field label="Description">
          <Input name="description" defaultValue={taxCode?.description ?? ""} required />
        </Field>
        <Field label="Rate (%)">
          <Input
            name="rate"
            type="number"
            step="0.0001"
            min={0}
            defaultValue={taxCode?.rate ?? "0"}
          />
        </Field>
        <Field label="MyInvois Tax Type">
          <Select
            name="myinvoisTaxTypeCode"
            defaultValue={taxCode?.myinvoisTaxTypeCode ?? "06"}
          >
            {MYINVOIS_TAX_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} — {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Exemption Reason">
            <Input
              name="exemptionReason"
              defaultValue={taxCode?.exemptionReason ?? ""}
              placeholder="e.g. Exempted under Sales Tax (Persons Exempted) Order"
            />
          </Field>
          <p className="mt-1 text-xs text-gray-500">
            Required when the tax type is E (Tax Exempt).
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={taxCode?.isActive ?? true}
            className="h-4 w-4 rounded border-gray-300"
          />
          Active
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit">Save</Button>
          <LinkButton variant="secondary" href="/tax-codes">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
