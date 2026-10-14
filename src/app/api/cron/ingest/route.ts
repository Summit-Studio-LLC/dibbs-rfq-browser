import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import { ingestRecent } from "@/lib/ingest";
import { RFQ_DATA_TAG } from "@/lib/rfqs/queries";

/** DIBBS downloads take ~15s per file from Vercel; a new posting day is two files plus the upserts. */
export const maxDuration = 300;

/** Stop starting new posting days after this long, leaving room for the one in progress to finish. */
const BUDGET_MS = 180_000;

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Compared in constant time; refused if the secret is unset. */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

/**
 * Load DIBBS posting days that aren't in the database yet (vercel.json runs this on weekdays),
 * then expire the cached RFQ queries so the next page view reads the new data.
 */
export async function GET(request: Request) {
  await connection(); // request time only: never run (or prerender a 401) during the build
  if (!authorized(request)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const started = performance.now();
  try {
    const { window, results, pending } = await ingestRecent({ budgetMs: BUDGET_MS });
    if (results.length) revalidateTag(RFQ_DATA_TAG, { expire: 0 });
    const elapsedMs = Math.round(performance.now() - started);
    console.log(`[cron/ingest] ingested ${results.length} day(s), ${pending.length} pending, ${elapsedMs}ms`);
    return Response.json({ ok: true, window, ingested: results, pending, elapsedMs });
  } catch (err) {
    // A failed day may have written some rows before failing; drop cached results either way.
    revalidateTag(RFQ_DATA_TAG, { expire: 0 });
    // DIBBS and driver errors can include URLs or connection details; keep them in server logs only.
    console.error("[cron/ingest] ingest failed", err);
    return Response.json({ ok: false, error: "ingest failed" }, { status: 500 });
  }
}
