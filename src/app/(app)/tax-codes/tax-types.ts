// MyInvois tax type code list (SDK code table "TaxTypes").
export const MYINVOIS_TAX_TYPES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "01", label: "Sales Tax" },
  { code: "02", label: "Service Tax" },
  { code: "03", label: "Tourism Tax" },
  { code: "04", label: "High-Value Goods Tax" },
  { code: "05", label: "Low Value Goods Sales Tax" },
  { code: "06", label: "Not Applicable" },
  { code: "E", label: "Tax Exempt" },
];

export function taxTypeLabel(code: string): string {
  const found = MYINVOIS_TAX_TYPES.find((t) => t.code === code);
  return found ? `${found.code} — ${found.label}` : code;
}
