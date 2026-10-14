import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";

/** Database health: proves Neon is reachable from this deployment. */
export async function GET() {
  await connection();
  const started = performance.now();
  try {
    const { rows } = await getDb().execute(sql`select current_database() as database, now() as server_time`);
    return Response.json({ ok: true, ...rows[0], latencyMs: Math.round(performance.now() - started) });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 503 });
  }
}
