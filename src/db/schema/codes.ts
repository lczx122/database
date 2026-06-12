import { pgTable, text } from "drizzle-orm/pg-core";

// Reference code lists published in the LHDN MyInvois SDK, seeded from
// seeds/*.json and used by searchable comboboxes in the UI.

export const classificationCodes = pgTable("classification_codes", {
  code: text("code").primaryKey(), // e.g. "022"
  description: text("description").notNull(),
});

export const stateCodes = pgTable("state_codes", {
  code: text("code").primaryKey(), // "00".."17"
  name: text("name").notNull(),
});

export const countryCodes = pgTable("country_codes", {
  code: text("code").primaryKey(), // ISO 3166-1 alpha-3
  name: text("name").notNull(),
});

export const uomCodes = pgTable("uom_codes", {
  code: text("code").primaryKey(), // UN/ECE Rec 20, e.g. "C62", "KGM"
  name: text("name").notNull(),
});

export const msicCodes = pgTable("msic_codes", {
  code: text("code").primaryKey(), // MSIC 2008 5-digit
  description: text("description").notNull(),
});

export const paymentModeCodes = pgTable("payment_mode_codes", {
  code: text("code").primaryKey(), // "01" cash .. "08" e-wallet
  name: text("name").notNull(),
});
