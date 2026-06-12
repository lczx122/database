import { X509Certificate, createPrivateKey, type KeyObject } from "node:crypto";

export interface SigningCertificate {
  cert: X509Certificate;
  privateKey: KeyObject;
  /** Base64 DER of the certificate (no PEM armor). */
  certBase64: string;
  issuerName: string;
  serialNumberDecimal: string;
  subjectName: string;
  validTo: Date;
}

/**
 * Load the signing certificate + key from PEM strings. The certificate must
 * follow the IRBM certificate profile (issued by an approved CA such as
 * Pos Digicert or MSC Trustgate, with the organization TIN embedded).
 */
export function loadCertificate(certPem: string, keyPem: string): SigningCertificate {
  const cert = new X509Certificate(certPem);
  const privateKey = createPrivateKey(keyPem);

  const certBase64 = cert.raw.toString("base64");
  // X509IssuerName per RFC 4514 (comma-separated, most-specific first).
  const issuerName = cert.issuer.split("\n").reverse().join(", ");
  // X509Certificate.serialNumber is hex; the signature block wants decimal.
  const serialNumberDecimal = BigInt(`0x${cert.serialNumber}`).toString(10);
  const subjectName = cert.subject.split("\n").reverse().join(", ");

  return {
    cert,
    privateKey,
    certBase64,
    issuerName,
    serialNumberDecimal,
    subjectName,
    validTo: new Date(cert.validTo),
  };
}

export interface CertificateWarning {
  level: "warning" | "error";
  message: string;
}

export function checkCertificate(sc: SigningCertificate): CertificateWarning[] {
  const warnings: CertificateWarning[] = [];
  const daysLeft = (sc.validTo.getTime() - Date.now()) / 86_400_000;
  if (daysLeft < 0) {
    warnings.push({ level: "error", message: `Signing certificate expired on ${sc.validTo.toISOString().slice(0, 10)}` });
  } else if (daysLeft < 30) {
    warnings.push({
      level: "warning",
      message: `Signing certificate expires in ${Math.floor(daysLeft)} days (${sc.validTo.toISOString().slice(0, 10)})`,
    });
  }
  if (!sc.cert.checkPrivateKey(sc.privateKey)) {
    warnings.push({ level: "error", message: "Private key does not match the certificate" });
  }
  return warnings;
}
