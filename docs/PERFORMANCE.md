# Database performance

Measured 2026-10-14 against production data: Postgres 18.6 on Neon (AWS us-east-1, next to Vercel iad1),
reached through the `neon-http` driver, so **every query is one HTTPS request**.
Rerun the database numbers with:

```sh
npx dotenv -e .env.local -- npx tsx --conditions=react-server scripts/bench-queries.ts   # optional: run count, default 15
```

**Data size:** 9,818 RFQ line items (9,786 open), 11,631 approved sources, 4 posting days.
`rfq_line_items` is 8.9 MB with indexes, so it sits entirely in memory: no plan read a single block from disk.

## 1. App latency from a laptop

These are the real query functions, warmed up once and then run 15 times. Values are p50 / p95 in ms, and
`[n]` is the number of HTTP queries per call. The laptop's floor is one network round trip: 30 ms for
`select 1`, or 34 ms for 10 sent in parallel.

| Scenario (URL params) | Matches | `searchRfqs` [2] | `getFacets` [8] | Page: both in parallel [10] |
|---|---:|---:|---:|---:|
| Default view | 9,786 | 34 / 35 | 57 / 67 | **61 / 99** |
| `q=screw` | 607 | 40 / 50 | 65 / 72 | **72 / 78** |
| `q=5305-00` (dashed NSN) | 133 | 42 / 46 | 66 / 84 | **74 / 78** |
| `q=BACB30` (approved part #) | 25 | 47 / 63 | 66 / 77 | **78 / 105** |
| `sa=Y&closing=7` | 556 | 36 / 41 | 51 / 85 | **51 / 73** |
| `fsc=5305,5310&type=F&sort=-qty,closes` | 979 | 38 / 40 | 45 / 48 | **49 / 51** |
| `page=50` | 9,786 | 50 / 57 | 60 / 90 | **78 / 82** |
| `closed=1&size=100` | 9,818 | 38 / 42 | 59 / 80 | **62 / 93** |
| `getRfqDetail` (31 sources) [5] | | | | 67 / 77 |

Reading it: every page costs about one round trip (30 to 35 ms) plus 15 to 45 ms of database work. The facet
queries set the pace. The detail panel needs two round trips in a row (look up the line item, then fetch 4
things in parallel), so it lands at about 2 × RTT.

## 2. What the database does (EXPLAIN ANALYZE, median of 5, server time only)

| Query shape | Exec ms | Plan |
|---|---:|---|
| List, default page 1 | 0.9 | Walks the `rfq_return_by` index in date order and stops after 50 rows |
| Count, default | 1.4 | Index-only scan on `rfq_return_by` |
| List, `q=screw` | 3.0 | Same date-ordered walk, filtering as it goes. The approved-part match uses the trigram index on `approved_sources`, hashed once |
| Count, `q=screw` | 2.8 | **Seq scan.** The `rfq_search_trgm` index is never used, because `search_text LIKE … OR EXISTS(approved part)` can't use it. On its own, `search_text LIKE '%screw%'` does use it: 0.5 ms |
| List, `q=BACB30` | 5.1 | A rare term, so the walk covers every open row before it finds 25 |
| **List, `page=50`** | **19.0** | **The slowest query.** `OFFSET 2450` computes the per-row subqueries (source count, extension days) for all 2,500 skipped rows: 13,900 buffer hits, against 555 for page 1 |
| Facet: set-aside / FSC + join | 3.1 / 6.2 | Seq scan plus hash aggregate |
| **All 8 facets, summed** | **28** | **The biggest cost per page view:** 8 full scans. Run in parallel they took 43 ms in total, because the small compute runs out of CPU |
| Detail: primary-key lookup | 0.05 | PK index scan |

At this size the seq scans are the right plan. The "open RFQs" filter keeps 99.7% of rows, and scanning
9.8k cached rows takes about 1.5 ms.

## 3. Production end to end (curl from a laptop, 10 runs, ms p50 / p95)

| URL | TTFB | Total |
|---|---:|---:|
| `/` | 115 / 190 | 229 / 314 |
| `/?q=screw` | 124 / 182 | 258 / 318 |
| `/?q=BACB30` | 127 / 150 | 242 / 261 |
| `/?sa=Y&closing=7` | 117 / 131 | 232 / 267 |
| `/?page=50` | 110 / 119 | 240 / 278 |
| `/?id=SPE4A727T0768~7018681797` | 112 / 136 | 243 / 276 |

- **TTFB** is the static shell from Partial Prerendering, which Vercel's CDN serves from cache
  (`x-vercel-cache: HIT`). About 65 ms of it is curl's TCP and TLS setup.
- **Total** includes the function filling in the dynamic part: the queries, the render, and streaming the
  HTML (about 250 KB raw, 14 KB compressed).
- The gap from shell to finished page is 110 to 135 ms. Since Vercel to Neon is about 1 ms per round trip,
  I estimate that **database time is roughly 30 ms of that gap** (mostly facet CPU). The rest is rendering
  and streaming.
- The deployed build is the last commit, which has single-key sort and no `size` param, so the multi-sort
  and 100-per-page scenarios were only measured locally.

## 4. Cold start

**I did not observe a cold start.** `pg_postmaster_start_time()` showed the compute running for the whole
session (40+ minutes), with about 17 other client sessions open. By default, Neon only scales to zero after
5 idle minutes, which never happened here.

What I did see is the **cold connection**. The first query in a new process takes 120 to 185 ms, against
30 ms warm, because it pays DNS, TCP and TLS to Neon's HTTP endpoint. On Vercel, a fresh function instance
pays the same handshake, but over about 1 ms of round trip. The first production request to each URL
(206 to 313 ms in total) was in line with warm requests.

To measure a real wake-up, leave everything idle for more than 5 minutes, then run the script. Its first
line prints compute uptime and flags a cold start when the compute started under 60 s earlier.

## 5. Scale headroom (estimate, not a load test)

Every query here is linear in the rows it scans, so 10× the scanned rows means about 10× the time. Two
different things grow:

- **Open RFQs**, which the default views scan. This set has a ceiling: DIBBS adds about 2.5k line items per
  posting day, and RFQs stay open about 8 days (p50; p99 is 15). So it levels off around 20 to 30k rows,
  2 to 3× today.
- **History**, which `closed=1` scans, along with anything that can't use the date index. It keeps growing:
  about 55k rows after 30 days and about 600k after a year.

What degrades first:

1. **Facets.** That's 8 scans per view, 28 ms of CPU today. Expect about 70 ms once the open set levels
   off, and about 300 ms at 10× rows. At 300 ms, one vCPU serves only about 3 uncached page views per
   second.
2. **Deep pages.** Cost grows with page depth times the subqueries per row. At 10× rows, page 500 would take
   about 200 ms.
3. **Search counts.** Today the `OR EXISTS` seq scan reads the whole table (2.8 ms). Once most rows are
   closed, the planner should switch to the `rfq_return_by` index for open views. But a `closed=1` search
   would still scan all history, about 150 ms after a year.
4. **The plain list and count stay fast.** They use the `rfq_return_by` index.

## Recommendations (in priority order)

1. **Cache facets and counts until the next ingest.** Data only changes when the ingest runs, so use
   `"use cache"` keyed on the filters plus today's date, with a `cacheTag` that the ingest invalidates
   (`revalidateTag`). That removes 8 scans per repeat view and is the biggest lever on both latency and
   throughput.
2. **Fetch the page's keys first.** Select the 50 keys with `LIMIT/OFFSET` first, then compute source counts
   and extensions only for those rows. In a simplified test, this made `page=50` about 3× faster. Better still, switch to
   keyset pagination (`WHERE (return_by_date, solicitation_number, pr_number) > (…)`) so depth costs nothing.
3. **Make search use one index.** At ingest, fold the approved part numbers and CAGE codes into the line
   item's search text, so one trigram GIN lookup answers the query (0.5 ms against 2.8 ms today, and it
   stays fast as rows grow). Alternatively, split the query into a `UNION` of two indexed lookups.
4. **Keep the hot set small as history grows.** Archive closed RFQs, or partition by return-by month. A
   partial index can't do this, because "today" moves. Add composite indexes such as `(fsc, return_by_date)`
   only once a filter actually becomes selective.
5. **Minor: one round trip for the detail panel**, by looking up by id inside each of the 4 queries. This
   only matters far from the database.
