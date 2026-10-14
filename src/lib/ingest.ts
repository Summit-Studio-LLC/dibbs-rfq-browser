import { getTableColumns, inArray, sql } from "drizzle-orm";
import fscNames from "@/data/fsc-classes.json";
import { getDb } from "@/db";
import { approvedSources, fscClasses, postingDays, rfqChanges, rfqLineItems } from "@/db/schema";
import { fetchBatchQuoteFiles, fetchIndexFile, listPostingDays, type PostingDay } from "@/lib/dibbs/files";
import { lineKey, parseApprovedSources, parseBatchQuoteFile, parseIndexFile } from "@/lib/dibbs/parse";
import { DibbsSession } from "@/lib/dibbs/session";

type NewLineItem = typeof rfqLineItems.$inferInsert;

/** Fields whose changes on a re-post are recorded in rfq_changes. */
const TRACKED_FIELDS = [
  "returnByDate",
  "quantity",
  "nomenclature",
  "setAside",
  "solicitationType",
  "requiredDeliveryDays",
  "fobPoint",
  "inspectionPoint",
  "buyerCode",
] as const satisfies (keyof NewLineItem)[];

const CHUNK = 500;
const chunks = <T>(items: T[], size = CHUNK) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const isWeekday = (isoDate: string) => ![0, 6].includes(new Date(`${isoDate}T12:00:00Z`).getUTCDay());

/**
 * On conflict, take every incoming column except the key, first-posted date, generated search text,
 * and the approved-source search copies (refreshSourceSearch owns those).
 */
const upsertSet = (() => {
  const keep = new Set(["solicitationNumber", "prNumber", "postedDate", "searchText", "sourceParts", "sourceCages"]);
  const set: Record<string, unknown> = {};
  for (const [prop, column] of Object.entries(getTableColumns(rfqLineItems))) {
    if (!keep.has(prop)) set[prop] = sql.raw(`excluded."${column.name}"`);
  }
  set.postedDate = sql`least(${rfqLineItems.postedDate}, excluded.posted_date)`;
  set.updatedAt = sql`now()`;
  return set;
})();

export type DayResult = { postDate: string; lineItems: number; approvedSources: number; changes: number };

/** Download, parse and upsert one posting day. Days must be ingested oldest → newest for change tracking. */
export async function ingestPostingDay(session: DibbsSession, day: PostingDay): Promise<DayResult> {
  const db = getDb();
  const indexText = await fetchIndexFile(session, day.code);
  const bqFiles = await fetchBatchQuoteFiles(session, day.code);
  const bq = parseBatchQuoteFile(bqFiles[`bq${day.code}.txt`] ?? "");
  const sources = parseApprovedSources(bqFiles[`as${day.code}.txt`] ?? "");

  const items: NewLineItem[] = parseIndexFile(indexText).map((row) => ({
    ...row,
    solicitationType: null,
    requiredDeliveryDays: null,
    fobPoint: null,
    inspectionPoint: null,
    lineNumber: null,
    ...bq.get(lineKey(row.solicitationNumber, row.prNumber)),
    postedDate: day.postDate,
    lastSeenDate: day.postDate,
  }));

  // Record field changes for line items we already have from an earlier posting day.
  const existing = new Map<string, NewLineItem>();
  for (const batch of chunks([...new Set(items.map((i) => i.solicitationNumber))], 2000)) {
    for (const row of await db.select().from(rfqLineItems).where(inArray(rfqLineItems.solicitationNumber, batch))) {
      existing.set(lineKey(row.solicitationNumber, row.prNumber), row);
    }
  }
  const changes: (typeof rfqChanges.$inferInsert)[] = [];
  for (const item of items) {
    const prev = existing.get(lineKey(item.solicitationNumber, item.prNumber));
    if (!prev || prev.lastSeenDate >= day.postDate) continue;
    for (const field of TRACKED_FIELDS) {
      const [before, after] = [prev[field] ?? null, item[field] ?? null].map((v) => (v === null ? null : String(v)));
      if (before !== after) {
        changes.push({ solicitationNumber: item.solicitationNumber, prNumber: item.prNumber, field, oldValue: before, newValue: after, seenDate: day.postDate });
      }
    }
  }

  for (const batch of chunks(items)) {
    await db
      .insert(rfqLineItems)
      .values(batch)
      .onConflictDoUpdate({ target: [rfqLineItems.solicitationNumber, rfqLineItems.prNumber], set: upsertSet });
  }
  for (const batch of chunks(sources)) await db.insert(approvedSources).values(batch).onConflictDoNothing();
  for (const batch of chunks(changes)) await db.insert(rfqChanges).values(batch);
  // Every NSN this day touched: its line items, and any source rows (which can belong to older line items).
  await refreshSourceSearch([...new Set([...items.map((i) => i.nsn), ...sources.map((s) => s.nsn)])]);
  // Written last: its ingested_at is the data version the page caches key on (see queries.ts).
  await db
    .insert(postingDays)
    .values({ code: day.code, postDate: day.postDate, lineItems: items.length, approvedSources: sources.length })
    .onConflictDoUpdate({
      target: postingDays.code,
      set: { lineItems: items.length, approvedSources: sources.length, ingestedAt: sql`now()` },
    });

  return { postDate: day.postDate, lineItems: items.length, approvedSources: sources.length, changes: changes.length };
}

/**
 * Copy each NSN's approved part numbers and CAGE codes onto its line items (`source_parts`, `source_cages`),
 * so search matches them through indexes on rfq_line_items. Sources are shared by NSN and can arrive with a
 * later posting day than the line item, so this rewrites every line item with one of `nsns`, old or new.
 * Without `nsns` it rewrites every line item (backfill). Only rows whose copy actually changed are updated.
 */
export async function refreshSourceSearch(nsns?: string[]) {
  const db = getDb();
  const refresh = (only?: string[]) =>
    db.execute(sql`
      update ${rfqLineItems} set source_parts = s.parts, source_cages = s.cages
      from (
        select n.nsn,
          string_agg(distinct lower(a.part_number), ' ') as parts,
          array_agg(distinct a.cage) filter (where a.cage is not null) as cages
        from (select distinct nsn from ${rfqLineItems} ${only ? sql`where ${inArray(rfqLineItems.nsn, only)}` : sql``}) n
        left join ${approvedSources} a on a.nsn = n.nsn
        group by n.nsn
      ) s
      where ${rfqLineItems.nsn} = s.nsn
        and (${rfqLineItems.sourceParts} is distinct from s.parts or ${rfqLineItems.sourceCages} is distinct from s.cages)`);
  if (!nsns) {
    await refresh();
    return;
  }
  for (const batch of chunks(nsns, 2000)) await refresh(batch);
}

/**
 * Ingest every posting day inside the window of the last `weekdays` weekday posting days
 * (weekend stragglers in between come along). Already-loaded days are skipped unless `force`.
 * With `budgetMs`, no new day is started once that much time has passed; the days left are
 * returned as `pending` and the next run picks them up (still oldest first).
 */
export async function ingestRecent({ weekdays = 3, force = false, budgetMs = Infinity } = {}) {
  const started = performance.now();
  const db = getDb();
  const session = new DibbsSession();
  const days = await listPostingDays(session); // newest first
  const cutoff = days.filter((d) => isWeekday(d.postDate))[weekdays - 1]?.postDate ?? days.at(-1)?.postDate;
  const window = days.filter((d) => cutoff && d.postDate >= cutoff).reverse(); // oldest first

  const loaded = new Set((await db.select({ code: postingDays.code }).from(postingDays)).map((r) => r.code));
  await db
    .insert(fscClasses)
    .values(Object.entries(fscNames).map(([code, name]) => ({ code, name })))
    .onConflictDoUpdate({ target: fscClasses.code, set: { name: sql`excluded.name` } });

  const todo = window.filter((day) => force || !loaded.has(day.code));
  const results: DayResult[] = [];
  for (const day of todo) {
    if (performance.now() - started > budgetMs) break;
    results.push(await ingestPostingDay(session, day));
  }
  return {
    window: window.map((d) => d.postDate),
    results,
    pending: todo.slice(results.length).map((d) => d.postDate),
  };
}
