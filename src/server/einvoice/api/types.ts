export interface MyinvoisConfig {
  apiBaseUrl: string;
  portalBaseUrl: string;
  clientId: string;
  clientSecret: string;
}

export const ENVIRONMENTS = {
  sandbox: {
    apiBaseUrl: "https://preprod-api.myinvois.hasil.gov.my",
    portalBaseUrl: "https://preprod.myinvois.hasil.gov.my",
  },
  production: {
    apiBaseUrl: "https://api.myinvois.hasil.gov.my",
    portalBaseUrl: "https://myinvois.hasil.gov.my",
  },
} as const;

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds, typically 3600
  scope: string;
}

export interface SubmitDocumentItem {
  format: "JSON" | "XML";
  document: string; // base64
  documentHash: string; // sha256 hex of the raw document bytes
  codeNumber: string; // internal document number
}

export interface SubmissionResponse {
  submissionUid: string;
  acceptedDocuments: Array<{ uuid: string; invoiceCodeNumber: string }>;
  rejectedDocuments: Array<{
    invoiceCodeNumber: string;
    error: MyinvoisError;
  }>;
}

export interface MyinvoisError {
  code?: string;
  message?: string;
  target?: string;
  propertyPath?: string | null;
  details?: MyinvoisError[];
}

export type LhdnDocumentStatus = "Submitted" | "Valid" | "Invalid" | "Cancelled";

export interface SubmissionStatusResponse {
  submissionUid: string;
  documentCount: number;
  dateTimeReceived: string;
  overallStatus: "InProgress" | "Valid" | "PartiallyValid" | "Invalid";
  documentSummary: Array<{
    uuid: string;
    submissionUid: string;
    longId: string | null;
    internalId: string;
    status: LhdnDocumentStatus;
    dateTimeValidated: string | null;
  }>;
}

export interface DocumentDetailsResponse {
  uuid: string;
  submissionUid: string;
  longId: string | null;
  internalId: string;
  status: LhdnDocumentStatus;
  dateTimeValidated: string | null;
  validationResults?: {
    status: "Submitted" | "Valid" | "Invalid";
    validationSteps: Array<{
      name: string;
      status: "Submitted" | "Valid" | "Invalid";
      error?: MyinvoisError;
    }>;
  };
}

export class MyinvoisApiError extends Error {
  constructor(
    public httpStatus: number,
    public body: unknown,
    message?: string,
  ) {
    super(message ?? `MyInvois API error (HTTP ${httpStatus})`);
    this.name = "MyinvoisApiError";
  }
}
