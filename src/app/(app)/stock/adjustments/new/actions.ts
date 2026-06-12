"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stockAdjustmentLines, stockAdjustments } from "@/db/schema";
import { requireUser } from "@/server/auth";
import { nextDocNo } from "@/server/documents/numbering";
import { applyMovement } from "@/server/stock/costing";
import { postJournalEntry } from "@/server/gl/posting";
import { getAccountMappings } from "@/server/settings";
import { D, toDb2, toDb4, ZERO } from "@/lib/money";

export interface AdjustmentFormState {
  error: string | null;
}

export async function createAdjustmentAction(
  _prev: AdjustmentFormState,
  formData: FormData,
): Promise<AdjustmentFormState> {
  await requireUser();

  const docDate = String(formData.get("docDate") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!docDate) return { error: "Date is required" };

  const itemIds = formData.getAll("lineItem").map(String);
  const qtyChanges = formData.getAll("lineQty").map(String);
  const unitCosts = formData.getAll("lineCost").map(String);

  const lines = itemIds
    .map((itemId, i) => ({
      itemId,
      qtyChange: D(qtyChanges[i] ?? 0),
      unitCost: D(unitCosts[i] ?? 0),
    }))
    .filter((l) => l.itemId && !l.qtyChange.isZero());

  if (lines.length === 0) return { error: "Add at least one line with a non-zero quantity" };
  for (const l of lines) {
    if (l.qtyChange.gt(0) && l.unitCost.lt(0)) {
      return { error: "Unit cost cannot be negative" };
    }
  }

  try {
    await db.transaction(async (tx) => {
      const docNo = await nextDocNo(tx, "STOCK_ADJ");
      const [adjustment] = await tx
        .insert(stockAdjustments)
        .values({ docNo, docDate, reason })
        .returning();

      let netValueChange = ZERO;
      let lineNo = 1;
      for (const line of lines) {
        const isInbound = line.qtyChange.gt(0);
        await tx.insert(stockAdjustmentLines).values({
          adjustmentId: adjustment.id,
          lineNo: lineNo++,
          itemId: line.itemId,
          qtyChange: toDb4(line.qtyChange),
          unitCost: isInbound ? line.unitCost.toFixed(6) : "0",
        });

        if (isInbound) {
          const result = await applyMovement(tx, {
            itemId: line.itemId,
            movementDate: docDate,
            type: "adjustment",
            sourceType: "STOCK_ADJ",
            sourceId: adjustment.id,
            qtyIn: toDb4(line.qtyChange),
            unitCost: line.unitCost.toFixed(6),
          });
          netValueChange = netValueChange.plus(D(result.totalCost));
        } else {
          const result = await applyMovement(tx, {
            itemId: line.itemId,
            movementDate: docDate,
            type: "adjustment",
            sourceType: "STOCK_ADJ",
            sourceId: adjustment.id,
            qtyOut: toDb4(line.qtyChange.abs()),
          });
          netValueChange = netValueChange.minus(D(result.totalCost));
        }
      }

      // Positive net change: DR Stock / CR Stock Adjustment; negative: reverse.
      if (!netValueChange.isZero()) {
        const mappings = await getAccountMappings();
        const amount = toDb2(netValueChange.abs());
        const isIncrease = netValueChange.gt(0);
        const drAccount = isIncrease ? mappings.stock : mappings.stockAdjustment;
        const crAccount = isIncrease ? mappings.stockAdjustment : mappings.stock;

        const entryId = await postJournalEntry(
          tx,
          {
            entryDate: docDate,
            description: `Stock adjustment ${docNo}${reason ? ` — ${reason}` : ""}`,
            sourceType: "stock_adj",
            lines: [
              { accountCode: drAccount, debit: amount, credit: "0.00", description: docNo },
              { accountCode: crAccount, debit: "0.00", credit: amount, description: docNo },
            ],
          },
          adjustment.id,
        );
        await tx
          .update(stockAdjustments)
          .set({ postedJournalEntryId: entryId })
          .where(eq(stockAdjustments.id, adjustment.id));
      }
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create adjustment" };
  }

  revalidatePath("/stock");
  revalidatePath("/stock/adjustments");
  revalidatePath("/gl/journals");
  redirect("/stock/adjustments");
}
