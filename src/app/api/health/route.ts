import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";

/** Database health: proves Neon is reachable from this deployment. */
export async function GET() {
  await connection();
  const started = performance.now();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, latencyMs: Math.round(performance.now() - started) });
  } catch (err) {
    // Driver errors can include connection details; keep them in server logs only.
    console.error("[health] database check failed", err);
    return Response.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}
