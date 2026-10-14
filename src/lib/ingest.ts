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

/** On conflict, take every incoming column except the key, first-posted date and generated search text. */
const upsertSet = (() => {
  const keep = new Set(["solicitationNumber", "prNumber", "postedDate", "searchText"]);
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
 * Ingest every posting day inside the window of the last `weekdays` weekday posting days
 * (weekend stragglers in between come along). Already-loaded days are skipped unless `force`.
 */
export async function ingestRecent({ weekdays = 3, force = false } = {}) {
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

  const results: DayResult[] = [];
  for (const day of window) {
    if (!force && loaded.has(day.code)) continue;
    results.push(await ingestPostingDay(session, day));
  }
  return { window: window.map((d) => d.postDate), results };
}
