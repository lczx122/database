import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hash } from "@node-rs/argon2";
import * as schema from "../src/db/schema";
import {
  STATE_CODES,
  CLASSIFICATION_CODES,
  PAYMENT_MODE_CODES,
  UOM_CODES,
  COUNTRY_CODES,
  MSIC_CODES,
  TAX_CODE_SEEDS,
  CHART_OF_ACCOUNTS,
} from "./data/code-lists";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://accounting:accounting@localhost:5432/accounting",
});
const db = drizzle(pool, { schema });

async function main() {
  console.log("Seeding code lists...");
  await db
    .insert(schema.stateCodes)
    .values(STATE_CODES.map(([code, name]) => ({ code, name })))
    .onConflictDoNothing();
  await db
    .insert(schema.classificationCodes)
    .values(CLASSIFICATION_CODES.map(([code, description]) => ({ code, description })))
    .onConflictDoNothing();
  await db
    .insert(schema.paymentModeCodes)
    .values(PAYMENT_MODE_CODES.map(([code, name]) => ({ code, name })))
    .onConflictDoNothing();
  await db
    .insert(schema.uomCodes)
    .values(UOM_CODES.map(([code, name]) => ({ code, name })))
    .onConflictDoNothing();
  await db
    .insert(schema.countryCodes)
    .values(COUNTRY_CODES.map(([code, name]) => ({ code, name })))
    .onConflictDoNothing();
  await db
    .insert(schema.msicCodes)
    .values(MSIC_CODES.map(([code, description]) => ({ code, description })))
    .onConflictDoNothing();

  console.log("Seeding tax codes...");
  await db.insert(schema.taxCodes).values(TAX_CODE_SEEDS).onConflictDoNothing();

  console.log("Seeding chart of accounts...");
  const idByCode = new Map<string, string>();
  for (const account of CHART_OF_ACCOUNTS) {
    const [row] = await db
      .insert(schema.accounts)
      .values({
        code: account.code,
        name: account.name,
        type: account.type,
        parentId: account.parent ? idByCode.get(account.parent) : undefined,
        isSystem: account.isSystem ?? false,
      })
      .onConflictDoNothing()
      .returning();
    if (row) {
      idByCode.set(account.code, row.id);
    } else {
      const existing = await db.query.accounts.findFirst({
        where: (t, { eq }) => eq(t.code, account.code),
      });
      if (existing) idByCode.set(account.code, existing.id);
    }
  }

  console.log("Seeding admin user (admin / admin123 — change after first login)...");
  const existingAdmin = await db.query.users.findFirst({
    where: (t, { eq }) => eq(t.username, "admin"),
  });
  if (!existingAdmin) {
    await db.insert(schema.users).values({
      username: "admin",
      passwordHash: await hash("admin123"),
      displayName: "Administrator",
      role: "admin",
    });
  }

  console.log("Seeding company profile placeholder...");
  const existingProfile = await db.query.companyProfile.findFirst();
  if (!existingProfile) {
    await db.insert(schema.companyProfile).values({
      name: "My Company Sdn Bhd",
      tin: "",
      brn: "",
      msicCode: "00000",
      msicDescription: "NOT APPLICABLE",
      addressLine1: "",
      postcode: "",
      city: "",
      stateCode: "14",
      countryCode: "MYS",
      phone: "",
    });
  }

  console.log("Seeding demo master data...");
  const taxNa = await db.query.taxCodes.findFirst({ where: (t, { eq }) => eq(t.code, "NA") });
  const taxSv8 = await db.query.taxCodes.findFirst({ where: (t, { eq }) => eq(t.code, "SV-8") });

  await db
    .insert(schema.customers)
    .values([
      {
        code: "C-0001",
        name: "Example Trading Sdn Bhd",
        tin: "C12345678900",
        idType: "BRN",
        idValue: "202001012345",
        addressLine1: "1, Jalan Contoh 1/2",
        postcode: "47810",
        city: "Petaling Jaya",
        stateCode: "10",
        countryCode: "MYS",
        phone: "+60312345678",
        email: "accounts@example-trading.test",
      },
      {
        code: "C-0002",
        name: "Ali bin Abu",
        tin: "IG123456789010",
        idType: "NRIC",
        idValue: "900101105678",
        addressLine1: "23, Jalan Damai",
        postcode: "50480",
        city: "Kuala Lumpur",
        stateCode: "14",
        countryCode: "MYS",
        phone: "+60123456789",
      },
      {
        code: "C-PUBLIC",
        name: "General Public",
        tin: "EI00000000010",
        idType: "BRN",
        idValue: "NA",
        addressLine1: "NA",
        postcode: "NA",
        city: "NA",
        stateCode: "17",
        countryCode: "MYS",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.suppliers)
    .values([
      {
        code: "S-0001",
        name: "Pembekal Maju Sdn Bhd",
        tin: "C98765432100",
        idType: "BRN",
        idValue: "201501054321",
        addressLine1: "88, Jalan Industri 5",
        postcode: "81200",
        city: "Johor Bahru",
        stateCode: "01",
        countryCode: "MYS",
        phone: "+6075551234",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.items)
    .values([
      {
        code: "ITEM-001",
        name: "Consulting Services",
        description: "Professional consulting services (per hour)",
        type: "service",
        classificationCode: "022",
        uomCode: "HUR",
        unitPrice: "250.00",
        salesTaxCodeId: taxSv8?.id,
        trackStock: false,
      },
      {
        code: "ITEM-002",
        name: "Wireless Mouse",
        description: "Wireless optical mouse",
        type: "product",
        classificationCode: "003",
        uomCode: "H87",
        unitPrice: "45.00",
        cost: "28.00",
        salesTaxCodeId: taxNa?.id,
        trackStock: true,
      },
      {
        code: "ITEM-003",
        name: "Laptop 14-inch",
        description: "14-inch business laptop",
        type: "product",
        classificationCode: "003",
        uomCode: "H87",
        unitPrice: "3200.00",
        cost: "2600.00",
        salesTaxCodeId: taxNa?.id,
        trackStock: true,
      },
      {
        code: "ITEM-004",
        name: "Software Subscription (Annual)",
        description: "Annual software subscription license",
        type: "service",
        classificationCode: "017",
        uomCode: "ANN",
        unitPrice: "1200.00",
        salesTaxCodeId: taxSv8?.id,
        trackStock: false,
      },
      {
        code: "ITEM-005",
        name: "Delivery Charge",
        description: "Delivery and handling",
        type: "service",
        classificationCode: "022",
        uomCode: "C62",
        unitPrice: "15.00",
        salesTaxCodeId: taxNa?.id,
        trackStock: false,
      },
    ])
    .onConflictDoNothing();

  console.log("Done.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
