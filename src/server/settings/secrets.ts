import crypto from "node:crypto";

// MyInvois client secrets are stored in app_settings encrypted with a key
// derived from APP_SECRET (AES-256-GCM). Format: v1:<iv>:<tag>:<ciphertext>
// (all base64).

function key(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret || secret === "change-me") {
    throw new Error("APP_SECRET must be set to a strong random value (openssl rand -hex 32)");
  }
  return crypto.scryptSync(secret, "accounting-app-settings", 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split(":");
  if (version !== "v1") throw new Error("Unknown secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
