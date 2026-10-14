import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

function createDb() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

let db: ReturnType<typeof createDb> | null = null;

/** Created on first use so `next build` doesn't need DATABASE_URL at import time. */
export function getDb() {
  db ??= createDb();
  return db;
}
