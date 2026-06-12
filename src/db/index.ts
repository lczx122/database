import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { dbPool?: Pool };

const pool =
  globalForDb.dbPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://accounting:accounting@localhost:5432/accounting",
    max: 10,
  });

// Reuse the pool across Next.js dev-server hot reloads.
if (process.env.NODE_ENV !== "production") globalForDb.dbPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
