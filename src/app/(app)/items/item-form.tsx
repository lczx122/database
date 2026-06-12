import { asc } from "drizzle-orm";
import { db } from "@/db";
import { classificationCodes, taxCodes, uomCodes } from "@/db/schema";
import type { items } from "@/db/schema";
import { Button, Card, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";

type Item = typeof items.$inferSelect;

export async function ItemForm({
  item,
  action,
}: {
  item?: Item;
  action: (formData: FormData) => Promise<void>;
}) {
  const [classifications, uoms, allTaxCodes] = await Promise.all([
    db.select().from(classificationCodes).orderBy(asc(classificationCodes.code)),
    db.select().from(uomCodes).orderBy(asc(uomCodes.code)),
    db.select().from(taxCodes).orderBy(asc(taxCodes.code)),
  ]);

  return (
    <Card>
      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Code">
          <Input name="code" defaultValue={item?.code ?? ""} required />
        </Field>
        <Field label="Name">
          <Input name="name" defaultValue={item?.name ?? ""} required />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" rows={2} defaultValue={item?.description ?? ""} />
        </Field>
        <Field label="Type">
          <Select name="type" defaultValue={item?.type ?? "product"}>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </Select>
        </Field>
        <Field label="Classification">
          <Select name="classificationCode" defaultValue={item?.classificationCode ?? "022"}>
            {classifications.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.description}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unit of Measure">
          <Select name="uomCode" defaultValue={item?.uomCode ?? "C62"}>
            {uoms.map((u) => (
              <option key={u.code} value={u.code}>
                {u.code} — {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Unit Price">
            <Input
              name="unitPrice"
              type="number"
              step="0.01"
              min={0}
              defaultValue={item?.unitPrice ?? "0.00"}
            />
          </Field>
          <Field label="Cost">
            <Input name="cost" type="number" step="0.01" min={0} defaultValue={item?.cost ?? "0.00"} />
          </Field>
        </div>
        <Field label="Sales Tax Code">
          <Select name="salesTaxCodeId" defaultValue={item?.salesTaxCodeId ?? ""}>
            <option value="">(none)</option>
            {allTaxCodes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.description}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Purchase Tax Code">
          <Select name="purchaseTaxCodeId" defaultValue={item?.purchaseTaxCodeId ?? ""}>
            <option value="">(none)</option>
            {allTaxCodes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.description}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="trackStock"
            defaultChecked={item?.trackStock ?? false}
            className="h-4 w-4 rounded border-gray-300"
          />
          Track stock
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={item?.isActive ?? true}
            className="h-4 w-4 rounded border-gray-300"
          />
          Active
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit">Save</Button>
          <LinkButton variant="secondary" href="/items">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
