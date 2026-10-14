/**
 * Download the latest N posting days of raw DIBBS files into data/raw/ so we can
 * inspect them and iterate on parsing without re-hitting DIBBS.
 *
 *   pnpm tsx scripts/fetch-raw.ts [days=3]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchBatchQuoteFiles, fetchIndexFile, listPostingDays } from "../src/lib/dibbs/files";
import { DibbsSession } from "../src/lib/dibbs/session";

const days = Number(process.argv[2] ?? 3);
const outDir = join(process.cwd(), "data/raw");

async function main() {
  const session = new DibbsSession();
  const postingDays = (await listPostingDays(session)).slice(0, days);
  console.log(`Latest ${days} posting days:`, postingDays.map((d) => d.postDate).join(", "));
  await mkdir(outDir, { recursive: true });

  for (const { code } of postingDays) {
    const started = Date.now();
    const index = await fetchIndexFile(session, code);
    await writeFile(join(outDir, `in${code}.txt`), index, "latin1");
    const bq = await fetchBatchQuoteFiles(session, code);
    for (const [name, text] of Object.entries(bq)) await writeFile(join(outDir, name), text, "latin1");
    const lines = index.split(/\r?\n/).filter(Boolean).length;
    console.log(`${code}: ${lines} index lines, bq files [${Object.keys(bq).join(", ")}] in ${Date.now() - started}ms`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
