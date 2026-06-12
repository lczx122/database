import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { companyProfile, countryCodes, msicCodes, stateCodes } from "@/db/schema";
import { requireAdmin } from "@/server/auth";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  SuccessBanner,
} from "@/components/ui";

export default async function CompanySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireAdmin();
  const { error, success } = await searchParams;

  const [profile, states, countries, msicList] = await Promise.all([
    db.query.companyProfile.findFirst(),
    db.select().from(stateCodes).orderBy(asc(stateCodes.code)),
    db.select().from(countryCodes).orderBy(asc(countryCodes.name)),
    db.select().from(msicCodes).orderBy(asc(msicCodes.code)),
  ]);

  async function saveProfile(formData: FormData) {
    "use server";
    await requireAdmin();

    const field = (key: string) => String(formData.get(key) ?? "").trim();
    const optional = (key: string) => field(key) || null;

    const msicCode = field("msicCode") || "00000";
    const msicRow = await db.query.msicCodes.findFirst({ where: eq(msicCodes.code, msicCode) });

    const data = {
      name: field("name"),
      tin: field("tin"),
      brn: field("brn"),
      sstRegistrationNo: optional("sstRegistrationNo"),
      tourismTaxNo: optional("tourismTaxNo"),
      msicCode,
      msicDescription: msicRow?.description ?? (field("msicDescription") || "NOT APPLICABLE"),
      addressLine1: field("addressLine1"),
      addressLine2: optional("addressLine2"),
      addressLine3: optional("addressLine3"),
      postcode: field("postcode"),
      city: field("city"),
      stateCode: field("stateCode"),
      countryCode: field("countryCode"),
      phone: field("phone"),
      email: optional("email"),
      baseCurrency: field("baseCurrency") || "MYR",
      sstRegistered: formData.get("sstRegistered") === "on",
      updatedAt: new Date(),
    };

    if (!data.name) {
      redirect(`/settings/company?error=${encodeURIComponent("Company name is required")}`);
    }

    try {
      const existing = await db.query.companyProfile.findFirst();
      if (existing) {
        await db.update(companyProfile).set(data).where(eq(companyProfile.id, existing.id));
      } else {
        await db.insert(companyProfile).values(data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save company profile";
      redirect(`/settings/company?error=${encodeURIComponent(message)}`);
    }

    revalidatePath("/settings/company");
    redirect(`/settings/company?success=${encodeURIComponent("Company profile saved")}`);
  }

  return (
    <div>
      <PageHeader
        title="Company Profile"
        subtitle="Used on documents and as the supplier on every e-invoice"
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />
      <Card>
        <form action={saveProfile} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company Name" className="sm:col-span-2">
            <Input name="name" defaultValue={profile?.name ?? ""} required />
          </Field>
          <Field label="TIN">
            <Input name="tin" defaultValue={profile?.tin ?? ""} />
          </Field>
          <Field label="BRN (Business Registration No)">
            <Input name="brn" defaultValue={profile?.brn ?? ""} />
          </Field>
          <Field label="SST Registration No">
            <Input name="sstRegistrationNo" defaultValue={profile?.sstRegistrationNo ?? ""} />
          </Field>
          <Field label="Tourism Tax No">
            <Input name="tourismTaxNo" defaultValue={profile?.tourismTaxNo ?? ""} />
          </Field>
          <div>
            <Field label="MSIC Code">
              <Input
                name="msicCode"
                list="msic-code-options"
                defaultValue={profile?.msicCode ?? ""}
                placeholder="e.g. 62010"
              />
            </Field>
            <datalist id="msic-code-options">
              {msicList.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.description}
                </option>
              ))}
            </datalist>
            <p className="mt-1 text-xs text-gray-500">
              Pick from the list or type any MSIC 2008 code.
            </p>
          </div>
          <Field label="MSIC Description">
            <Input
              name="msicDescription"
              defaultValue={profile?.msicDescription ?? ""}
              placeholder="Auto-filled from the code when known"
            />
          </Field>
          <Field label="Address Line 1" className="sm:col-span-2">
            <Input name="addressLine1" defaultValue={profile?.addressLine1 ?? ""} />
          </Field>
          <Field label="Address Line 2">
            <Input name="addressLine2" defaultValue={profile?.addressLine2 ?? ""} />
          </Field>
          <Field label="Address Line 3">
            <Input name="addressLine3" defaultValue={profile?.addressLine3 ?? ""} />
          </Field>
          <Field label="Postcode">
            <Input name="postcode" defaultValue={profile?.postcode ?? ""} />
          </Field>
          <Field label="City">
            <Input name="city" defaultValue={profile?.city ?? ""} />
          </Field>
          <Field label="State">
            <Select name="stateCode" defaultValue={profile?.stateCode ?? "14"}>
              {states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Country">
            <Select name="countryCode" defaultValue={profile?.countryCode ?? "MYS"}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phone">
            <Input name="phone" defaultValue={profile?.phone ?? ""} />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={profile?.email ?? ""} />
          </Field>
          <Field label="Base Currency">
            <Input name="baseCurrency" defaultValue={profile?.baseCurrency ?? "MYR"} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="sstRegistered"
              defaultChecked={profile?.sstRegistered ?? false}
              className="h-4 w-4 rounded border-gray-300"
            />
            SST registered
          </label>
          <div className="sm:col-span-2">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
