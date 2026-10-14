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

## After: caching, keys-first paging, indexed search

Measured 2026-10-14, same data (9,818 line items). For a fair comparison, the old `queries.ts` and the new one were
benchmarked back to back (21:56 and 21:57 UTC) with the same script. The "before" numbers below come from that run,
and they match the baseline above to within noise.

What changed:

1. **Indexed search.** Each line item now carries a copy of its NSN's approved sources: `source_parts` (distinct
   lowercased part numbers, space-separated, trigram GIN) and `source_cages` (`text[]`, GIN). Ingest maintains
   both (`refreshSourceSearch`), and `scripts/backfill-source-search.ts` filled them once. A search token is now
   `search_text LIKE … OR source_parts LIKE … OR source_cages @> {TOKEN}`, three indexed arms on one table, so
   Postgres answers it with a single BitmapOr. Matches are unchanged: tokens never contain whitespace, so a
   `LIKE` hit in the space-separated list falls inside one part number, and a CAGE code needs an exact element
   match, as before.
2. **Keys first.** The ordered `LIMIT/OFFSET` scan selects only `(solicitation_number, pr_number)`. Source count,
   extension days and the matched part are then computed for the 50 rows of that page only. The outer query
   re-sorts by the same `ORDER BY`, which ends in the primary key, so the order is identical. Sorting by
   `sources` still needs the count inside the inner `ORDER BY`.
3. **Caching until the next ingest.** `searchRfqs`, `getFacets` and `getRfqDetail` are `"use cache"`
   (`cacheLife("hours")`, `cacheTag("rfq-data")`). The cache key holds the filters plus a stamp:
   today's Eastern date (read at request time, because "open" depends on it) and a data version (count and
   latest `ingested_at` of `posting_days`). Facets ignore sort, page and selection, so all pages of a view share
   one entry. On a hit, a page view costs **1 query** (the `posting_days` read behind the stamp and the
   "data as of" line) instead of 10.
4. **Ingest cron.** `GET /api/cron/ingest` loads the posting days that aren't loaded yet, then calls
   `revalidateTag("rfq-data", { expire: 0 })`. It runs at 12:00, 14:00, 17:00 and 21:00 UTC, Monday to Friday.

**Correctness check.** I snapshotted the full output of the query functions for 44 URL scenarios before and
after the change: search, paging to the last page, every sort including `-sources` and multi-sorts, filters,
`closed=1`, part numbers, CAGE codes, dashed NSNs, multi-token searches and escaping. I also snapshotted one
detail panel. Every search result and the detail are **byte-identical**: rows, order, totals, source counts and
matched parts. Facets have identical values and counts. The only change is that ties between equal counts now
have a fixed order (by value), where before it depended on the query plan.

### Database time (EXPLAIN ANALYZE, median of 5, ms)

| Query shape | Before | After | Plan after |
|---|---:|---:|---|
| Count, `q=screw` | 2.97 | **0.55** | BitmapOr of `rfq_search_trgm`, `rfq_source_parts_trgm` and `rfq_source_cages`. Before: seq scan |
| List, `q=BACB30` (part #) | 4.86 | **0.60** | Same bitmap scan. Before: walked every open row |
| Count, `q=BACB30` | 3.42 | **0.13** | Same bitmap scan |
| List, `page=50` (offset 2,450) | 17.71 (14,042 buffers) | **4.12** (925) | Subqueries run 50 times, not 2,500 |
| List, `sort=-sources`, page 50 | 41.85 (35,908) | 33.27 (31,459) | Still counts sources for all 9,786 rows to sort them (see below) |
| List, `q=screw` | 2.88 | 3.32 | Date-ordered walk, as before, plus 50 primary-key lookups |
| List / count, default | 0.84 / 1.34 | 0.79 / 1.36 | Unchanged |
| All 8 facets, summed | 29.60 | 29.76 | Unchanged per miss. On a cache hit they don't run at all |
| Detail | 0.05 | 0.05 | Unchanged |

Search probes, count query, old SQL against new (totals identical in every case):

| Search | Matches | Before | After |
|---|---:|---:|---:|
| `valve` | 530 | 2.87 | 0.46 |
| `5305-00` (dashed NSN) | 133 | 3.13 | 0.28 |
| `1560-00-978-0203` (full NSN) | 2 | 3.27 | 0.18 |
| `BACB30` (approved part #) | 25 | 3.37 | 0.14 |
| `1QJK4` (CAGE code) | 28 | 4.00 | 0.10 |
| `screw cap` | 273 | 3.09 | 0.43 |
| `o-ring` | 105 | 2.96 | 0.44 |
| `00` (unselective) | 7,833 | 7.05 | 3.68 (seq scan, the right plan) |

Rejected alternatives: `nsn IN (select … from approved_sources …)` gets the same hashed-subplan seq scan as
`EXISTS`. `nsn = any(array(select …))` does use the indexes, but it rechecks the array linearly and took 81 ms
for `00`. A `UNION` of two lookups was still planned as a hash join.

### App latency from a laptop, cache miss (p50 / p95 ms, page = both calls in parallel)

| Scenario | Before | After |
|---|---:|---:|
| Default view | 62 / 89 | 54 / 82 |
| `q=screw` | 75 / 104 | 46 / 105 |
| `q=5305-00` | 72 / 75 | 42 / 45 |
| `q=BACB30` | 79 / 86 | 41 / 74 |
| `sa=Y&closing=7` | 56 / 82 | 47 / 51 |
| `fsc=5305,5310&type=F&sort=-qty,closes` | 50 / 57 | 45 / 49 |
| `page=50` | 81 / 100 | 54 / 91 |
| `sort=-sources&page=50` | 104 / 109 | 79 / 87 |
| `closed=1&size=100` | 50 / 93 | 54 / 78 |

The floor is still about one round trip (31 ms), and p95 values are single-sample noise over the laptop link.
The benchmark calls the uncached functions, because `"use cache"` only runs inside Next. So these are
cache-miss costs. A hit skips all of them except the one `posting_days` query.

### Not measured yet, and what's left

- **The cache hit path.** It can only run inside Next, and this pass didn't run a build or the server. After
  deploying, re-run section 3. Repeat views should drop to roughly one `posting_days` round trip of database
  time. The default `"use cache"` store is in memory per function instance, so each instance warms its own
  copy. That's also why the data version is in the key: an instance that never received the tag invalidation
  still can't serve results from older data. `"use cache: remote"` (Vercel Runtime Cache, shared per region)
  is the next step if instance-local hit rates turn out low.
- **Sorting by sources** still needs every row's count before it can sort (33 ms). If it matters, store a
  `source_count` column alongside `source_parts`, maintained by the same refresh.
- **Facets on a miss** are unchanged: 8 scans, about 30 ms. Caching hides them for repeat views. The scale
  notes in section 5 still apply to the first view after each ingest.
- `rfq_line_items` grew from 8.9 MB to 15 MB with its indexes. About 3.4 MB of that is the two new GIN indexes
  (2.9 MB and 0.5 MB). The rest is space left behind by the one-time backfill, which rewrote 6,877 rows. It's
  harmless at this size, and a `REINDEX`/`VACUUM FULL` would reclaim it. The old `approved_sources_part_trgm`
  and `approved_sources_cage` indexes are no longer used by search and could be dropped.
