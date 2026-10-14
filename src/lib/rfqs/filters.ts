/**
 * Every view of the browser is described by URL search params, so views are
 * shareable and the back button works. Shared by the server (query) and client (controls).
 */

/** Columns the server can sort by, with the label shown in sort controls. */
export const SORT_LABELS = {
  closes: "Closes",
  posted: "Posted",
  qty: "Quantity",
  item: "Item name",
  solicitation: "Solicitation #",
  nsn: "NSN",
  fsc: "Supply class",
  setAside: "Set-aside",
  type: "Award type",
  sources: "Approved sources",
  amsc: "AMSC",
  delivery: "Required delivery",
  inspection: "Inspection",
  office: "Buying office",
  pr: "PR #",
} as const;
export type SortKey = keyof typeof SORT_LABELS;
export type SortSpec = { key: SortKey; desc: boolean };

/** First click on these sorts biggest / newest first. */
export const DESC_FIRST = new Set<SortKey>(["qty", "sources", "posted", "delivery"]);
export const MAX_SORTS = 3;
export const DEFAULT_SORT: SortSpec[] = [{ key: "closes", desc: false }];

export const CLOSING_WINDOWS = [3, 7, 14] as const;
export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export type Filters = {
  q: string;
  closing: number | null; // return-by within N days
  closesFrom: string | null; // custom return-by range (YYYY-MM-DD), instead of `closing`
  closesTo: string | null;
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
  sort: SortSpec[]; // primary first
  page: number;
  size: number;
  id: string | null; // selected line item: `${solicitationNumber}~${prNumber}`
};

export const DEFAULT_FILTERS: Filters = {
  q: "",
  closing: null,
  closesFrom: null,
  closesTo: null,
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
  sort: DEFAULT_SORT,
  page: 1,
  size: DEFAULT_PAGE_SIZE,
  id: null,
};

type ParamKey = keyof Filters;
const KEYS: Record<ParamKey, string> = {
  q: "q",
  closing: "closing",
  closesFrom: "cfrom",
  closesTo: "cto",
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
  size: "size",
  id: "id",
};

/** "closes,-qty" ⇄ [{closes asc}, {qty desc}] */
export const serializeSort = (sort: SortSpec[]) => sort.map((s) => (s.desc ? `-${s.key}` : s.key)).join(",");

function parseSort(value: string | null): SortSpec[] {
  const specs: SortSpec[] = [];
  for (const part of value?.split(",") ?? []) {
    const key = part.replace(/^-/, "");
    if (key in SORT_LABELS && !specs.some((s) => s.key === key)) specs.push({ key: key as SortKey, desc: part.startsWith("-") });
  }
  return specs.length ? specs.slice(0, MAX_SORTS) : DEFAULT_SORT;
}

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
  const size = int("size");
  const isoDate = (key: ParamKey) => {
    const v = get(key);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
  };
  return {
    q: get("q") ?? "",
    closing: int("closing"),
    closesFrom: isoDate("closesFrom"),
    closesTo: isoDate("closesTo"),
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
    sort: parseSort(get("sort")),
    page: Math.max(1, int("page") ?? 1),
    size: size && (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    id: get("id"),
  };
}

export function toQueryString(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, param] of Object.entries(KEYS) as [ParamKey, string][]) {
    const value = filters[key];
    if (key === "sort") {
      const sort = serializeSort(filters.sort);
      if (sort !== serializeSort(DEFAULT_SORT)) params.set(param, sort);
      continue;
    }
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

/** Header click: make `key` the only sort, or flip it if it already is. */
export function sortBy(sort: SortSpec[], key: SortKey): SortSpec[] {
  const current = sort.find((s) => s.key === key);
  if (current && sort.length === 1) return [{ key, desc: !current.desc }];
  return [{ key, desc: current ? current.desc : DESC_FIRST.has(key) }];
}

/** Shift+click: add `key` as the next sort level, or flip it if it's already one. */
export function thenBy(sort: SortSpec[], key: SortKey, desc?: boolean): SortSpec[] {
  const current = sort.find((s) => s.key === key);
  if (current) return sort.map((s) => (s.key === key ? { key, desc: desc ?? !s.desc } : s));
  const next = { key, desc: desc ?? DESC_FIRST.has(key) };
  return sort.length >= MAX_SORTS ? [...sort.slice(0, MAX_SORTS - 1), next] : [...sort, next];
}

/** Count of filters beyond search and sort, for "Clear all". */
export function activeFilterCount(f: Filters) {
  return (
    (f.closing !== null || f.closesFrom || f.closesTo ? 1 : 0) +
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
