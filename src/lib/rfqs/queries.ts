import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { approvedSources, fscClasses, postingDays, rfqChanges, rfqLineItems as r } from "@/db/schema";
import type { Filters } from "./filters";
import { addDays, todayEastern } from "./labels";

export const PAGE_SIZE = 50;

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

/** A token matches the line item's own text, or one of its NSN's approved part numbers / CAGE codes. */
function tokenCondition(token: { raw: string; text: string }) {
  return sql`(${r.searchText} like ${likePattern(token.text)} or exists (
    select 1 from ${approvedSources} a where a.nsn = ${r.nsn}
      and (lower(a.part_number) like ${likePattern(token.raw)} or a.cage = ${token.raw.toUpperCase()})
  ))`;
}

type Dimension = "closing" | "setAside" | "fsc" | "type" | "posted" | "office" | "amsc" | "inspection";

/** WHERE clause for `filters`, optionally leaving one dimension out (so its facet counts show alternatives). */
function conditions(f: Filters, today: string, omit?: Dimension): SQL | undefined {
  const c: (SQL | undefined)[] = [];
  if (!f.includeClosed) c.push(gte(r.returnByDate, today));
  if (f.closing && omit !== "closing") c.push(lte(r.returnByDate, addDays(today, f.closing)));
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

const ORDER = {
  closing: [asc(r.returnByDate), asc(r.solicitationNumber), asc(r.prNumber)],
  newest: [desc(r.postedDate), asc(r.returnByDate), asc(r.solicitationNumber)],
  qty: [desc(r.quantity), asc(r.returnByDate), asc(r.solicitationNumber)],
};

export type RfqRow = Awaited<ReturnType<typeof searchRfqs>>["rows"][number];

export async function searchRfqs(f: Filters) {
  const db = getDb();
  const today = todayEastern();
  const where = conditions(f, today);
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
        buyingOffice: r.buyingOffice,
        sourceCount: sql<number>`(select count(*) from ${approvedSources} a where a.nsn = ${r.nsn})::int`,
        extendedDays: sql<number | null>`(select max(c.new_value::date) - min(c.old_value::date) from ${rfqChanges} c
          where c.solicitation_number = ${r.solicitationNumber} and c.pr_number = ${r.prNumber} and c.field = 'returnByDate')`,
        matchedSource,
      })
      .from(r)
      .leftJoin(fscClasses, eq(fscClasses.code, r.fsc))
      .where(where)
      .orderBy(...ORDER[f.sort])
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(r).where(where),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type FacetOption = { value: string; count: number; name?: string | null };
export type Facets = Awaited<ReturnType<typeof getFacets>>;

/** Counts for each filter's options, computed against every *other* active filter. */
export async function getFacets(f: Filters) {
  const db = getDb();
  const today = todayEastern();
  const groupCount = async (column: SQL | AnyPgColumn, dimension: Dimension): Promise<FacetOption[]> => {
    const rows = await db
      .select({ value: sql<string | null>`${column}`, count: sql<number>`count(*)::int` })
      .from(r)
      .where(conditions(f, today, dimension))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`);
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
      .orderBy(sql`3 desc`),
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

/** What's loaded and how fresh it is. */
export async function getFreshness() {
  const days = await getDb().select().from(postingDays).orderBy(desc(postingDays.postDate));
  return {
    days: days.map((d) => d.postDate),
    latest: days[0]?.postDate ?? null,
    earliest: days.at(-1)?.postDate ?? null,
    ingestedAt: days.reduce<Date | null>((max, d) => (!max || d.ingestedAt > max ? d.ingestedAt : max), null),
  };
}

export type RfqDetail = NonNullable<Awaited<ReturnType<typeof getRfqDetail>>>;

export async function getRfqDetail(id: string) {
  const [solicitationNumber, prNumber] = id.split("~");
  if (!solicitationNumber || !prNumber) return null;
  const db = getDb();
  const [item] = await db
    .select({ row: r, fscName: fscClasses.name })
    .from(r)
    .leftJoin(fscClasses, eq(fscClasses.code, r.fsc))
    .where(and(eq(r.solicitationNumber, solicitationNumber), eq(r.prNumber, prNumber)));
  if (!item) return null;

  const today = todayEastern();
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
