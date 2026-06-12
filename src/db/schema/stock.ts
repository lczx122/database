import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { items } from "./master";
import { journalEntries } from "./gl";

// Perpetual weighted-average costing: each movement stores the running
// quantity and value after it is applied. Movements for an item are written
// inside a transaction that locks the item row, keeping the running figures
// sequential.
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => items.id),
    movementDate: date("movement_date").notNull(),
    type: text("type", { enum: ["opening", "purchase", "sale", "adjustment"] }).notNull(),
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    qtyIn: numeric("qty_in", { precision: 18, scale: 4 }).notNull().default("0"),
    qtyOut: numeric("qty_out", { precision: 18, scale: 4 }).notNull().default("0"),
    unitCost: numeric("unit_cost", { precision: 18, scale: 6 }).notNull().default("0"),
    totalCost: numeric("total_cost", { precision: 18, scale: 2 }).notNull().default("0"),
    runningQty: numeric("running_qty", { precision: 18, scale: 4 }).notNull().default("0"),
    runningValue: numeric("running_value", { precision: 18, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stock_movements_item_idx").on(t.itemId, t.createdAt)],
);

export const stockAdjustments = pgTable("stock_adjustments", {
  id: uuid("id").primaryKey().defaultRandom(),
  docNo: text("doc_no").unique(),
  docDate: date("doc_date").notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status", { enum: ["issued", "cancelled"] }).notNull().default("issued"),
  postedJournalEntryId: uuid("posted_journal_entry_id").references(() => journalEntries.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockAdjustmentLines = pgTable("stock_adjustment_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  adjustmentId: uuid("adjustment_id")
    .notNull()
    .references(() => stockAdjustments.id, { onDelete: "cascade" }),
  lineNo: integer("line_no").notNull(),
  itemId: uuid("item_id").notNull().references(() => items.id),
  qtyChange: numeric("qty_change", { precision: 18, scale: 4 }).notNull(), // + in, - out
  unitCost: numeric("unit_cost", { precision: 18, scale: 6 }).notNull().default("0"),
});
