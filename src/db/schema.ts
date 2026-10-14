import { sql } from "drizzle-orm";
import { char, date, index, integer, pgTable, primaryKey, serial, smallint, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per RFQ line item: a solicitation can have several, each with its own
 * PR #, NSN and quantity. Columns hold DIBBS codes; the app maps them to labels.
 */
export const rfqLineItems = pgTable(
  "rfq_line_items",
  {
    solicitationNumber: text("solicitation_number").notNull(),
    prNumber: text("pr_number").notNull(),
    lineNumber: text("line_number"),
    nsn: text("nsn").notNull(), // 13-digit NSN, or a part number when itemType = '2'
    itemType: char("item_type", { length: 1 }).notNull(), // 1 = NSN, 2 = part number
    fsc: char("fsc", { length: 4 }), // NSN digits 1-4: Federal Supply Class
    niin: char("niin", { length: 9 }), // NSN digits 5-13
    nomenclature: text("nomenclature").notNull(),
    quantity: integer("quantity").notNull(),
    unitOfIssue: text("unit_of_issue").notNull(),
    postedDate: date("posted_date").notNull(), // first posting day we saw it
    lastSeenDate: date("last_seen_date").notNull(), // latest posting day it appeared in
    returnByDate: date("return_by_date").notNull(),
    setAside: char("set_aside", { length: 1 }).notNull(), // Y H R L A E N
    setAsidePct: smallint("set_aside_pct"),
    amsc: char("amsc", { length: 1 }),
    buyerCode: text("buyer_code"),
    buyingOffice: text("buying_office").notNull(), // solicitation prefix, e.g. SPE4A
    solicitationType: char("solicitation_type", { length: 1 }), // F fast, P auto, I AIDC, M manual
    requiredDeliveryDays: integer("required_delivery_days"),
    fobPoint: char("fob_point", { length: 1 }), // D destination, O origin
    inspectionPoint: char("inspection_point", { length: 1 }), // D destination, O origin
    documentFile: text("document_file"),
    searchText: text("search_text").generatedAlwaysAs(
      sql`lower(solicitation_number || ' ' || nsn || ' ' || nomenclature || ' ' || pr_number)`,
    ),
    // Search copies of this NSN's approved_sources, kept by ingest (refreshSourceSearch), so a search
    // token can match a part # or CAGE code through an index here instead of a subquery. Null = no sources.
    sourceParts: text("source_parts"), // distinct lower(part_number), space-separated
    sourceCages: text("source_cages").array(), // distinct CAGE codes
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.solicitationNumber, t.prNumber] }),
    index("rfq_search_trgm").using("gin", sql`${t.searchText} gin_trgm_ops`),
    index("rfq_source_parts_trgm").using("gin", sql`${t.sourceParts} gin_trgm_ops`),
    index("rfq_source_cages").using("gin", t.sourceCages),
    index("rfq_return_by").on(t.returnByDate),
    index("rfq_posted").on(t.postedDate),
    index("rfq_nsn").on(t.nsn),
    index("rfq_fsc").on(t.fsc),
  ],
);

/** The government's approved manufacturers for a part: NSN → (CAGE, part #). Shared by every RFQ for that NSN. */
export const approvedSources = pgTable(
  "approved_sources",
  {
    nsn: text("nsn").notNull(),
    cage: text("cage").notNull(),
    partNumber: text("part_number").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.nsn, t.cage, t.partNumber] }),
    index("approved_sources_cage").on(t.cage),
    index("approved_sources_part_trgm").using("gin", sql`lower(${t.partNumber}) gin_trgm_ops`),
  ],
);

/** Field-level history when a line item is re-posted with different values (mostly return-by extensions). */
export const rfqChanges = pgTable(
  "rfq_changes",
  {
    id: serial("id").primaryKey(),
    solicitationNumber: text("solicitation_number").notNull(),
    prNumber: text("pr_number").notNull(),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    seenDate: date("seen_date").notNull(),
  },
  (t) => [index("rfq_changes_item").on(t.solicitationNumber, t.prNumber)],
);

/** One row per DIBBS posting day loaded; makes ingest idempotent and drives "data as of". */
export const postingDays = pgTable("posting_days", {
  code: char("code", { length: 6 }).primaryKey(), // yymmdd, as in in261013.txt
  postDate: date("post_date").notNull(),
  lineItems: integer("line_items").notNull(),
  approvedSources: integer("approved_sources").notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Federal Supply Class names, as listed on DIBBS "RFQs by FSC". */
export const fscClasses = pgTable("fsc_classes", {
  code: char("code", { length: 4 }).primaryKey(),
  name: text("name").notNull(),
});
