import { asc } from "drizzle-orm";
import { db } from "@/db";
import { countryCodes, idTypeEnum, paymentModeCodes, stateCodes } from "@/db/schema";
import type { suppliers } from "@/db/schema";
import { Button, Card, Field, Input, LinkButton, Select } from "@/components/ui";

type Supplier = typeof suppliers.$inferSelect;

export async function SupplierForm({
  supplier,
  action,
}: {
  supplier?: Supplier;
  action: (formData: FormData) => Promise<void>;
}) {
  const [states, countries, paymentModes] = await Promise.all([
    db.select().from(stateCodes).orderBy(asc(stateCodes.code)),
    db.select().from(countryCodes).orderBy(asc(countryCodes.name)),
    db.select().from(paymentModeCodes).orderBy(asc(paymentModeCodes.code)),
  ]);

  return (
    <Card>
      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Code">
          <Input name="code" defaultValue={supplier?.code ?? ""} required />
        </Field>
        <Field label="Name">
          <Input name="name" defaultValue={supplier?.name ?? ""} required />
        </Field>
        <Field label="TIN">
          <Input name="tin" defaultValue={supplier?.tin ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ID Type">
            <Select name="idType" defaultValue={supplier?.idType ?? "BRN"}>
              {idTypeEnum.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ID Value">
            <Input name="idValue" defaultValue={supplier?.idValue ?? ""} />
          </Field>
        </div>
        <Field label="SST No">
          <Input name="sstNo" defaultValue={supplier?.sstNo ?? ""} />
        </Field>
        <Field label="MSIC Code">
          <Input
            name="msicCode"
            defaultValue={supplier?.msicCode ?? ""}
            placeholder="e.g. 62010 (optional)"
          />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={supplier?.email ?? ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={supplier?.phone ?? ""} />
        </Field>
        <Field label="Address Line 1" className="sm:col-span-2">
          <Input name="addressLine1" defaultValue={supplier?.addressLine1 ?? ""} />
        </Field>
        <Field label="Address Line 2">
          <Input name="addressLine2" defaultValue={supplier?.addressLine2 ?? ""} />
        </Field>
        <Field label="Address Line 3">
          <Input name="addressLine3" defaultValue={supplier?.addressLine3 ?? ""} />
        </Field>
        <Field label="Postcode">
          <Input name="postcode" defaultValue={supplier?.postcode ?? ""} />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={supplier?.city ?? ""} />
        </Field>
        <Field label="State">
          <Select name="stateCode" defaultValue={supplier?.stateCode ?? "14"}>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country">
          <Select name="countryCode" defaultValue={supplier?.countryCode ?? "MYS"}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Credit Terms (days)">
          <Input
            name="creditTermsDays"
            type="number"
            min={0}
            defaultValue={supplier?.creditTermsDays ?? 30}
          />
        </Field>
        <Field label="Payment Mode">
          <Select name="paymentModeCode" defaultValue={supplier?.paymentModeCode ?? "01"}>
            {paymentModes.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} — {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={supplier?.isActive ?? true}
            className="h-4 w-4 rounded border-gray-300"
          />
          Active
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit">Save</Button>
          <LinkButton variant="secondary" href="/suppliers">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
