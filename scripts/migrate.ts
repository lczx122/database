import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://accounting:accounting@localhost:5432/accounting",
});

migrate(drizzle(pool), { migrationsFolder: "./drizzle" })
  .then(() => {
    console.log("Migrations applied.");
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
