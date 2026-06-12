import { describe, expect, it } from "vitest";
import {
  assertBalanced,
  postingForSalesDocument,
  postingForSupplierBill,
  postingForReceipt,
  postingForPayment,
  postingForCogs,
} from "@/server/gl/posting";
import { DEFAULT_ACCOUNT_MAPPINGS as M } from "@/server/settings";
import { D, sum } from "@/lib/money";

const balanced = (draft: { lines: Array<{ debit: string; credit: string }> }) => {
  const debits = sum(draft.lines.map((l) => D(l.debit)));
  const credits = sum(draft.lines.map((l) => D(l.credit)));
  return debits.equals(credits);
};

describe("postingForSalesDocument", () => {
  const base = {
    docNo: "INV-00001",
    docDate: "2026-06-12",
    customerId: "c-1",
    customerName: "Example Trading",
    subtotal: "2500.00",
    taxTotal: "200.00",
    total: "2700.00",
  };

  it("invoice posts DR AR / CR Sales + SST", () => {
    const draft = postingForSalesDocument({ ...base, docType: "INVOICE" }, M);
    expect(balanced(draft)).toBe(true);
    const ar = draft.lines.find((l) => l.accountCode === M.arControl)!;
    const sales = draft.lines.find((l) => l.accountCode === M.sales)!;
    const sst = draft.lines.find((l) => l.accountCode === M.sstPayable)!;
    expect(ar.debit).toBe("2700.00");
    expect(sales.credit).toBe("2500.00");
    expect(sst.credit).toBe("200.00");
    expect(ar.partyType).toBe("customer");
  });

  it("credit note is the exact mirror of an invoice", () => {
    const inv = postingForSalesDocument({ ...base, docType: "INVOICE" }, M);
    const cn = postingForSalesDocument({ ...base, docType: "CREDIT_NOTE" }, M);
    expect(balanced(cn)).toBe(true);
    inv.lines.forEach((line, i) => {
      expect(cn.lines[i].accountCode).toBe(line.accountCode);
      expect(cn.lines[i].debit).toBe(line.credit);
      expect(cn.lines[i].credit).toBe(line.debit);
    });
  });

  it("omits the SST line when tax is zero", () => {
    const draft = postingForSalesDocument(
      { ...base, docType: "INVOICE", taxTotal: "0.00", total: "2500.00" },
      M,
    );
    expect(draft.lines.map((l) => l.accountCode)).not.toContain(M.sstPayable);
    expect(balanced(draft)).toBe(true);
  });
});

describe("postingForSupplierBill", () => {
  it("splits stocked goods to Stock and the rest to expense", () => {
    const draft = postingForSupplierBill(
      {
        docNo: "BILL-00001",
        docDate: "2026-06-12",
        supplierId: "s-1",
        supplierName: "Pembekal Maju",
        subtotal: "1000.00",
        taxTotal: "0.00",
        total: "1000.00",
        stockAmount: "800.00",
      },
      M,
    );
    expect(balanced(draft)).toBe(true);
    expect(draft.lines.find((l) => l.accountCode === M.stock)!.debit).toBe("800.00");
    expect(draft.lines.find((l) => l.accountCode === M.cogs)!.debit).toBe("200.00");
    expect(draft.lines.find((l) => l.accountCode === M.apControl)!.credit).toBe("1000.00");
  });
});

describe("receipts and payments", () => {
  it("receipt: DR bank / CR AR", () => {
    const draft = postingForReceipt({
      docNo: "OR-00001",
      docDate: "2026-06-12",
      customerId: "c-1",
      customerName: "Example Trading",
      amount: "500.00",
      bankAccountCode: M.bank,
      arControlCode: M.arControl,
    });
    expect(balanced(draft)).toBe(true);
    expect(draft.lines[0].debit).toBe("500.00");
    expect(draft.lines[1].credit).toBe("500.00");
  });

  it("payment: DR AP / CR bank", () => {
    const draft = postingForPayment({
      docNo: "PV-00001",
      docDate: "2026-06-12",
      supplierId: "s-1",
      supplierName: "Pembekal Maju",
      amount: "300.00",
      bankAccountCode: M.bank,
      apControlCode: M.apControl,
    });
    expect(balanced(draft)).toBe(true);
    expect(draft.lines[0].accountCode).toBe(M.apControl);
    expect(draft.lines[0].debit).toBe("300.00");
  });
});

describe("COGS posting", () => {
  it("recognizes COGS on sale and reverses on return", () => {
    const sale = postingForCogs(
      { docNo: "INV-1", docDate: "2026-06-12", cogsAmount: "120.00", isReversal: false },
      M,
    )!;
    const ret = postingForCogs(
      { docNo: "CN-1", docDate: "2026-06-12", cogsAmount: "120.00", isReversal: true },
      M,
    )!;
    expect(balanced(sale)).toBe(true);
    expect(sale.lines[0].accountCode).toBe(M.cogs);
    expect(ret.lines[0].accountCode).toBe(M.stock);
  });

  it("returns null for zero amounts", () => {
    expect(
      postingForCogs({ docNo: "X", docDate: "2026-06-12", cogsAmount: "0.00", isReversal: false }, M),
    ).toBeNull();
  });
});

describe("assertBalanced", () => {
  it("throws on unbalanced entries", () => {
    expect(() =>
      assertBalanced({
        entryDate: "2026-06-12",
        description: "bad",
        sourceType: "manual",
        lines: [
          { accountCode: "1100", debit: "10.00", credit: "0.00", description: "" },
          { accountCode: "4000", debit: "0.00", credit: "9.99", description: "" },
        ],
      }),
    ).toThrow(/unbalanced/);
  });
});
