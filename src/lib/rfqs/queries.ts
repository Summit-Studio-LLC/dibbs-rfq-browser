import "server-only";
import { and, asc, desc, eq, getTableColumns, gte, inArray, lte, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { getDb } from "@/db";
import { approvedSources, fscClasses, postingDays, rfqChanges, rfqLineItems as r } from "@/db/schema";
import { DEFAULT_FILTERS, type Filters, type SortKey } from "./filters";
import { addDays, todayEastern } from "./labels";

/** Search input → tokens. NSN-looking tokens lose their dashes so 5305-00-123-4567 matches 5305001234567. */
function searchTokens(q: string) {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 6)
    .map((raw) => ({ raw, text: /^\d[\d-]*$/.test(raw) ? raw.replace(/-/g, "") : raw }));
}

const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * A token matches the line item's own text, or one of its NSN's approved part numbers / CAGE codes.
 * The part numbers and CAGE codes are the line item's copies of approved_sources (kept by ingest), so all
 * three arms have an index on rfq_line_items and Postgres can answer the OR with one BitmapOr.
 * Tokens never contain whitespace, so a match in the space-separated part list lies within one part number.
 */
function tokenCondition(token: { raw: string; text: string }) {
  return sql`(${r.searchText} like ${likePattern(token.text)} or ${r.sourceParts} like ${likePattern(token.raw)} or ${r.sourceCages} @> array[${token.raw.toUpperCase()}::text])`;
}

type Dimension = "closing" | "setAside" | "fsc" | "type" | "posted" | "office" | "amsc" | "inspection";

/** WHERE clause for `filters`, optionally leaving one dimension out (so its facet counts show alternatives). */
function conditions(f: Filters, today: string, omit?: Dimension): SQL | undefined {
  const c: (SQL | undefined)[] = [];
  if (!f.includeClosed) c.push(gte(r.returnByDate, today));
  if (f.closing && omit !== "closing") c.push(lte(r.returnByDate, addDays(today, f.closing)));
  if (f.closesFrom && omit !== "closing") c.push(gte(r.returnByDate, f.closesFrom));
  if (f.closesTo && omit !== "closing") c.push(lte(r.returnByDate, f.closesTo));
  if (f.setAside.length && omit !== "setAside") c.push(inArray(r.setAside, f.setAside));
  if (f.fsc.length && omit !== "fsc") c.push(inArray(r.fsc, f.fsc));
  if (f.type.length && omit !== "type") c.push(inArray(r.solicitationType, f.type));
  if (f.posted.length && omit !== "posted") c.push(inArray(r.postedDate, f.posted));
  if (f.office.length && omit !== "office") c.push(inArray(r.buyingOffice, f.office));
  if (f.amsc.length && omit !== "amsc") c.push(inArray(r.amsc, f.amsc));
  if (f.inspection && omit !== "inspection") c.push(eq(r.inspectionPoint, f.inspection));
  if (f.qtyMin !== null) c.push(gte(r.quantity, f.qtyMin));
  if (f.qtyMax !== null) c.push(lte(r.quantity, f.qtyMax));
  if (f.deliveryMax !== null) c.push(lte(r.requiredDeliveryDays, f.deliveryMax));
  if (f.hasSources) c.push(sql`exists (select 1 from ${approvedSources} a where a.nsn = ${r.nsn})`);
  for (const token of searchTokens(f.q)) c.push(tokenCondition(token));
  return and(...c);
}

const sourceCount = sql<number>`(select count(*) from ${approvedSources} a where a.nsn = ${r.nsn})::int`;

/** What each sort key orders by. Set-aside puts restricted (small business etc.) before unrestricted. */
const SORT_EXPRESSIONS: Record<SortKey, (SQL | AnyPgColumn)[]> = {
  closes: [r.returnByDate],
  posted: [r.postedDate],
  qty: [r.quantity],
  item: [r.nomenclature],
  solicitation: [r.solicitationNumber],
  nsn: [r.nsn],
  fsc: [r.fsc],
  setAside: [sql`(${r.setAside} = 'N')`, r.setAside],
  type: [r.solicitationType],
  sources: [sourceCount],
  amsc: [r.amsc],
  delivery: [r.requiredDeliveryDays],
  inspection: [r.inspectionPoint],
  office: [r.buyingOffice],
  pr: [r.prNumber],
};

/** ORDER BY for the requested sort levels (nulls always last), with a stable tiebreak. */
function orderBy(f: Filters) {
  return [
    ...f.sort.flatMap((s) => SORT_EXPRESSIONS[s.key].map((e) => (s.desc ? sql`${e} desc nulls last` : sql`${e} asc nulls last`))),
    asc(r.solicitationNumber),
    asc(r.prNumber),
  ];
}

function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k as K))) as Omit<T, K>;
}

/* ---------------------------------------------------------------------------------------------
 * Uncached queries. The page goes through the cached versions at the bottom of this file;
 * scripts (benchmarks, checks) call these directly, because "use cache" only exists inside Next.
 * ------------------------------------------------------------------------------------------- */

export type RfqRow = Awaited<ReturnType<typeof searchRfqsUncached>>["rows"][number];

export async function searchRfqsUncached(f: Filters, today = todayEastern()) {
  const db = getDb();
  const where = conditions(f, today);
  const order = orderBy(f);
  const tokens = searchTokens(f.q);

  // When a token only matched via approved sources, say which part # it hit.
  const matchedSource = tokens.length
    ? sql<string | null>`(select a.part_number || ' · CAGE ' || a.cage from ${approvedSources} a where a.nsn = ${r.nsn} and (${sql.join(
        tokens.map(
          (t) =>
            sql`(${r.searchText} not like ${likePattern(t.text)} and (lower(a.part_number) like ${likePattern(t.raw)} or a.cage = ${t.raw.toUpperCase()}))`,
        ),
        sql` or `,
      )}) limit 1)`
    : sql<null>`null`;

  // Keys first: the ordered, offset scan reads only the primary key (plus whatever ORDER BY needs), so the
  // per-row subqueries below run for this page's rows, not for every row OFFSET skips. The outer query sorts
  // those rows by the same ORDER BY, which ends in the primary key, so the order is exactly the same.
  const page = db
    .select({ solicitationNumber: r.solicitationNumber, prNumber: r.prNumber })
    .from(r)
    .where(where)
    .orderBy(...order)
    .limit(f.size)
    .offset((f.page - 1) * f.size)
    .as("page");

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        solicitationNumber: r.solicitationNumber,
        prNumber: r.prNumber,
        nsn: r.nsn,
        fsc: r.fsc,
        fscName: fscClasses.name,
        nomenclature: r.nomenclature,
        quantity: r.quantity,
        unitOfIssue: r.unitOfIssue,
        postedDate: r.postedDate,
        returnByDate: r.returnByDate,
        setAside: r.setAside,
        amsc: r.amsc,
        solicitationType: r.solicitationType,
        requiredDeliveryDays: r.requiredDeliveryDays,
        fobPoint: r.fobPoint,
        inspectionPoint: r.inspectionPoint,
        buyingOffice: r.buyingOffice,
        sourceCount,
        extendedDays: sql<number | null>`(select max(c.new_value::date) - min(c.old_value::date) from ${rfqChanges} c
          where c.solicitation_number = ${r.solicitationNumber} and c.pr_number = ${r.prNumber} and c.field = 'returnByDate')`,
        matchedSource,
      })
      .from(page)
      .innerJoin(r, and(eq(r.solicitationNumber, page.solicitationNumber), eq(r.prNumber, page.prNumber)))
      .leftJoin(fscClasses, eq(fscClasses.code, r.fsc))
      .orderBy(...order),
    db.select({ total: sql<number>`count(*)::int` }).from(r).where(where),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / f.size)) };
}

export type FacetOption = { value: string; count: number; name?: string | null };
export type Facets = Awaited<ReturnType<typeof getFacetsUncached>>;

export async function getFacetsUncached(f: Filters, today = todayEastern()) {
  const db = getDb();
  const groupCount = async (column: SQL | AnyPgColumn, dimension: Dimension): Promise<FacetOption[]> => {
    const rows = await db
      .select({ value: sql<string | null>`${column}`, count: sql<number>`count(*)::int` })
      .from(r)
      .where(conditions(f, today, dimension))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`, sql`1`); // ties by value, so equal counts list in the same order on every plan
    return rows.filter((row): row is FacetOption => row.value !== null);
  };

  const [setAside, type, office, amsc, inspection, posted, fsc, closing] = await Promise.all([
    groupCount(r.setAside, "setAside"),
    groupCount(r.solicitationType, "type"),
    groupCount(r.buyingOffice, "office"),
    groupCount(r.amsc, "amsc"),
    groupCount(r.inspectionPoint, "inspection"),
    groupCount(sql`${r.postedDate}::text`, "posted"),
    db
      .select({ value: sql<string>`${r.fsc}`, name: fscClasses.name, count: sql<number>`count(*)::int` })
      .from(r)
      .leftJoin(fscClasses, eq(fscClasses.code, r.fsc))
      .where(and(conditions(f, today, "fsc"), sql`${r.fsc} is not null`))
      .groupBy(r.fsc, fscClasses.name)
      .orderBy(sql`3 desc`, sql`1`),
    db
      .select({
        any: sql<number>`count(*)::int`,
        ...Object.fromEntries(
          [3, 7, 14].map((n) => [`d${n}`, sql<number>`(count(*) filter (where ${lte(r.returnByDate, addDays(today, n))}))::int`]),
        ),
      })
      .from(r)
      .where(conditions(f, today, "closing")),
  ]);
  return { setAside, type, office, amsc, inspection, posted, fsc, closing: closing[0] as Record<string, number> };
}

export type RfqDetail = NonNullable<Awaited<ReturnType<typeof getRfqDetailUncached>>>;

/** Every line-item column except the search-only copies of approved sources (the panel lists `sources`). */
const detailColumns = omit(getTableColumns(r), "sourceParts", "sourceCages");

export async function getRfqDetailUncached(id: string, today = todayEastern()) {
  const [solicitationNumber, prNumber] = id.split("~");
  if (!solicitationNumber || !prNumber) return null;
  const db = getDb();
  const [item] = await db
    .select({ row: detailColumns, fscName: fscClasses.name })
    .from(r)
    .leftJoin(fscClasses, eq(fscClasses.code, r.fsc))
    .where(and(eq(r.solicitationNumber, solicitationNumber), eq(r.prNumber, prNumber)));
  if (!item) return null;

  const [sources, changes, siblings, sameNsn] = await Promise.all([
    db.select().from(approvedSources).where(eq(approvedSources.nsn, item.row.nsn)).orderBy(asc(approvedSources.cage)),
    db
      .select()
      .from(rfqChanges)
      .where(and(eq(rfqChanges.solicitationNumber, solicitationNumber), eq(rfqChanges.prNumber, prNumber)))
      .orderBy(asc(rfqChanges.seenDate)),
    db
      .select({ prNumber: r.prNumber, nsn: r.nsn, nomenclature: r.nomenclature, quantity: r.quantity, unitOfIssue: r.unitOfIssue })
      .from(r)
      .where(and(eq(r.solicitationNumber, solicitationNumber), sql`${r.prNumber} <> ${prNumber}`))
      .orderBy(asc(r.prNumber)),
    db
      .select({
        solicitationNumber: r.solicitationNumber,
        prNumber: r.prNumber,
        quantity: r.quantity,
        unitOfIssue: r.unitOfIssue,
        returnByDate: r.returnByDate,
      })
      .from(r)
      .where(and(eq(r.nsn, item.row.nsn), sql`${r.solicitationNumber} <> ${solicitationNumber}`, gte(r.returnByDate, today)))
      .orderBy(asc(r.returnByDate))
      .limit(10),
  ]);
  return { ...item.row, fscName: item.fscName, sources, changes, siblings, sameNsn };
}

/* ---------------------------------------------------------------------------------------------
 * Cached queries, used by the page. The data only changes when an ingest runs, so results are
 * cached until then.
 * ------------------------------------------------------------------------------------------- */

/** Tag on every cached query below. The ingest cron revalidates it after loading data. */
export const RFQ_DATA_TAG = "rfq-data";

/** Loaded posting days, newest first: one small query per request, shared by getFreshness and the cache keys. */
const loadedDays = cache(async () => getDb().select().from(postingDays).orderBy(desc(postingDays.postDate)));

/**
 * What a cached result depends on besides its own arguments, so it's part of every cache key.
 * - `today` (Eastern): "open" means return-by ≥ today, so results change at midnight even when the data doesn't.
 *   It's read here, at request time, and passed in: a date read inside "use cache" would be frozen into the entry.
 * - `version`: changes whenever an ingest writes a posting day, from the cron or a local `pnpm ingest`.
 *   The cron also revalidates RFQ_DATA_TAG, but "use cache" entries live in each server instance's memory;
 *   with the version in the key, no instance can serve a result computed from older data, whether or not
 *   the tag invalidation reached it.
 */
type DataStamp = { today: string; version: string };

async function dataStamp(): Promise<DataStamp> {
  const days = await loadedDays();
  const lastIngest = Math.max(0, ...days.map((d) => d.ingestedAt.getTime()));
  return { today: todayEastern(), version: `${days.length}@${lastIngest}` };
}

async function searchRfqsCached(f: Filters, stamp: DataStamp) {
  "use cache";
  cacheLife("hours"); // a backstop only: the stamp in the key is what keeps entries current
  cacheTag(RFQ_DATA_TAG);
  return searchRfqsUncached(f, stamp.today);
}

async function getFacetsCached(f: Filters, stamp: DataStamp) {
  "use cache";
  cacheLife("hours");
  cacheTag(RFQ_DATA_TAG);
  return getFacetsUncached(f, stamp.today);
}

async function getRfqDetailCached(id: string, stamp: DataStamp) {
  "use cache";
  cacheLife("hours");
  cacheTag(RFQ_DATA_TAG);
  return getRfqDetailUncached(id, stamp.today);
}

/** One page of RFQ line items matching `f`, plus the total count. */
export async function searchRfqs(f: Filters) {
  return searchRfqsCached({ ...f, id: null }, await dataStamp()); // the selected row doesn't change the results
}

/** Counts for each filter's options, computed against every *other* active filter. */
export async function getFacets(f: Filters) {
  // Sort, paging and selection don't change the counts, so all pages and sorts of a view share one entry.
  const key: Filters = { ...f, sort: DEFAULT_FILTERS.sort, page: 1, size: DEFAULT_FILTERS.size, id: null };
  return getFacetsCached(key, await dataStamp());
}

export async function getRfqDetail(id: string) {
  return getRfqDetailCached(id, await dataStamp());
}

/**
 * What's loaded and how fresh it is. Deliberately not "use cache": this is the per-request
 * version check behind every cache key above, and it's a single small query.
 */
export async function getFreshness() {
  const days = await loadedDays();
  return {
    days: days.map((d) => d.postDate),
    latest: days[0]?.postDate ?? null,
    earliest: days.at(-1)?.postDate ?? null,
    ingestedAt: days.reduce<Date | null>((max, d) => (!max || d.ingestedAt > max ? d.ingestedAt : max), null),
  };
}
