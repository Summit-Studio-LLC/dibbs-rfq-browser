/** Human labels for DIBBS codes. The database stores codes; the app owns the wording. */

export const SET_ASIDES: Record<string, string> = {
  N: "Unrestricted",
  Y: "Small Business",
  H: "HUBZone",
  R: "SDVOSB",
  L: "WOSB",
  E: "EDWOSB",
  A: "8(a)",
};

export const SET_ASIDE_DESCRIPTIONS: Record<string, string> = {
  N: "Unrestricted / not set aside",
  Y: "Small Business set-aside",
  H: "HUBZone set-aside",
  R: "Service-Disabled Veteran-Owned Small Business set-aside",
  L: "Woman-Owned Small Business set-aside",
  E: "Economically Disadvantaged Woman-Owned Small Business set-aside",
  A: "8(a) set-aside",
};

export const SOLICITATION_TYPES: Record<string, string> = {
  F: "Fast award",
  P: "Auto-evaluated",
  I: "AIDC",
  M: "Manual",
};

export const SOLICITATION_TYPE_DESCRIPTIONS: Record<string, string> = {
  F: "Fast auto-evaluation: quotes are scored automatically and can be awarded quickly",
  P: "Auto-evaluation: quotes are scored automatically",
  I: "Automated Indefinite Delivery Contract: a long-term contract with estimated quantities",
  M: "Evaluated manually by a buyer",
};

/** DLA buying activity, from the first five characters of the solicitation number. */
export const BUYING_OFFICES: Record<string, string> = {
  SPE4A: "DLA Aviation",
  SPE7M: "DLA Land & Maritime (Maritime)",
  SPE7L: "DLA Land & Maritime (Land)",
  SPE2D: "DLA Troop Support · Medical",
  SPE8E: "DLA Troop Support · Construction & Equipment",
  SPE1C: "DLA Troop Support · Clothing & Textiles",
  SPE3S: "DLA Troop Support · Subsistence",
};

/** Acquisition Method Suffix Codes, summarized from DFARS PGI 217.7506. */
export const AMSC: Record<string, string> = {
  G: "Competitive: full technical data, no restrictions",
  Z: "Commercial / off-the-shelf item",
  L: "Low annual buy value; not screened for competition",
  C: "Approved sources only (engineering source approval)",
  D: "Data unavailable for a competitive buy",
  H: "Government lacks sufficient or legible data",
  P: "Proprietary data the Government can't obtain",
  R: "Government doesn't own the data rights",
  B: "Buy directly from the actual manufacturer",
  Q: "Limited data or rights; other sources may qualify",
  T: "Qualified products list (QPL) item",
  M: "Requires specialized tooling or skills",
};

export const POINTS: Record<string, string> = { D: "Destination", O: "Origin" };

export const officeLabel = (code: string) => BUYING_OFFICES[code] ?? code;

/** 8345002929415 → 8345-00-292-9415 */
export function formatNsn(nsn: string) {
  return /^\d{13}$/.test(nsn) ? `${nsn.slice(0, 4)}-${nsn.slice(4, 6)}-${nsn.slice(6, 9)}-${nsn.slice(9)}` : nsn;
}

/** Today's date (YYYY-MM-DD) in Eastern time, where DLA's return-by dates live. */
export function todayEastern() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000);
}

export function formatDate(isoDate: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

/** Links back to the original pages on DIBBS (users pass the DoD consent banner once per session). */
export const dibbsLinks = (solicitationNumber: string, nsn: string) => ({
  record: `https://www.dibbs.bsm.dla.mil/rfq/rfqrec.aspx?sn=${solicitationNumber}`,
  pdf: `https://dibbs2.bsm.dla.mil/Downloads/RFQ/${solicitationNumber.slice(-1)}/${solicitationNumber}.PDF`,
  quote: `https://www.dibbs.bsm.dla.mil/RA/Quote/QuoteFrm.aspx?sn=${solicitationNumber}`,
  nsn: `https://www.dibbs.bsm.dla.mil/RFQ/RFQNsn.aspx?value=${nsn}&category=post&Scope=`,
  techDocs: `https://tdmt.dla.mil/tdmt/Client/?StartItem=DSP_TDP_Acquisition_Doc%3AbySolicitation%3A${solicitationNumber}`,
});
