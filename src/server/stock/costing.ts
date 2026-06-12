import { desc, eq, sql } from "drizzle-orm";
import { D, toDb2, toDb4, ZERO } from "@/lib/money";
import type { Tx } from "@/db";
import { stockMovements } from "@/db/schema";

export interface MovementInput {
  itemId: string;
  movementDate: string;
  type: "opening" | "purchase" | "sale" | "adjustment";
  sourceType?: string;
  sourceId?: string;
  qtyIn?: string; // decimal strings
  qtyOut?: string;
  /** Required for inbound movements; outbound uses the running average. */
  unitCost?: string;
}

export interface MovementResult {
  /** Cost recognized for this movement (for COGS posting on outbound). */
  totalCost: string;
  runningQty: string;
  runningValue: string;
}

/**
 * Apply a stock movement with perpetual weighted-average costing. Locks the
 * item row so concurrent movements for the same item serialize and the
 * running figures stay consistent.
 */
export async function applyMovement(tx: Tx, input: MovementInput): Promise<MovementResult> {
  await tx.execute(sql`SELECT id FROM items WHERE id = ${input.itemId} FOR UPDATE`);

  const last = await tx.query.stockMovements.findFirst({
    where: eq(stockMovements.itemId, input.itemId),
    orderBy: [desc(stockMovements.createdAt), desc(stockMovements.id)],
  });

  const prevQty = last ? D(last.runningQty) : ZERO;
  const prevValue = last ? D(last.runningValue) : ZERO;

  const qtyIn = D(input.qtyIn ?? 0);
  const qtyOut = D(input.qtyOut ?? 0);
  if (qtyIn.isZero() && qtyOut.isZero()) throw new Error("Movement has no quantity");
  if (!qtyIn.isZero() && !qtyOut.isZero()) throw new Error("Movement cannot be both in and out");

  let unitCost: ReturnType<typeof D>;
  let totalCost: ReturnType<typeof D>;
  let runningQty: ReturnType<typeof D>;
  let runningValue: ReturnType<typeof D>;

  if (!qtyIn.isZero()) {
    unitCost = D(input.unitCost ?? 0);
    totalCost = qtyIn.times(unitCost);
    runningQty = prevQty.plus(qtyIn);
    runningValue = prevValue.plus(totalCost);
  } else {
    if (qtyOut.greaterThan(prevQty)) {
      throw new Error(
        `Insufficient stock: trying to issue ${qtyOut} but only ${prevQty} on hand`,
      );
    }
    // Weighted average of what's on hand.
    unitCost = prevQty.isZero() ? ZERO : prevValue.div(prevQty);
    totalCost = qtyOut.times(unitCost);
    runningQty = prevQty.minus(qtyOut);
    // Avoid residual value when quantity hits zero.
    runningValue = runningQty.isZero() ? ZERO : prevValue.minus(totalCost);
  }

  const result: MovementResult = {
    totalCost: toDb2(totalCost),
    runningQty: toDb4(runningQty),
    runningValue: toDb2(runningValue),
  };

  await tx.insert(stockMovements).values({
    itemId: input.itemId,
    movementDate: input.movementDate,
    type: input.type,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    qtyIn: toDb4(qtyIn),
    qtyOut: toDb4(qtyOut),
    unitCost: unitCost.toDecimalPlaces(6).toFixed(6),
    totalCost: result.totalCost,
    runningQty: result.runningQty,
    runningValue: result.runningValue,
  });

  return result;
}

export async function currentStockLevel(tx: Tx, itemId: string) {
  const last = await tx.query.stockMovements.findFirst({
    where: eq(stockMovements.itemId, itemId),
    orderBy: [desc(stockMovements.createdAt), desc(stockMovements.id)],
  });
  return {
    qty: last ? D(last.runningQty) : ZERO,
    value: last ? D(last.runningValue) : ZERO,
  };
}
