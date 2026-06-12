import Decimal from "decimal.js";

// All monetary arithmetic in the app goes through this module. The database
// stores NUMERIC columns which the pg driver returns as strings; convert at
// this boundary and never do float math on amounts.

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

export const D = (value: string | number | Decimal | null | undefined): Decimal =>
  new Decimal(value === null || value === undefined || value === "" ? 0 : value);

export const ZERO = new Decimal(0);

/** Round to 2 decimal places (sen). */
export const round2 = (value: Decimal): Decimal => value.toDecimalPlaces(2);

/** Serialize for a NUMERIC(18,2) column. */
export const toDb2 = (value: Decimal): string => round2(value).toFixed(2);

/** Serialize for a NUMERIC(18,4) quantity column. */
export const toDb4 = (value: Decimal): string => value.toDecimalPlaces(4).toFixed(4);

export const sum = (values: Decimal[]): Decimal =>
  values.reduce((acc, v) => acc.plus(v), ZERO);

/** Format for display, e.g. 1234.5 -> "1,234.50". */
export function formatMoney(value: string | number | Decimal): string {
  const d = round2(D(value));
  const [int, frac] = d.toFixed(2).split(".");
  const sign = int.startsWith("-") ? "-" : "";
  const digits = sign ? int.slice(1) : int;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}.${frac}`;
}

export interface LineInput {
  quantity: string | number;
  unitPrice: string | number;
  discountAmount?: string | number;
  taxRate: string | number; // percentage, e.g. 8 for 8%
}

export interface LineTotals {
  subtotal: Decimal; // qty * price - discount, rounded to 2dp
  taxAmount: Decimal;
  total: Decimal;
}

/**
 * Line-level rounding: each line's subtotal and tax are rounded to 2dp and
 * document totals are sums of rounded lines, so MyInvois cross-field
 * validation (totals must equal the sum of lines) always passes.
 */
export function calcLine(input: LineInput): LineTotals {
  const gross = D(input.quantity).times(D(input.unitPrice));
  const subtotal = round2(gross.minus(D(input.discountAmount ?? 0)));
  const taxAmount = round2(subtotal.times(D(input.taxRate)).div(100));
  return { subtotal, taxAmount, total: subtotal.plus(taxAmount) };
}

export interface DocumentTotals {
  subtotal: Decimal;
  taxTotal: Decimal;
  total: Decimal;
}

export function calcDocumentTotals(lines: LineTotals[]): DocumentTotals {
  const subtotal = sum(lines.map((l) => l.subtotal));
  const taxTotal = sum(lines.map((l) => l.taxAmount));
  return { subtotal, taxTotal, total: subtotal.plus(taxTotal) };
}
