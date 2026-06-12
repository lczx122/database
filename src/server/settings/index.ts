import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "./secrets";

export type MyinvoisEnvironment = "sandbox" | "production";

export interface MyinvoisSettings {
  environment: MyinvoisEnvironment;
  clientId: string;
  clientSecret: string; // decrypted
  signingEnabled: boolean;
  signingCertPem: string | null;
  signingKeyPem: string | null;
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  return row ? (row.value as T) : null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function getMyinvoisSettings(): Promise<MyinvoisSettings> {
  const stored = await getSetting<{
    environment: MyinvoisEnvironment;
    clientId: string;
    clientSecretEnc: string;
    signingEnabled: boolean;
    signingCertPem: string | null;
    signingKeyPemEnc: string | null;
  }>("myinvois");
  if (!stored) {
    return {
      environment: "sandbox",
      clientId: "",
      clientSecret: "",
      signingEnabled: false,
      signingCertPem: null,
      signingKeyPem: null,
    };
  }
  return {
    environment: stored.environment,
    clientId: stored.clientId,
    clientSecret: stored.clientSecretEnc ? decryptSecret(stored.clientSecretEnc) : "",
    signingEnabled: stored.signingEnabled,
    signingCertPem: stored.signingCertPem,
    signingKeyPem: stored.signingKeyPemEnc ? decryptSecret(stored.signingKeyPemEnc) : null,
  };
}

export async function saveMyinvoisSettings(input: {
  environment: MyinvoisEnvironment;
  clientId: string;
  clientSecret?: string; // omit to keep existing
  signingEnabled: boolean;
  signingCertPem?: string | null;
  signingKeyPem?: string | null;
}): Promise<void> {
  const existing = await getSetting<Record<string, unknown>>("myinvois");
  await setSetting("myinvois", {
    environment: input.environment,
    clientId: input.clientId,
    clientSecretEnc:
      input.clientSecret !== undefined && input.clientSecret !== ""
        ? encryptSecret(input.clientSecret)
        : (existing?.clientSecretEnc ?? ""),
    signingEnabled: input.signingEnabled,
    signingCertPem:
      input.signingCertPem !== undefined ? input.signingCertPem : (existing?.signingCertPem ?? null),
    signingKeyPemEnc:
      input.signingKeyPem !== undefined
        ? input.signingKeyPem
          ? encryptSecret(input.signingKeyPem)
          : null
        : (existing?.signingKeyPemEnc ?? null),
  });
}

export async function getCompanyProfile() {
  const profile = await db.query.companyProfile.findFirst();
  if (!profile) throw new Error("Company profile not set up — run the seed script or visit Settings");
  return profile;
}

// Default GL account mappings (account codes) used by the posting engine.
export interface AccountMappings {
  arControl: string;
  apControl: string;
  sales: string;
  sstPayable: string;
  stock: string;
  cogs: string;
  bank: string;
  rounding: string;
  stockAdjustment: string;
}

export const DEFAULT_ACCOUNT_MAPPINGS: AccountMappings = {
  arControl: "1200",
  apControl: "2100",
  sales: "4000",
  sstPayable: "2200",
  stock: "1300",
  cogs: "5000",
  bank: "1100",
  rounding: "6900",
  stockAdjustment: "5100",
};

export async function getAccountMappings(): Promise<AccountMappings> {
  const stored = await getSetting<Partial<AccountMappings>>("account_mappings");
  return { ...DEFAULT_ACCOUNT_MAPPINGS, ...stored };
}
