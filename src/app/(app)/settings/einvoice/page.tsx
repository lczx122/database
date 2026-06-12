import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/auth";
import { getMyinvoisSettings, saveMyinvoisSettings } from "@/server/settings";
import { getConfig } from "@/server/einvoice/api/client";
import { getToken } from "@/server/einvoice/api/token";
import {
  checkCertificate,
  loadCertificate,
  type CertificateWarning,
} from "@/server/einvoice/signing/certificate";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  SuccessBanner,
  Textarea,
} from "@/components/ui";

export default async function EinvoiceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireAdmin();
  const { error, success } = await searchParams;

  const settings = await getMyinvoisSettings();

  let certInfo: { subject: string; expiry: string; warnings: CertificateWarning[] } | null = null;
  let certError: string | null = null;
  if (settings.signingCertPem) {
    try {
      const sc = loadCertificate(settings.signingCertPem, settings.signingKeyPem ?? "");
      certInfo = {
        subject: sc.subjectName,
        expiry: sc.validTo.toISOString().slice(0, 10),
        warnings: checkCertificate(sc),
      };
    } catch (err) {
      certError = err instanceof Error ? err.message : "Failed to load signing certificate";
    }
  }

  async function saveAction(formData: FormData) {
    "use server";
    await requireAdmin();

    const field = (key: string) => String(formData.get(key) ?? "").trim();
    const environment = field("environment") === "production" ? "production" : "sandbox";
    const clientSecret = field("clientSecret");
    const certPem = field("signingCertPem");
    const keyPem = field("signingKeyPem");

    try {
      await saveMyinvoisSettings({
        environment,
        clientId: field("clientId"),
        // Empty inputs mean "keep the stored secret".
        clientSecret: clientSecret || undefined,
        signingEnabled: formData.get("signingEnabled") === "on",
        signingCertPem: certPem || null,
        signingKeyPem: certPem ? keyPem || undefined : null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      redirect(`/settings/einvoice?error=${encodeURIComponent(message)}`);
    }

    revalidatePath("/settings/einvoice");
    redirect(`/settings/einvoice?success=${encodeURIComponent("e-Invoice settings saved")}`);
  }

  async function testConnectionAction() {
    "use server";
    await requireAdmin();

    let ok = false;
    let message: string;
    try {
      const config = await getConfig();
      await getToken(config);
      ok = true;
      message = `Connected to MyInvois (${config.apiBaseUrl}) and obtained an access token`;
    } catch (err) {
      message = err instanceof Error ? err.message : "Connection test failed";
    }

    redirect(`/settings/einvoice?${ok ? "success" : "error"}=${encodeURIComponent(message)}`);
  }

  return (
    <div>
      <PageHeader
        title="e-Invoice (MyInvois)"
        subtitle="LHDN MyInvois API credentials and document signing"
        actions={
          <form action={testConnectionAction}>
            <Button type="submit" variant="secondary">
              Test Connection
            </Button>
          </form>
        }
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Current status</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Environment</dt>
            <dd className="mt-0.5">
              <Badge color={settings.environment === "production" ? "green" : "yellow"}>
                {settings.environment}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Client Secret</dt>
            <dd className="mt-0.5">
              <Badge color={settings.clientSecret ? "green" : "red"}>
                {settings.clientSecret ? "configured" : "not set"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Document signing</dt>
            <dd className="mt-0.5">
              <Badge color={settings.signingEnabled ? "green" : "gray"}>
                {settings.signingEnabled ? "enabled (v1.1)" : "disabled (v1.0)"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Signing certificate</dt>
            <dd className="mt-0.5 space-y-1">
              {!settings.signingCertPem ? (
                <Badge color="gray">not configured</Badge>
              ) : certError ? (
                <span className="text-red-700">{certError}</span>
              ) : certInfo ? (
                <>
                  <div className="text-gray-700">{certInfo.subject}</div>
                  <div className="text-gray-500">Expires {certInfo.expiry}</div>
                  {certInfo.warnings.map((w, i) => (
                    <div
                      key={i}
                      className={w.level === "error" ? "text-red-700" : "text-yellow-700"}
                    >
                      {w.message}
                    </div>
                  ))}
                  {certInfo.warnings.length === 0 ? (
                    <Badge color="green">certificate OK</Badge>
                  ) : null}
                </>
              ) : null}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <form action={saveAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Environment">
            <Select name="environment" defaultValue={settings.environment}>
              <option value="sandbox">Sandbox (preprod)</option>
              <option value="production">Production</option>
            </Select>
          </Field>
          <Field label="Client ID">
            <Input name="clientId" defaultValue={settings.clientId} autoComplete="off" />
          </Field>
          <Field label="Client Secret">
            <Input
              name="clientSecret"
              type="password"
              placeholder={settings.clientSecret ? "(unchanged)" : ""}
              autoComplete="new-password"
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="signingEnabled"
              defaultChecked={settings.signingEnabled}
              className="h-4 w-4 rounded border-gray-300"
            />
            Enable document signing (v1.1)
          </label>
          <div className="sm:col-span-2">
            <Field label="Signing Certificate (PEM)">
              <Textarea
                name="signingCertPem"
                rows={6}
                defaultValue={settings.signingCertPem ?? ""}
                placeholder="-----BEGIN CERTIFICATE-----"
                spellCheck={false}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Signing Private Key (PEM)">
              <Textarea
                name="signingKeyPem"
                rows={6}
                placeholder={settings.signingKeyPem ? "(unchanged)" : "-----BEGIN PRIVATE KEY-----"}
                spellCheck={false}
              />
            </Field>
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to keep the stored private key. It is encrypted before being saved.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
