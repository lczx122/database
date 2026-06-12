import { asc } from "drizzle-orm";
import { db } from "@/db";
import { countryCodes, idTypeEnum, paymentModeCodes, stateCodes } from "@/db/schema";
import type { customers } from "@/db/schema";
import { Button, Card, Field, Input, LinkButton, Select } from "@/components/ui";

type Customer = typeof customers.$inferSelect;

export async function CustomerForm({
  customer,
  action,
}: {
  customer?: Customer;
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
          <Input name="code" defaultValue={customer?.code ?? ""} required />
        </Field>
        <Field label="Name">
          <Input name="name" defaultValue={customer?.name ?? ""} required />
        </Field>
        <Field label="TIN">
          <Input name="tin" defaultValue={customer?.tin ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ID Type">
            <Select name="idType" defaultValue={customer?.idType ?? "BRN"}>
              {idTypeEnum.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ID Value">
            <Input name="idValue" defaultValue={customer?.idValue ?? ""} />
          </Field>
        </div>
        <Field label="SST No">
          <Input name="sstNo" defaultValue={customer?.sstNo ?? ""} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={customer?.email ?? ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={customer?.phone ?? ""} />
        </Field>
        <Field label="Address Line 1" className="sm:col-span-2">
          <Input name="addressLine1" defaultValue={customer?.addressLine1 ?? ""} />
        </Field>
        <Field label="Address Line 2">
          <Input name="addressLine2" defaultValue={customer?.addressLine2 ?? ""} />
        </Field>
        <Field label="Address Line 3">
          <Input name="addressLine3" defaultValue={customer?.addressLine3 ?? ""} />
        </Field>
        <Field label="Postcode">
          <Input name="postcode" defaultValue={customer?.postcode ?? ""} />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={customer?.city ?? ""} />
        </Field>
        <Field label="State">
          <Select name="stateCode" defaultValue={customer?.stateCode ?? "14"}>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country">
          <Select name="countryCode" defaultValue={customer?.countryCode ?? "MYS"}>
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
            defaultValue={customer?.creditTermsDays ?? 30}
          />
        </Field>
        <Field label="Payment Mode">
          <Select name="paymentModeCode" defaultValue={customer?.paymentModeCode ?? "01"}>
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
            defaultChecked={customer?.isActive ?? true}
            className="h-4 w-4 rounded border-gray-300"
          />
          Active
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit">Save</Button>
          <LinkButton variant="secondary" href="/customers">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
