/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildUblInvoice } from "@/server/einvoice/ubl/builder";
import { loadCertificate, checkCertificate } from "@/server/einvoice/signing/certificate";
import { signUblDocument } from "@/server/einvoice/signing/signer";
import type { UblInvoiceInput } from "@/server/einvoice/ubl/types";

// Self-signed throwaway cert for the test run.
function makeTestCert() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  // node:crypto cannot mint X.509 certs; use a pre-generated fixture instead.
  return { privateKey, publicKey };
}

// Pre-generated with:
//   openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 \
//     -nodes -subj "/C=MY/O=Test Company Sdn Bhd/CN=Test Signing/serialNumber=C25845632020"
import { TEST_CERT_PEM, TEST_KEY_PEM } from "./fixtures/test-cert";

const minimalInput: UblInvoiceInput = {
  eInvoiceTypeCode: "01",
  version: "1.1",
  internalId: "INV-00001",
  issueDate: "2026-06-12",
  issueTime: "03:21:00Z",
  currencyCode: "MYR",
  supplier: {
    name: "S",
    tin: "C1",
    idType: "BRN",
    idValue: "1",
    sstNo: null,
    msicCode: "62010",
    msicDescription: "IT",
    email: null,
    phone: "+601",
    addressLine1: "A",
    addressLine2: null,
    addressLine3: null,
    postcode: "50480",
    city: "KL",
    stateCode: "14",
    countryCode: "MYS",
  },
  buyer: {
    name: "B",
    tin: "C2",
    idType: "BRN",
    idValue: "2",
    sstNo: null,
    email: null,
    phone: null,
    addressLine1: "B",
    addressLine2: null,
    addressLine3: null,
    postcode: "47810",
    city: "PJ",
    stateCode: "10",
    countryCode: "MYS",
  },
  lines: [
    {
      lineNo: 1,
      description: "X",
      classificationCode: "022",
      quantity: "1.0000",
      uomCode: "C62",
      unitPrice: "100.00",
      discountAmount: "0.00",
      taxTypeCode: "06",
      taxRate: "0.0000",
      taxExemptionReason: null,
      taxAmount: "0.00",
      lineSubtotal: "100.00",
    },
  ],
  subtotal: "100.00",
  taxTotal: "0.00",
  rounding: "0.00",
  total: "100.00",
  paymentModeCode: null,
  paymentTermsNote: null,
  billingReference: null,
};

describe("signUblDocument", () => {
  it("produces a verifiable signature over the unsigned document", () => {
    const sc = loadCertificate(TEST_CERT_PEM, TEST_KEY_PEM);
    const unsigned = buildUblInvoice(minimalInput);
    const signed = signUblDocument(unsigned, sc, new Date("2026-06-12T03:21:00Z"));

    const invoice = signed.Invoice[0] as any;
    const sigInfo =
      invoice["UBLExtensions"][0].UBLExtension[0].ExtensionContent[0].UBLDocumentSignatures[0]
        .SignatureInformation[0];
    const signature = sigInfo.Signature[0];

    // Recompute the doc digest the way a verifier would: strip
    // UBLExtensions/Signature and minify.
    const stripped = { ...(signed.Invoice[0] as Record<string, unknown>) };
    delete stripped.UBLExtensions;
    delete stripped.Signature;
    const docBytes = Buffer.from(JSON.stringify({ ...signed, Invoice: [stripped] }), "utf8");

    const expectedDigest = crypto.createHash("sha256").update(docBytes).digest("base64");
    const refs = signature.SignedInfo[0].Reference;
    const docRef = refs.find((r: { URI: string }) => r.URI === "");
    expect(docRef.DigestValue[0]._).toBe(expectedDigest);

    const sigValue = signature.SignatureValue[0]._;
    const verified = crypto
      .createVerify("RSA-SHA256")
      .update(docBytes)
      .verify(sc.cert.publicKey, sigValue, "base64");
    expect(verified).toBe(true);
  });

  it("embeds certificate digest, issuer and serial", () => {
    const sc = loadCertificate(TEST_CERT_PEM, TEST_KEY_PEM);
    const signed = signUblDocument(buildUblInvoice(minimalInput), sc);
    const invoice = signed.Invoice[0] as any;
    const sigInfo =
      invoice["UBLExtensions"][0].UBLExtension[0].ExtensionContent[0].UBLDocumentSignatures[0]
        .SignatureInformation[0];
    const keyInfo = sigInfo.Signature[0].KeyInfo[0].X509Data[0];
    expect(keyInfo.X509Certificate[0]._).toBe(sc.certBase64);

    const certDigest =
      sigInfo.Signature[0].Object[0].QualifyingProperties[0].SignedProperties[0]
        .SignedSignatureProperties[0].SigningCertificate[0].Cert[0].CertDigest[0].DigestValue[0]._;
    expect(certDigest).toBe(crypto.createHash("sha256").update(sc.cert.raw).digest("base64"));
  });

  it("keeps the original document keys and marks version 1.1 separately", () => {
    const sc = loadCertificate(TEST_CERT_PEM, TEST_KEY_PEM);
    const signed = signUblDocument(buildUblInvoice(minimalInput), sc);
    const invoice = signed.Invoice[0] as Record<string, unknown>;
    expect(Object.keys(invoice)[0]).toBe("UBLExtensions");
    expect(invoice.ID).toEqual([{ _: "INV-00001" }]);
    expect(invoice.Signature).toBeDefined();
  });

  it("certificate health check passes for the test cert", () => {
    const sc = loadCertificate(TEST_CERT_PEM, TEST_KEY_PEM);
    const warnings = checkCertificate(sc);
    expect(warnings.filter((w) => w.level === "error")).toHaveLength(0);
  });
});

describe("makeTestCert helper", () => {
  it("generates RSA keys (sanity)", () => {
    const { privateKey } = makeTestCert();
    expect(privateKey.asymmetricKeyType).toBe("rsa");
  });
});
