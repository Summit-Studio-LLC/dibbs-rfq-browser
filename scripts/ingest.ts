/**
 * Load recent DIBBS posting days into Postgres.
 *
 *   pnpm ingest              # last 3 weekday posting days (skips days already loaded)
 *   pnpm ingest 5 --force    # last 5 weekdays, re-ingesting loaded days
 */
import { ingestRecent } from "../src/lib/ingest";

const weekdays = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3);
const force = process.argv.includes("--force");

async function main() {
  const started = Date.now();
  const { window, results } = await ingestRecent({ weekdays, force });
  console.log(`Window: ${window.join(", ")}`);
  if (results.length === 0) console.log("Nothing new to ingest.");
  for (const r of results) {
    console.log(`${r.postDate}: ${r.lineItems} line items, ${r.approvedSources} approved sources, ${r.changes} changes`);
  }
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
