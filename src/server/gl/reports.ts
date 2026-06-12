import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, journalEntries, journalLines, type accountTypeEnum } from "@/db/schema";
import { D, sum, toDb2, ZERO } from "@/lib/money";

export type AccountType = (typeof accountTypeEnum)[number];

// GL reporting queries. Reversed entries keep their original lines and gain a
// mirror-image reversal entry, so summing ALL journal lines is correct — the
// pairs net to zero.

interface AccountSums {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: string;
  credit: string;
}

async function accountSums(opts: { fromDate?: string; toDate: string }): Promise<AccountSums[]> {
  const conditions = [lte(journalEntries.entryDate, opts.toDate)];
  if (opts.fromDate) conditions.push(gte(journalEntries.entryDate, opts.fromDate));

  return db
    .select({
      accountId: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`,
      credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(...conditions))
    .groupBy(accounts.id, accounts.code, accounts.name, accounts.type)
    .orderBy(asc(accounts.code));
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  /** Total debits posted to the account up to the date. */
  debit: string;
  /** Total credits posted to the account up to the date. */
  credit: string;
  /** debit - credit (positive = net debit balance). */
  net: string;
}

export interface TrialBalance {
  asOfDate: string;
  rows: TrialBalanceRow[];
  totalDebit: string;
  totalCredit: string;
}

export async function trialBalance(asOfDate: string): Promise<TrialBalance> {
  const sums = await accountSums({ toDate: asOfDate });

  const rows: TrialBalanceRow[] = [];
  for (const row of sums) {
    const debit = D(row.debit);
    const credit = D(row.credit);
    if (debit.isZero() && credit.isZero()) continue;
    rows.push({
      accountId: row.accountId,
      code: row.code,
      name: row.name,
      type: row.type,
      debit: toDb2(debit),
      credit: toDb2(credit),
      net: toDb2(debit.minus(credit)),
    });
  }

  return {
    asOfDate,
    rows,
    totalDebit: toDb2(sum(rows.map((r) => D(r.debit)))),
    totalCredit: toDb2(sum(rows.map((r) => D(r.credit)))),
  };
}

export interface PlRow {
  accountId: string;
  code: string;
  name: string;
  /** Income: credit - debit. Expense: debit - credit. */
  amount: string;
}

export interface ProfitAndLoss {
  fromDate: string;
  toDate: string;
  income: PlRow[];
  expense: PlRow[];
  totalIncome: string;
  totalExpense: string;
  netProfit: string;
}

export async function profitAndLoss(fromDate: string, toDate: string): Promise<ProfitAndLoss> {
  const sums = await accountSums({ fromDate, toDate });

  const income: PlRow[] = [];
  const expense: PlRow[] = [];
  for (const row of sums) {
    if (row.type !== "income" && row.type !== "expense") continue;
    const net =
      row.type === "income"
        ? D(row.credit).minus(D(row.debit))
        : D(row.debit).minus(D(row.credit));
    if (net.isZero()) continue;
    const target = row.type === "income" ? income : expense;
    target.push({ accountId: row.accountId, code: row.code, name: row.name, amount: toDb2(net) });
  }

  const totalIncome = sum(income.map((r) => D(r.amount)));
  const totalExpense = sum(expense.map((r) => D(r.amount)));
  return {
    fromDate,
    toDate,
    income,
    expense,
    totalIncome: toDb2(totalIncome),
    totalExpense: toDb2(totalExpense),
    netProfit: toDb2(totalIncome.minus(totalExpense)),
  };
}

export interface BsRow {
  accountId: string | null;
  code: string;
  name: string;
  amount: string;
}

export interface BalanceSheet {
  asOfDate: string;
  assets: BsRow[];
  liabilities: BsRow[];
  /** Includes a synthetic "Retained Earnings" row (cumulative income - expense). */
  equity: BsRow[];
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  /** totalAssets - (totalLiabilities + totalEquity); "0.00" when balanced. */
  difference: string;
  balanced: boolean;
}

export async function balanceSheet(asOfDate: string): Promise<BalanceSheet> {
  const sums = await accountSums({ toDate: asOfDate });

  const assets: BsRow[] = [];
  const liabilities: BsRow[] = [];
  const equity: BsRow[] = [];
  let retainedEarnings = ZERO;

  for (const row of sums) {
    if (row.type === "income" || row.type === "expense") {
      // Cumulative P&L rolls into equity as retained earnings.
      retainedEarnings = retainedEarnings.plus(D(row.credit).minus(D(row.debit)));
      continue;
    }
    const net =
      row.type === "asset"
        ? D(row.debit).minus(D(row.credit))
        : D(row.credit).minus(D(row.debit));
    if (net.isZero()) continue;
    const bucket = row.type === "asset" ? assets : row.type === "liability" ? liabilities : equity;
    bucket.push({ accountId: row.accountId, code: row.code, name: row.name, amount: toDb2(net) });
  }

  if (!retainedEarnings.isZero()) {
    equity.push({
      accountId: null,
      code: "",
      name: "Retained Earnings",
      amount: toDb2(retainedEarnings),
    });
  }

  const totalAssets = sum(assets.map((r) => D(r.amount)));
  const totalLiabilities = sum(liabilities.map((r) => D(r.amount)));
  const totalEquity = sum(equity.map((r) => D(r.amount)));
  const difference = totalAssets.minus(totalLiabilities.plus(totalEquity));

  return {
    asOfDate,
    assets,
    liabilities,
    equity,
    totalAssets: toDb2(totalAssets),
    totalLiabilities: toDb2(totalLiabilities),
    totalEquity: toDb2(totalEquity),
    difference: toDb2(difference),
    balanced: difference.isZero(),
  };
}
