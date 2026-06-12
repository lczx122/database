import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { accounts } from "./gl";

export const idTypeEnum = ["BRN", "NRIC", "PASSPORT", "ARMY"] as const;

// Factory so each table gets fresh column builders (sharing one object makes
// Drizzle generate colliding constraint names across tables).
const partyColumns = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  tin: text("tin").notNull().default(""),
  idType: text("id_type", { enum: idTypeEnum }).notNull().default("BRN"),
  idValue: text("id_value").notNull().default(""),
  sstNo: text("sst_no"),
  email: text("email"),
  phone: text("phone"),
  addressLine1: text("address_line1").notNull().default(""),
  addressLine2: text("address_line2"),
  addressLine3: text("address_line3"),
  postcode: text("postcode").notNull().default(""),
  city: text("city").notNull().default(""),
  stateCode: text("state_code").notNull().default("14"),
  countryCode: text("country_code").notNull().default("MYS"),
  creditTermsDays: integer("credit_terms_days").notNull().default(30),
  paymentModeCode: text("payment_mode_code").notNull().default("01"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  ...partyColumns(),
  receivableAccountId: uuid("receivable_account_id").references(() => accounts.id),
});

export const suppliers = pgTable("suppliers", {
  ...partyColumns(),
  msicCode: text("msic_code"),
  payableAccountId: uuid("payable_account_id").references(() => accounts.id),
});

export const taxCodes = pgTable("tax_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // e.g. "SV-8", "SST-10", "E", "NA"
  description: text("description").notNull(),
  rate: numeric("rate", { precision: 9, scale: 4 }).notNull().default("0"),
  // MyInvois tax type code list: 01 sales tax, 02 service tax, 03 tourism tax,
  // 04 high-value goods tax, 05 low-value goods sales tax, 06 not applicable,
  // E exempt.
  myinvoisTaxTypeCode: text("myinvois_tax_type_code").notNull().default("06"),
  exemptionReason: text("exemption_reason"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type", { enum: ["product", "service"] }).notNull().default("product"),
  classificationCode: text("classification_code").notNull().default("022"),
  uomCode: text("uom_code").notNull().default("C62"),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull().default("0"),
  cost: numeric("cost", { precision: 18, scale: 2 }).notNull().default("0"),
  salesTaxCodeId: uuid("sales_tax_code_id").references(() => taxCodes.id),
  purchaseTaxCodeId: uuid("purchase_tax_code_id").references(() => taxCodes.id),
  trackStock: boolean("track_stock").notNull().default(false),
  salesAccountId: uuid("sales_account_id").references(() => accounts.id),
  cogsAccountId: uuid("cogs_account_id").references(() => accounts.id),
  stockAccountId: uuid("stock_account_id").references(() => accounts.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
