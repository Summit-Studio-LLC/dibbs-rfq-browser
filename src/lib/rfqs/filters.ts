/**
 * Every view of the browser is described by URL search params, so views are
 * shareable and the back button works. Shared by the server (query) and client (controls).
 */

export const SORTS = { closing: "Closing soonest", newest: "Newest posted", qty: "Largest quantity" } as const;
export type Sort = keyof typeof SORTS;

export const CLOSING_WINDOWS = [3, 7, 14] as const;

export type Filters = {
  q: string;
  closing: number | null; // return-by within N days
  setAside: string[];
  fsc: string[];
  type: string[];
  posted: string[]; // posting days (YYYY-MM-DD)
  office: string[];
  amsc: string[];
  inspection: string | null; // D | O
  qtyMin: number | null;
  qtyMax: number | null;
  deliveryMax: number | null;
  hasSources: boolean;
  includeClosed: boolean;
  sort: Sort;
  page: number;
  id: string | null; // selected line item: `${solicitationNumber}~${prNumber}`
};

export const DEFAULT_FILTERS: Filters = {
  q: "",
  closing: null,
  setAside: [],
  fsc: [],
  type: [],
  posted: [],
  office: [],
  amsc: [],
  inspection: null,
  qtyMin: null,
  qtyMax: null,
  deliveryMax: null,
  hasSources: false,
  includeClosed: false,
  sort: "closing",
  page: 1,
  id: null,
};

type ParamKey = keyof Filters;
const KEYS: Record<ParamKey, string> = {
  q: "q",
  closing: "closing",
  setAside: "sa",
  fsc: "fsc",
  type: "type",
  posted: "posted",
  office: "office",
  amsc: "amsc",
  inspection: "insp",
  qtyMin: "qmin",
  qtyMax: "qmax",
  deliveryMax: "dmax",
  hasSources: "src",
  includeClosed: "closed",
  sort: "sort",
  page: "page",
  id: "id",
};

export type RawParams = Record<string, string | string[] | undefined>;

export function parseFilters(raw: RawParams): Filters {
  const get = (key: ParamKey) => {
    const v = raw[KEYS[key]];
    return (Array.isArray(v) ? v[0] : v)?.trim() || null;
  };
  const list = (key: ParamKey) => get(key)?.split(",").filter(Boolean) ?? [];
  const int = (key: ParamKey) => {
    const v = get(key);
    return v && /^\d+$/.test(v) ? Number(v) : null;
  };
  const sort = get("sort");
  return {
    q: get("q") ?? "",
    closing: int("closing"),
    setAside: list("setAside"),
    fsc: list("fsc"),
    type: list("type"),
    posted: list("posted"),
    office: list("office"),
    amsc: list("amsc"),
    inspection: get("inspection"),
    qtyMin: int("qtyMin"),
    qtyMax: int("qtyMax"),
    deliveryMax: int("deliveryMax"),
    hasSources: get("hasSources") === "1",
    includeClosed: get("includeClosed") === "1",
    sort: sort && sort in SORTS ? (sort as Sort) : "closing",
    page: Math.max(1, int("page") ?? 1),
    id: get("id"),
  };
}

export function toQueryString(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, param] of Object.entries(KEYS) as [ParamKey, string][]) {
    const value = filters[key];
    if (value === DEFAULT_FILTERS[key] || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(param, value.join(","));
    } else {
      params.set(param, value === true ? "1" : String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

/** URL for `filters` with `patch` applied. Changing anything but page/id resets to page 1. */
export function hrefWith(filters: Filters, patch: Partial<Filters>) {
  const resets = Object.keys(patch).some((k) => k !== "page" && k !== "id") ? { page: 1 } : {};
  return toQueryString({ ...filters, ...resets, ...patch });
}

/** Count of filters beyond search and sort, for "Clear all". */
export function activeFilterCount(f: Filters) {
  return (
    (f.closing !== null ? 1 : 0) +
    f.setAside.length +
    f.fsc.length +
    f.type.length +
    f.posted.length +
    f.office.length +
    f.amsc.length +
    (f.inspection ? 1 : 0) +
    (f.qtyMin !== null ? 1 : 0) +
    (f.qtyMax !== null ? 1 : 0) +
    (f.deliveryMax !== null ? 1 : 0) +
    (f.hasSources ? 1 : 0) +
    (f.includeClosed ? 1 : 0)
  );
}

export const lineItemId = (solicitationNumber: string, prNumber: string) => `${solicitationNumber}~${prNumber}`;
