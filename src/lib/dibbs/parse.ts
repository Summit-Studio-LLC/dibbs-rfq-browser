/**
 * Parsers for the DIBBS daily RFQ files. Layouts:
 *  - "in" index: fixed-width, documented at /Rfq/RfqFileDefs.aspx
 *  - "bq" batch quote + "as" approved sources: quoted CSV, documented at
 *    /Refs/help/Quoting/Batch/BatchFormat.aspx (columns below are 1-based in those docs)
 */

export type LineKey = string;
export const lineKey = (solicitationNumber: string, prNumber: string): LineKey => `${solicitationNumber}|${prNumber}`;

export type IndexRow = {
  solicitationNumber: string;
  prNumber: string;
  nsn: string;
  itemType: string;
  fsc: string | null;
  niin: string | null;
  nomenclature: string;
  quantity: number;
  unitOfIssue: string;
  returnByDate: string;
  setAside: string;
  setAsidePct: number | null;
  amsc: string | null;
  buyerCode: string | null;
  buyingOffice: string;
  documentFile: string | null;
};

export type BatchQuoteFields = {
  lineNumber: string | null;
  solicitationType: string;
  requiredDeliveryDays: number | null;
  fobPoint: string | null;
  inspectionPoint: string | null;
};

export type ApprovedSource = { nsn: string; cage: string; partNumber: string };

/** MM/DD/YY → YYYY-MM-DD */
const isoFromShortDate = (s: string) => `20${s.slice(6, 8)}-${s.slice(0, 2)}-${s.slice(3, 5)}`;

const toIntOrNull = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);

/** One 140-character line per RFQ line item. Duplicate keys keep the last line. */
export function parseIndexFile(text: string): IndexRow[] {
  const rows = new Map<LineKey, IndexRow>();
  for (const line of text.split(/\r?\n/)) {
    if (line.length < 140) continue;
    const field = (start: number, length: number) => line.slice(start, start + length).trim();
    const solicitationNumber = field(0, 13);
    const prNumber = field(59, 13);
    const nsn = field(13, 46);
    const itemType = field(135, 1);
    const isNsn = itemType === "1" && /^\d{13}$/.test(nsn);
    rows.set(lineKey(solicitationNumber, prNumber), {
      solicitationNumber,
      prNumber,
      nsn,
      itemType,
      fsc: isNsn ? nsn.slice(0, 4) : null,
      niin: isNsn ? nsn.slice(4) : null,
      returnByDate: isoFromShortDate(field(72, 8)),
      documentFile: field(80, 19) || null,
      quantity: Number(field(99, 7)),
      unitOfIssue: field(106, 2),
      nomenclature: field(108, 21),
      buyerCode: field(129, 5) || null,
      amsc: field(134, 1) || null,
      setAside: field(136, 1) || "N",
      setAsidePct: toIntOrNull(field(137, 3)),
      buyingOffice: solicitationNumber.slice(0, 5),
    });
  }
  return [...rows.values()];
}

/**
 * DIBBS quotes every field and never escapes, so split on `","` rather than
 * using a strict CSV parser (a few part numbers contain stray quotes).
 */
function splitQuotedLine(line: string): string[] {
  return line.replace(/^"/, "").replace(/"\s*$/, "").split('","');
}

/** Requirement fields from the batch-quote file, keyed by line item (first row per key wins). */
export function parseBatchQuoteFile(text: string): Map<LineKey, BatchQuoteFields> {
  const out = new Map<LineKey, BatchQuoteFields>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = splitQuotedLine(line);
    const key = lineKey(c[0], c[45]);
    if (out.has(key)) continue;
    out.set(key, {
      solicitationType: c[1] || "M", // F fast auto-eval, P auto-eval, I AIDC; blank = manual
      fobPoint: c[31] || null,
      inspectionPoint: c[35] || null,
      lineNumber: c[43] || null,
      requiredDeliveryDays: toIntOrNull(c[50]),
    });
  }
  return out;
}

/** "as" file: NSN, approved CAGE, part number, company name (always blank in practice). */
export function parseApprovedSources(text: string): ApprovedSource[] {
  const out = new Map<string, ApprovedSource>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [nsn, cage, partNumber] = splitQuotedLine(line).map((s) => s.trim());
    if (!nsn || !cage || !partNumber) continue;
    out.set(`${nsn}|${cage}|${partNumber}`, { nsn, cage, partNumber });
  }
  return [...out.values()];
}
