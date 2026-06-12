import crypto from "node:crypto";
import { db } from "@/db";
import { einvoiceApiLog } from "@/db/schema";
import { getMyinvoisSettings } from "@/server/settings";
import { getToken, invalidateToken } from "./token";
import {
  ENVIRONMENTS,
  MyinvoisApiError,
  type DocumentDetailsResponse,
  type MyinvoisConfig,
  type SubmissionResponse,
  type SubmissionStatusResponse,
} from "./types";
import type { UblInvoiceDocument } from "../ubl/types";

export async function getConfig(): Promise<MyinvoisConfig> {
  const settings = await getMyinvoisSettings();
  if (!settings.clientId || !settings.clientSecret) {
    throw new Error(
      "MyInvois Client ID/Secret not configured — set them in Settings → e-Invoice (obtain from the MyTax portal under 'View and Register ERP')",
    );
  }
  const env = ENVIRONMENTS[settings.environment];
  return {
    apiBaseUrl: process.env.MYINVOIS_API_BASE_URL || env.apiBaseUrl,
    portalBaseUrl: process.env.MYINVOIS_PORTAL_BASE_URL || env.portalBaseUrl,
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
  };
}

export function validationUrl(portalBaseUrl: string, uuid: string, longId: string): string {
  return `${portalBaseUrl}/${uuid}/share/${longId}`;
}

const MAX_RETRIES = 4;

async function request<T>(
  config: MyinvoisConfig,
  method: string,
  path: string,
  options: { body?: unknown; submissionId?: string | null } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(2 ** attempt * 1000, 15000) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, backoff));
    }

    const token = await getToken(config);
    let res: Response;
    try {
      res = await fetch(`${config.apiBaseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      lastError = err; // network failure — retry
      continue;
    }

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    await db.insert(einvoiceApiLog).values({
      submissionId: options.submissionId ?? null,
      endpoint: path,
      method,
      httpStatus: res.status,
      // Request bodies can be large (base64 documents) and responses may
      // matter for debugging — store both, never the bearer token.
      request: options.body !== undefined ? truncateForLog(options.body) : null,
      response: truncateForLog(parsed),
    });

    if (res.ok) return parsed as T;

    if (res.status === 401) {
      invalidateToken();
      lastError = new MyinvoisApiError(401, parsed, "MyInvois authentication rejected");
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new MyinvoisApiError(res.status, parsed);
      continue;
    }
    throw new MyinvoisApiError(res.status, parsed);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function truncateForLog(value: unknown): unknown {
  const json = JSON.stringify(value);
  if (json && json.length > 100_000) {
    return { truncated: true, preview: json.slice(0, 100_000) };
  }
  return value;
}

export interface SubmitResult {
  submissionUid: string;
  accepted: SubmissionResponse["acceptedDocuments"];
  rejected: SubmissionResponse["rejectedDocuments"];
}

export async function submitDocument(
  config: MyinvoisConfig,
  payload: UblInvoiceDocument,
  internalId: string,
  submissionId: string,
): Promise<SubmitResult> {
  const raw = JSON.stringify(payload);
  const documentHash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
  const response = await request<SubmissionResponse>(config, "POST", "/api/v1.0/documentsubmissions", {
    submissionId,
    body: {
      documents: [
        {
          format: "JSON",
          document: Buffer.from(raw, "utf8").toString("base64"),
          documentHash,
          codeNumber: internalId,
        },
      ],
    },
  });
  return {
    submissionUid: response.submissionUid,
    accepted: response.acceptedDocuments ?? [],
    rejected: response.rejectedDocuments ?? [],
  };
}

export async function getSubmission(
  config: MyinvoisConfig,
  submissionUid: string,
  submissionId?: string,
): Promise<SubmissionStatusResponse> {
  return request(config, "GET", `/api/v1.0/documentsubmissions/${submissionUid}`, { submissionId });
}

export async function getDocumentDetails(
  config: MyinvoisConfig,
  uuid: string,
  submissionId?: string,
): Promise<DocumentDetailsResponse> {
  return request(config, "GET", `/api/v1.0/documents/${uuid}/details`, { submissionId });
}

export async function cancelDocument(
  config: MyinvoisConfig,
  uuid: string,
  reason: string,
  submissionId?: string,
): Promise<void> {
  await request(config, "PUT", `/api/v1.0/documents/state/${uuid}/state`, {
    submissionId,
    body: { status: "cancelled", reason },
  });
}

export async function validateTin(
  config: MyinvoisConfig,
  tin: string,
  idType: string,
  idValue: string,
): Promise<boolean> {
  try {
    await request(
      config,
      "GET",
      `/api/v1.0/taxpayer/validate/${encodeURIComponent(tin)}?idType=${encodeURIComponent(idType)}&idValue=${encodeURIComponent(idValue)}`,
    );
    return true;
  } catch (err) {
    if (err instanceof MyinvoisApiError && err.httpStatus === 404) return false;
    throw err;
  }
}
