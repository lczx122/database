import crypto from "node:crypto";
import type { UblElement, UblInvoiceDocument } from "../ubl/types";
import type { SigningCertificate } from "./certificate";

// Implements the MyInvois JSON document signature (version 1.1):
// https://sdk.myinvois.hasil.gov.my/signature-creation-json/
//
// Steps:
//  1. Minify the document WITHOUT UBLExtensions/Signature -> docBytes
//  2. Sig        = base64( RSA-SHA256 sign of docBytes )
//  3. DocDigest  = base64( SHA-256 of docBytes )
//  4. CertDigest = base64( SHA-256 of DER certificate )
//  5. Build SignedProperties (signing time, cert digest, issuer, serial)
//  6. PropsDigest = base64( SHA-256 of minified SignedProperties )
//  7. Splice the UBLExtensions signature block + cabinet Signature element

const sha256b64 = (data: Buffer | string) =>
  crypto.createHash("sha256").update(data).digest("base64");

const SIGNED_PROPS_ID = "id-xades-signed-props";

function buildSignedProperties(sc: SigningCertificate, signingTime: string): UblElement {
  return {
    Target: "signature",
    SignedProperties: [
      {
        Id: SIGNED_PROPS_ID,
        SignedSignatureProperties: [
          {
            SigningTime: [{ _: signingTime }],
            SigningCertificate: [
              {
                Cert: [
                  {
                    CertDigest: [
                      {
                        DigestMethod: [
                          { _: "", Algorithm: "http://www.w3.org/2001/04/xmlenc#sha256" },
                        ],
                        DigestValue: [{ _: sha256b64(sc.cert.raw) }],
                      },
                    ],
                    IssuerSerial: [
                      {
                        X509IssuerName: [{ _: sc.issuerName }],
                        X509SerialNumber: [{ _: sc.serialNumberDecimal }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function signUblDocument(
  document: UblInvoiceDocument,
  sc: SigningCertificate,
  now: Date = new Date(),
): UblInvoiceDocument {
  const invoice = { ...document.Invoice[0] };
  delete invoice.UBLExtensions;
  delete invoice.Signature;

  // The submitted bytes must be exactly what was hashed/signed, so the
  // builder constructs keys in a stable order and we minify here.
  const docBytes = Buffer.from(
    JSON.stringify({ ...document, Invoice: [invoice] }),
    "utf8",
  );

  const signature = crypto.createSign("RSA-SHA256").update(docBytes).sign(sc.privateKey, "base64");
  const docDigest = sha256b64(docBytes);

  const signingTime = `${now.toISOString().slice(0, 19)}Z`;
  const qualifyingProperties = buildSignedProperties(sc, signingTime);
  const propsDigest = sha256b64(
    JSON.stringify(qualifyingProperties.SignedProperties),
  );

  const signatureBlock: UblElement = {
    ID: [{ _: "urn:oasis:names:specification:ubl:signature:1" }],
    ReferencedSignatureID: [{ _: "urn:oasis:names:specification:ubl:signature:Invoice" }],
    Signature: [
      {
        Id: "signature",
        Object: [{ QualifyingProperties: [qualifyingProperties] }],
        KeyInfo: [
          {
            X509Data: [
              {
                X509Certificate: [{ _: sc.certBase64 }],
                X509SubjectName: [{ _: sc.subjectName }],
                X509IssuerSerial: [
                  {
                    X509IssuerName: [{ _: sc.issuerName }],
                    X509SerialNumber: [{ _: sc.serialNumberDecimal }],
                  },
                ],
              },
            ],
          },
        ],
        SignatureValue: [{ _: signature }],
        SignedInfo: [
          {
            SignatureMethod: [
              { _: "", Algorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" },
            ],
            Reference: [
              {
                Type: "http://uri.etsi.org/01903/v1.3.2#SignedProperties",
                URI: `#${SIGNED_PROPS_ID}`,
                DigestMethod: [
                  { _: "", Algorithm: "http://www.w3.org/2001/04/xmlenc#sha256" },
                ],
                DigestValue: [{ _: propsDigest }],
              },
              {
                Type: "",
                URI: "",
                DigestMethod: [
                  { _: "", Algorithm: "http://www.w3.org/2001/04/xmlenc#sha256" },
                ],
                DigestValue: [{ _: docDigest }],
              },
            ],
          },
        ],
      },
    ],
  };

  const signedInvoice: UblElement = {
    UBLExtensions: [
      {
        UBLExtension: [
          {
            ExtensionURI: [{ _: "urn:oasis:names:specification:ubl:dsig:enveloped:xades" }],
            ExtensionContent: [
              { UBLDocumentSignatures: [{ SignatureInformation: [signatureBlock] }] },
            ],
          },
        ],
      },
    ],
    ...invoice,
    Signature: [
      {
        ID: [{ _: "urn:oasis:names:specification:ubl:signature:Invoice" }],
        SignatureMethod: [{ _: "urn:oasis:names:specification:ubl:dsig:enveloped:xades" }],
      },
    ],
  };

  return { ...document, Invoice: [signedInvoice] };
}
