/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { buildUblInvoice } from "@/server/einvoice/ubl/builder";
import type { UblInvoiceInput, UblPartyInput } from "@/server/einvoice/ubl/types";

const supplier: UblPartyInput = {
  name: "My Company Sdn Bhd",
  tin: "C25845632020",
  idType: "BRN",
  idValue: "202001012345",
  sstNo: "W10-1808-32000060",
  tourismTaxNo: null,
  msicCode: "62010",
  msicDescription: "Computer programming activities",
  email: "billing@mycompany.test",
  phone: "+60312345678",
  addressLine1: "Lot 66, Bangunan Merdeka",
  addressLine2: "Persiaran Jaya",
  addressLine3: null,
  postcode: "50480",
  city: "Kuala Lumpur",
  stateCode: "14",
  countryCode: "MYS",
};

const buyer: UblPartyInput = {
  name: "Example Trading Sdn Bhd",
  tin: "C12345678900",
  idType: "BRN",
  idValue: "201901234567",
  sstNo: null,
  email: null,
  phone: "+60387654321",
  addressLine1: "1, Jalan Contoh",
  addressLine2: null,
  addressLine3: null,
  postcode: "47810",
  city: "Petaling Jaya",
  stateCode: "10",
  countryCode: "MYS",
};

function baseInput(overrides: Partial<UblInvoiceInput> = {}): UblInvoiceInput {
  return {
    eInvoiceTypeCode: "01",
    version: "1.0",
    internalId: "INV-00001",
    issueDate: "2026-06-12",
    issueTime: "03:21:00Z",
    currencyCode: "MYR",
    supplier,
    buyer,
    lines: [
      {
        lineNo: 1,
        description: "Consulting Services",
        classificationCode: "022",
        quantity: "10.0000",
        uomCode: "HUR",
        unitPrice: "250.00",
        discountAmount: "0.00",
        taxTypeCode: "02",
        taxRate: "8.0000",
        taxExemptionReason: null,
        taxAmount: "200.00",
        lineSubtotal: "2500.00",
      },
    ],
    subtotal: "2500.00",
    taxTotal: "200.00",
    rounding: "0.00",
    total: "2700.00",
    paymentModeCode: "03",
    paymentTermsNote: "Payment within 30 days",
    billingReference: null,
    ...overrides,
  };
}

describe("buildUblInvoice", () => {
  it("produces the MyInvois JSON envelope", () => {
    const doc = buildUblInvoice(baseInput());
    expect(doc._D).toBe("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2");
    expect(doc.Invoice).toHaveLength(1);
    const inv = doc.Invoice[0] as Record<string, unknown>;
    expect(inv.ID).toEqual([{ _: "INV-00001" }]);
    expect(inv.IssueDate).toEqual([{ _: "2026-06-12" }]);
    expect(inv.IssueTime).toEqual([{ _: "03:21:00Z" }]);
    expect(inv.InvoiceTypeCode).toEqual([{ _: "01", listVersionID: "1.0" }]);
  });

  it("includes supplier MSIC but not buyer MSIC", () => {
    const doc = buildUblInvoice(baseInput());
    const inv = doc.Invoice[0] as any;
    const supplierParty = inv["AccountingSupplierParty"][0].Party[0];
    const buyerParty = inv["AccountingCustomerParty"][0].Party[0];
    expect(supplierParty.IndustryClassificationCode).toEqual([
      { _: "62010", name: "Computer programming activities" },
    ]);
    expect(buyerParty.IndustryClassificationCode).toBeUndefined();
  });

  it("emits party identifications in TIN/ID/SST/TTX order with NA fallbacks", () => {
    const doc = buildUblInvoice(baseInput());
    const inv = doc.Invoice[0] as any;
    const ids = inv["AccountingCustomerParty"][0].Party[0].PartyIdentification;
    expect(ids[0].ID[0]).toEqual({ _: "C12345678900", schemeID: "TIN" });
    expect(ids[1].ID[0]).toEqual({ _: "201901234567", schemeID: "BRN" });
    expect(ids[2].ID[0]).toEqual({ _: "NA", schemeID: "SST" });
    expect(ids[3].ID[0]).toEqual({ _: "NA", schemeID: "TTX" });
  });

  it("reconciles totals: LegalMonetaryTotal matches the sum of lines", () => {
    const input = baseInput({
      lines: [
        {
          lineNo: 1,
          description: "Item A",
          classificationCode: "003",
          quantity: "3.0000",
          uomCode: "H87",
          unitPrice: "45.00",
          discountAmount: "5.00",
          taxTypeCode: "01",
          taxRate: "10.0000",
          taxExemptionReason: null,
          taxAmount: "13.00",
          lineSubtotal: "130.00",
        },
        {
          lineNo: 2,
          description: "Item B",
          classificationCode: "022",
          quantity: "1.0000",
          uomCode: "C62",
          unitPrice: "15.00",
          discountAmount: "0.00",
          taxTypeCode: "06",
          taxRate: "0.0000",
          taxExemptionReason: null,
          taxAmount: "0.00",
          lineSubtotal: "15.00",
        },
      ],
      subtotal: "145.00",
      taxTotal: "13.00",
      total: "158.00",
    });
    const doc = buildUblInvoice(input);
    const inv = doc.Invoice[0] as any;
    const totals = inv["LegalMonetaryTotal"][0];
    expect(totals.LineExtensionAmount[0]._).toBe(145);
    expect(totals.TaxInclusiveAmount[0]._).toBe(158);
    expect(totals.PayableAmount[0]._).toBe(158);

    const lineSum = (inv["InvoiceLine"] as any[]).reduce(
      (acc: number, l: any) => acc + l["LineExtensionAmount"][0]._,
      0,
    );
    expect(lineSum).toBe(145);

    // Document TaxTotal aggregates per tax type.
    const taxSubtotals = inv["TaxTotal"][0].TaxSubtotal;
    expect(taxSubtotals).toHaveLength(2);
    expect(inv["TaxTotal"][0].TaxAmount[0]._).toBe(13);
  });

  it("carries exemption reason for tax-exempt lines", () => {
    const input = baseInput({
      lines: [
        {
          ...baseInput().lines[0],
          taxTypeCode: "E",
          taxRate: "0.0000",
          taxAmount: "0.00",
          taxExemptionReason: "Exempt under Sales Tax Order 2022",
        },
      ],
      taxTotal: "0.00",
      total: "2500.00",
    });
    const doc = buildUblInvoice(input);
    const inv = doc.Invoice[0] as any;
    const category = inv["InvoiceLine"][0].TaxTotal[0].TaxSubtotal[0].TaxCategory[0];
    expect(category.ID[0]._).toBe("E");
    expect(category.TaxExemptionReason[0]._).toBe("Exempt under Sales Tax Order 2022");
  });

  it("adds BillingReference for credit notes", () => {
    const doc = buildUblInvoice(
      baseInput({
        eInvoiceTypeCode: "02",
        billingReference: { lhdnUuid: "F9D425P6DS7D8IU", internalId: "INV-00001" },
      }),
    );
    const inv = doc.Invoice[0] as any;
    const ref = inv["BillingReference"][0].InvoiceDocumentReference[0];
    expect(ref.UUID[0]._).toBe("F9D425P6DS7D8IU");
    expect(ref.ID[0]._).toBe("INV-00001");
  });

  it("includes a discount AllowanceCharge only when a discount exists", () => {
    const withDiscount = buildUblInvoice(
      baseInput({
        lines: [{ ...baseInput().lines[0], discountAmount: "100.00" }],
      }),
    );
    const without = buildUblInvoice(baseInput());
    const lineWith = (withDiscount.Invoice[0] as any)["InvoiceLine"][0];
    const lineWithout = (without.Invoice[0] as any)["InvoiceLine"][0];
    expect(lineWith.AllowanceCharge[0].ChargeIndicator[0]._).toBe(false);
    expect(lineWith.AllowanceCharge[0].Amount[0]._).toBe(100);
    expect(lineWithout.AllowanceCharge).toBeUndefined();
  });

  it("rejects documents with no lines", () => {
    expect(() => buildUblInvoice(baseInput({ lines: [] }))).toThrow();
  });
});
