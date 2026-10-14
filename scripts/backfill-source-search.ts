/**
 * Rebuild the approved-source search copies on every line item (rfq_line_items.source_parts and
 * source_cages). Ingest keeps them current per posting day; run this once after adding the columns,
 * or any time they are suspected stale. Safe to re-run: it only writes rows whose copy changed.
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill-source-search.ts
 */
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { refreshSourceSearch } from "../src/lib/ingest";

async function main() {
  const started = Date.now();
  await refreshSourceSearch();
  await getDb().execute(sql`analyze rfq_line_items`); // fresh planner stats for the new columns
  const [row] = (
    await getDb().execute<{ items: number; with_sources: number }>(
      sql`select count(*)::int as items, count(source_cages)::int as with_sources from rfq_line_items`,
    )
  ).rows;
  console.log(`${row.with_sources} of ${row.items} line items have approved sources. Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
