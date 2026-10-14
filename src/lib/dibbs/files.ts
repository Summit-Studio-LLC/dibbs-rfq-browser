import { unzipSync } from "fflate";
import type { DibbsSession } from "./session";

export const DIBBS_WWW = "https://www.dibbs.bsm.dla.mil";
export const DIBBS_ARCHIVE = "https://dibbs2.bsm.dla.mil/Downloads/RFQ/Archive";

/** A DIBBS posting day. Files are named by `yymmdd`, e.g. in261013.txt. */
export type PostingDay = { code: string; postDate: string };

/** Posting days listed on the "Recent RFQs" page, newest first. */
export async function listPostingDays(session: DibbsSession): Promise<PostingDay[]> {
  const html = (await session.get(`${DIBBS_WWW}/Rfq/RfqDates.aspx?category=recent`)).toString("latin1");
  const codes = new Set([...html.matchAll(/\bin(\d{6})\.txt/gi)].map((m) => m[1]));
  return [...codes]
    .sort()
    .reverse()
    .map((code) => ({ code, postDate: `20${code.slice(0, 2)}-${code.slice(2, 4)}-${code.slice(4, 6)}` }));
}

/** The fixed-width "in" index file: one line per RFQ posted that day. */
export async function fetchIndexFile(session: DibbsSession, code: string): Promise<string> {
  return (await session.get(`${DIBBS_ARCHIVE}/in${code}.txt`)).toString("latin1");
}

/** The "bq" batch-quote zip: bq{code}.txt (RFQ line items) and as{code}.txt (approved sources). */
export async function fetchBatchQuoteFiles(session: DibbsSession, code: string): Promise<Record<string, string>> {
  const zip = await session.get(`${DIBBS_ARCHIVE}/bq${code}.zip`);
  const entries = unzipSync(new Uint8Array(zip));
  return Object.fromEntries(
    Object.entries(entries).map(([name, data]) => [name.toLowerCase(), Buffer.from(data).toString("latin1")]),
  );
}
