import { describe, expect, it } from "vitest";
import { calcLine, calcDocumentTotals, D, formatMoney, round2, toDb2 } from "@/lib/money";

describe("calcLine", () => {
  it("computes subtotal, tax and total with 2dp rounding", () => {
    const line = calcLine({ quantity: 3, unitPrice: "45.00", discountAmount: "5.00", taxRate: 10 });
    expect(toDb2(line.subtotal)).toBe("130.00");
    expect(toDb2(line.taxAmount)).toBe("13.00");
    expect(toDb2(line.total)).toBe("143.00");
  });

  it("rounds tax at the line level (half-up)", () => {
    // 33.33 * 8% = 2.6664 -> 2.67
    const line = calcLine({ quantity: 1, unitPrice: "33.33", taxRate: 8 });
    expect(toDb2(line.taxAmount)).toBe("2.67");
  });

  it("document totals equal the sum of rounded lines", () => {
    const lines = [
      calcLine({ quantity: 1, unitPrice: "33.33", taxRate: 8 }),
      calcLine({ quantity: 1, unitPrice: "66.67", taxRate: 8 }),
    ];
    const totals = calcDocumentTotals(lines);
    // 2.67 + 5.33 (66.67*8% = 5.3336 -> 5.33) = 8.00
    expect(toDb2(totals.taxTotal)).toBe("8.00");
    expect(toDb2(totals.total)).toBe("108.00");
  });
});

describe("formatMoney", () => {
  it("groups thousands and pads cents", () => {
    expect(formatMoney("1234567.5")).toBe("1,234,567.50");
    expect(formatMoney(-1234.5)).toBe("-1,234.50");
    expect(formatMoney(0)).toBe("0.00");
  });
});

describe("round2", () => {
  it("uses half-up rounding", () => {
    expect(round2(D("1.005")).toFixed(2)).toBe("1.01");
    expect(round2(D("1.004")).toFixed(2)).toBe("1.00");
  });
});
