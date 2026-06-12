import { D, round2 } from "@/lib/money";
import type {
  UblElement,
  UblInvoiceDocument,
  UblInvoiceInput,
  UblLineInput,
  UblPartyInput,
} from "./types";

// Builds a MyInvois-flavoured UBL 2.1 invoice document in JSON encoding.
// All e-invoice types (01-04, 11-14) use the Invoice schema; the type code
// distinguishes them. Reference: https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/

const txt = (value: string, attrs?: Record<string, string>) => [{ _: value, ...attrs }];
const num = (value: string | number, attrs?: Record<string, string>) => [
  { _: typeof value === "number" ? value : Number(round2(D(value)).toFixed(2)), ...attrs },
];
const amt = (value: string | number, currency: string) => num(value, { currencyID: currency });

const TAX_SCHEME = [
  { ID: txt("OTH", { schemeID: "UN/ECE 5153", schemeAgencyID: "6" }) },
];

function buildAddress(p: UblPartyInput): UblElement[] {
  const lines = [p.addressLine1, p.addressLine2, p.addressLine3]
    .filter((l): l is string => !!l && l.trim() !== "")
    .map((l) => ({ Line: txt(l) }));
  return [
    {
      CityName: txt(p.city),
      PostalZone: txt(p.postcode),
      CountrySubentityCode: txt(p.stateCode),
      AddressLine: lines.length > 0 ? lines : [{ Line: txt("NA") }],
      Country: [
        {
          IdentificationCode: txt(p.countryCode, {
            listID: "ISO3166-1",
            listAgencyID: "6",
          }),
        },
      ],
    },
  ];
}

function buildParty(p: UblPartyInput, opts: { includeMsic: boolean }): UblElement[] {
  const party: UblElement = {};

  if (opts.includeMsic) {
    party.IndustryClassificationCode = txt(p.msicCode ?? "00000", {
      name: p.msicDescription ?? "NOT APPLICABLE",
    });
  }

  party.PartyIdentification = [
    { ID: txt(p.tin, { schemeID: "TIN" }) },
    { ID: txt(p.idValue || "NA", { schemeID: p.idType }) },
    { ID: txt(p.sstNo?.trim() || "NA", { schemeID: "SST" }) },
    { ID: txt(p.tourismTaxNo?.trim() || "NA", { schemeID: "TTX" }) },
  ];

  party.PostalAddress = buildAddress(p);
  party.PartyLegalEntity = [{ RegistrationName: txt(p.name) }];
  party.Contact = [
    {
      Telephone: txt(p.phone?.trim() || "NA"),
      ElectronicMail: txt(p.email?.trim() || "NA"),
    },
  ];

  return [party];
}

function buildTaxCategory(line: Pick<UblLineInput, "taxTypeCode" | "taxExemptionReason">): UblElement {
  const category: UblElement = { ID: txt(line.taxTypeCode) };
  if (line.taxTypeCode === "E" && line.taxExemptionReason) {
    category.TaxExemptionReason = txt(line.taxExemptionReason);
  }
  category.TaxScheme = TAX_SCHEME;
  return category;
}

function buildInvoiceLine(line: UblLineInput, currency: string): UblElement {
  const subtotal = D(line.lineSubtotal);
  const quantity = D(line.quantity);
  const discount = D(line.discountAmount);

  const ublLine: UblElement = {
    ID: txt(String(line.lineNo)),
    InvoicedQuantity: [{ _: Number(quantity.toFixed(4)), unitCode: line.uomCode }],
    LineExtensionAmount: amt(line.lineSubtotal, currency),
  };

  if (discount.greaterThan(0)) {
    ublLine.AllowanceCharge = [
      {
        ChargeIndicator: [{ _: false }],
        AllowanceChargeReason: txt("Discount"),
        Amount: amt(line.discountAmount, currency),
      },
    ];
  }

  ublLine.TaxTotal = [
    {
      TaxAmount: amt(line.taxAmount, currency),
      TaxSubtotal: [
        {
          TaxableAmount: amt(line.lineSubtotal, currency),
          TaxAmount: amt(line.taxAmount, currency),
          Percent: [{ _: Number(D(line.taxRate).toFixed(2)) }],
          TaxCategory: [buildTaxCategory(line)],
        },
      ],
    },
  ];

  ublLine.Item = [
    {
      CommodityClassification: [
        { ItemClassificationCode: txt(line.classificationCode, { listID: "CLASS" }) },
      ],
      Description: txt(line.description),
    },
  ];

  // PriceAmount is the unit price; ItemPriceExtension the pre-tax line amount
  // including discount adjustments (subtotal here).
  ublLine.Price = [{ PriceAmount: amt(line.unitPrice, currency) }];
  ublLine.ItemPriceExtension = [{ Amount: amt(subtotal.toFixed(2), currency) }];

  return ublLine;
}

/** Aggregate per tax type for the document-level TaxTotal. */
function buildDocumentTaxTotal(input: UblInvoiceInput): UblElement[] {
  const byType = new Map<string, { taxable: ReturnType<typeof D>; tax: ReturnType<typeof D>; exemptionReason: string | null }>();
  for (const line of input.lines) {
    const existing = byType.get(line.taxTypeCode) ?? {
      taxable: D(0),
      tax: D(0),
      exemptionReason: line.taxExemptionReason,
    };
    existing.taxable = existing.taxable.plus(D(line.lineSubtotal));
    existing.tax = existing.tax.plus(D(line.taxAmount));
    byType.set(line.taxTypeCode, existing);
  }

  const subtotals = [...byType.entries()].map(([typeCode, agg]) => ({
    TaxableAmount: amt(agg.taxable.toFixed(2), input.currencyCode),
    TaxAmount: amt(agg.tax.toFixed(2), input.currencyCode),
    TaxCategory: [buildTaxCategory({ taxTypeCode: typeCode, taxExemptionReason: agg.exemptionReason })],
  }));

  return [
    {
      TaxAmount: amt(input.taxTotal, input.currencyCode),
      TaxSubtotal: subtotals,
    },
  ];
}

export function buildUblInvoice(input: UblInvoiceInput): UblInvoiceDocument {
  if (input.lines.length === 0) throw new Error("Cannot build e-invoice with no lines");

  const c = input.currencyCode;
  const invoice: UblElement = {
    ID: txt(input.internalId),
    IssueDate: txt(input.issueDate),
    IssueTime: txt(input.issueTime),
    InvoiceTypeCode: txt(input.eInvoiceTypeCode, { listVersionID: input.version }),
    DocumentCurrencyCode: txt(c),
    TaxCurrencyCode: txt("MYR"),
  };

  if (input.billingReference) {
    invoice.BillingReference = [
      {
        InvoiceDocumentReference: [
          {
            UUID: txt(input.billingReference.lhdnUuid),
            ID: txt(input.billingReference.internalId),
          },
        ],
      },
    ];
  }

  invoice.AccountingSupplierParty = [{ Party: buildParty(input.supplier, { includeMsic: true }) }];
  invoice.AccountingCustomerParty = [{ Party: buildParty(input.buyer, { includeMsic: false }) }];

  if (input.paymentModeCode) {
    invoice.PaymentMeans = [{ PaymentMeansCode: txt(input.paymentModeCode) }];
  }
  if (input.paymentTermsNote) {
    invoice.PaymentTerms = [{ Note: txt(input.paymentTermsNote) }];
  }

  invoice.TaxTotal = buildDocumentTaxTotal(input);

  const rounding = D(input.rounding);
  const monetaryTotal: UblElement = {
    LineExtensionAmount: amt(input.subtotal, c),
    TaxExclusiveAmount: amt(input.subtotal, c),
    TaxInclusiveAmount: amt(D(input.subtotal).plus(D(input.taxTotal)).toFixed(2), c),
    PayableAmount: amt(input.total, c),
  };
  if (!rounding.isZero()) {
    monetaryTotal.PayableRoundingAmount = amt(input.rounding, c);
  }
  invoice.LegalMonetaryTotal = [monetaryTotal];

  invoice.InvoiceLine = input.lines.map((l) => buildInvoiceLine(l, c));

  return {
    _D: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    _A: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    _B: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    Invoice: [invoice],
  };
}
