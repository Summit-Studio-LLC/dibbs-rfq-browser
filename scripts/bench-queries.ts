/**
 * Benchmark the app's Postgres queries from this machine: latency of the real query
 * functions (as the page runs them) and EXPLAIN ANALYZE of the main SQL shapes.
 *
 *   npx dotenv -e .env.local -- npx tsx --conditions=react-server scripts/bench-queries.ts [runs]
 *
 * --conditions=react-server lets queries.ts import "server-only" outside Next. Default 15 runs.
 * Timings from a laptop include a network round trip to Neon per HTTP query; see docs/PERFORMANCE.md.
 * The page calls cached wrappers of these functions ("use cache", which only runs inside Next), so this
 * measures what a cache miss costs: the queries underneath.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { parseFilters } from "../src/lib/rfqs/filters";
import {
  getFacetsUncached as getFacets,
  getFreshness,
  getRfqDetailUncached as getRfqDetail,
  searchRfqsUncached as searchRfqs,
} from "../src/lib/rfqs/queries";

const RUNS = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 15);
const EXPLAIN_RUNS = 5;

/** URL query strings, exactly as the browser would send them. */
const SCENARIOS: [name: string, query: string][] = [
  ["default view", ""],
  ["keyword", "q=screw"],
  ["dashed NSN fragment", "q=5305-00"],
  ["approved part #", "q=BACB30"],
  ["set-aside + closing", "sa=Y&closing=7"],
  ["fsc + type + multi-sort", "fsc=5305,5310&type=F&sort=-qty,closes"],
  ["deep page", "page=50"],
  ["deep page, sort by sources", "sort=-sources&page=50"],
  ["include closed, 100/page", "closed=1&size=100"],
];
const DETAIL_ID = "SPE4A727T0768~7018681797"; // 31 approved sources

// Every neon-http query is one fetch; wrap it to count round trips and capture the exact SQL sent.
type Captured = { query: string; params: unknown[] };
let captured: Captured[] | null = null;
let requests = 0;
neonConfig.fetchFunction = (url: string, init: RequestInit) => {
  requests++;
  if (captured && typeof init.body === "string") {
    const body = JSON.parse(init.body);
    if (body.query) captured.push({ query: body.query, params: body.params ?? [] });
  }
  return fetch(url, init);
};
const client = neon(process.env.DATABASE_URL!);

const filtersFor = (qs: string) => parseFilters(Object.fromEntries(new URLSearchParams(qs)));

async function timeMs(fn: () => Promise<unknown>) {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/** Linear-interpolated percentile of a sorted copy. */
function pct(values: number[], p: number) {
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
}
const stats = (v: number[]) => `${pct(v, 0.5).toFixed(0)}/${pct(v, 0.95).toFixed(0)}/${Math.max(...v).toFixed(0)}`;

async function measure(fn: () => Promise<unknown>) {
  const before = requests;
  await fn(); // warm-up
  const perCall = requests - before;
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) samples.push(await timeMs(fn));
  return { samples, perCall };
}

function table(header: string[], rows: string[][]) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const last = header.length - 1;
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : i === last ? c : c.padStart(widths[i]))).join("  ");
  console.log(line(header));
  console.log(widths.map((w, i) => "-".repeat(i === last ? header[i].length : w)).join("  "));
  for (const r of rows) console.log(line(r));
}

type PlanNode = Record<string, unknown> & { Plans?: PlanNode[] };

/** "Seq Scan rfq_line_items", "Bitmap Index Scan rfq_search_trgm ×3", ... for every scan in the plan. */
function scans(node: PlanNode, out: string[] = []): string[] {
  const type = node["Node Type"] as string;
  const loops = node["Actual Loops"] as number;
  if (type.includes("Scan")) out.push(`${type} ${node["Index Name"] ?? node["Relation Name"]}${loops > 1 ? ` ×${loops}` : ""}`);
  if (node["Sort Method"]) out.push(`${node["Sort Method"]}`);
  for (const child of node.Plans ?? []) scans(child, out);
  return out;
}

async function explain({ query, params }: Captured) {
  const runs: { planning: number; execution: number; plan: PlanNode }[] = [];
  for (let i = 0; i < EXPLAIN_RUNS; i++) {
    const [row] = (await client.query(`explain (analyze, buffers, format json) ${query}`, params)) as Record<string, unknown>[];
    const [result] = row["QUERY PLAN"] as { "Planning Time": number; "Execution Time": number; Plan: PlanNode }[];
    runs.push({ planning: result["Planning Time"], execution: result["Execution Time"], plan: result.Plan });
  }
  const { plan } = runs.at(-1)!;
  return {
    planning: pct(runs.map((r) => r.planning), 0.5),
    execution: pct(runs.map((r) => r.execution), 0.5),
    rows: plan["Actual Rows"] as number,
    buffers: `${plan["Shared Hit Blocks"] ?? 0} hit/${plan["Shared Read Blocks"] ?? 0} read`,
    scans: [...new Set(scans(plan))].join("; "),
  };
}

/** Run `fn` once and return the SQL it sent, in order. */
async function capture(fn: () => Promise<unknown>) {
  captured = [];
  await fn();
  const out = captured;
  captured = null;
  return out;
}

async function main() {
  // 1. Connection: the very first query pays DNS + TLS, and a compute wake-up if Neon had scaled to zero.
  const firstMs = await timeMs(() => client.query("select 1"));
  const [boot] = (await client.query(
    "select extract(epoch from now() - pg_postmaster_start_time())::int as uptime_s, current_setting('server_version') as version",
  )) as { uptime_s: number; version: string }[];
  const rtt: number[] = [];
  const rtt10: number[] = [];
  for (let i = 0; i < RUNS; i++) rtt.push(await timeMs(() => client.query("select 1")));
  for (let i = 0; i <= RUNS; i++) rtt10.push(await timeMs(() => Promise.all(Array.from({ length: 10 }, () => client.query("select 1")))));
  console.log(`\n${new Date().toISOString()} · Postgres ${boot.version.split(" ")[0]} · compute up ${Math.round(boot.uptime_s / 60)} min`);
  console.log(`first query ${firstMs.toFixed(0)} ms${boot.uptime_s < 60 ? " (compute just started: cold start)" : ""}`);
  console.log(`round-trip floor, select 1 ×1: ${stats(rtt)} ms · ×10 in parallel: ${stats(rtt10.slice(1))} ms (p50/p95/max)`);

  const [size] = (await client.query(`select
    (select count(*) from rfq_line_items)::int as line_items,
    (select count(*) from rfq_line_items where return_by_date >= (now() at time zone 'America/New_York')::date)::int as open_items,
    (select count(*) from approved_sources)::int as approved_sources,
    (select count(*) from rfq_changes)::int as changes,
    (select count(*) from posting_days)::int as posting_days,
    pg_size_pretty(pg_total_relation_size('rfq_line_items')) as line_items_size`)) as Record<string, unknown>[];
  console.log(`data: ${Object.entries(size).map(([k, v]) => `${k}=${v}`).join(" ")}`);

  // 2. App-level latency: the page awaits searchRfqs and getFacets together.
  console.log(`\nApp queries, ${RUNS} runs after 1 warm-up, ms p50/p95/max (HTTP queries per call in brackets)`);
  const rows: string[][] = [];
  for (const [name, qs] of SCENARIOS) {
    const f = filtersFor(qs);
    const { total } = await searchRfqs(f);
    const search = await measure(() => searchRfqs(f));
    const facets = await measure(() => getFacets(f));
    const page = await measure(() => Promise.all([searchRfqs(f), getFacets(f)]));
    rows.push([
      name,
      String(total),
      `${stats(search.samples)} [${search.perCall}]`,
      `${stats(facets.samples)} [${facets.perCall}]`,
      `${stats(page.samples)} [${page.perCall}]`,
    ]);
  }
  for (const [name, fn] of [
    ["getRfqDetail", () => getRfqDetail(DETAIL_ID)],
    ["getFreshness", () => getFreshness()],
  ] as const) {
    const m = await measure(fn);
    rows.push([name, "", "", "", `${stats(m.samples)} [${m.perCall}]`]);
  }
  table(["scenario", "matches", "searchRfqs", "getFacets", "page (both)"], rows);

  // 3. Database execution time for the main SQL shapes, captured from the real query functions.
  const [list, count] = await capture(() => searchRfqs(filtersFor("")));
  const [keyword, keywordCount] = await capture(() => searchRfqs(filtersFor("q=screw")));
  const [part, partCount] = await capture(() => searchRfqs(filtersFor("q=BACB30")));
  const [deep] = await capture(() => searchRfqs(filtersFor("page=50")));
  const [deepSources] = await capture(() => searchRfqs(filtersFor("sort=-sources&page=50")));
  const facetQueries = await capture(() => getFacets(filtersFor("")));
  const [detail] = await capture(() => getRfqDetail(DETAIL_ID));
  const shapes: [string, Captured | undefined][] = [
    ["list, default (page 1)", list],
    ["count, default", count],
    ["list, q=screw", keyword],
    ["count, q=screw", keywordCount],
    ["list, q=BACB30 (part #)", part],
    ["count, q=BACB30 (part #)", partCount],
    ["list, page=50 (offset 2450)", deep],
    ["list, sort=-sources, page=50", deepSources],
    ["facet: set-aside group-by", facetQueries.find((c) => c.query.startsWith('select "set_aside"'))],
    ["facet: fsc group-by + join", facetQueries.find((c) => c.query.includes('left join "fsc_classes"'))],
    ["detail: primary-key lookup", detail],
  ];
  console.log(`\nEXPLAIN (ANALYZE, BUFFERS), median of ${EXPLAIN_RUNS}: server-side time only, no network`);
  const explained: string[][] = [];
  for (const [name, shape] of shapes) {
    if (!shape) {
      explained.push([name, "-", "-", "-", "-", "query not captured (queries.ts changed?)"]);
      continue;
    }
    const e = await explain(shape);
    explained.push([name, e.planning.toFixed(2), e.execution.toFixed(2), String(e.rows), e.buffers, e.scans]);
  }
  // The page pays for every facet query, so their sum is the real per-view facet cost (run one at a time).
  const facets: Awaited<ReturnType<typeof explain>>[] = [];
  for (const q of facetQueries) facets.push(await explain(q));
  const sum = (k: "planning" | "execution") => facets.reduce((t, e) => t + e[k], 0).toFixed(2);
  const scanTypes = [...new Set(facets.flatMap((e) => e.scans.split("; ").filter((s) => s.includes("Scan"))))].join("; ");
  explained.push([`facets: all ${facets.length}, summed`, sum("planning"), sum("execution"), "-", "-", scanTypes]);
  table(["shape", "plan ms", "exec ms", "rows", "buffers", "scans"], explained);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
