"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { SortKey } from "@/lib/rfqs/filters";
import { AMSC, formatDate, formatNsn, officeLabel, POINTS, SOLICITATION_TYPE_DESCRIPTIONS, SOLICITATION_TYPES } from "@/lib/rfqs/labels";
import type { RfqRow } from "@/lib/rfqs/queries";
import { SetAside } from "./badges";
import { Closing } from "./closing";
import { CopyButton } from "./copy-button";

export type ColumnId =
  | "item"
  | "solicitation"
  | "nsn"
  | "pr"
  | "fsc"
  | "qty"
  | "setAside"
  | "type"
  | "sources"
  | "amsc"
  | "delivery"
  | "inspection"
  | "office"
  | "posted"
  | "closes";

export type CellContext = { row: RfqRow; today: string };

export type ColumnDef = {
  id: ColumnId;
  label: string;
  sortKey?: SortKey;
  align?: "right";
  /** Fixed width in px; the item column takes the remaining space. */
  width?: number;
  hideable: boolean;
  cell: (ctx: CellContext) => React.ReactNode;
};

const COPY_ON_HOVER = "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100";

function Mono({ value, display, label }: { value: string; display?: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-0.5 font-mono">
      <span className="truncate text-[13px]">{display ?? value}</span>
      <CopyButton value={display ?? value} label={label} className={COPY_ON_HOVER} />
    </span>
  );
}

const muted = (v: React.ReactNode) => <span className="text-muted-foreground">{v}</span>;

export const COLUMNS: ColumnDef[] = [
  {
    id: "item",
    label: "Item",
    sortKey: "item",
    hideable: false,
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate font-semibold">{row.nomenclature.replace(/,+$/, "")}</p>
        <p className="truncate text-xs text-muted-foreground">
          {row.fsc ? `${row.fsc} · ${row.fscName ?? "Unknown class"}` : "Part-numbered item"}
        </p>
        {row.matchedSource && <p className="truncate text-xs font-medium text-primary">Matched approved part {row.matchedSource}</p>}
      </div>
    ),
  },
  {
    id: "solicitation",
    label: "Solicitation #",
    sortKey: "solicitation",
    width: 160,
    hideable: true,
    cell: ({ row }) => <Mono value={row.solicitationNumber} label="solicitation number" />,
  },
  {
    id: "nsn",
    label: "NSN",
    sortKey: "nsn",
    width: 164,
    hideable: true,
    cell: ({ row }) => <Mono value={row.nsn} display={formatNsn(row.nsn)} label="NSN" />,
  },
  {
    id: "qty",
    label: "Qty",
    sortKey: "qty",
    align: "right",
    width: 116,
    hideable: true,
    cell: ({ row }) => (
      <span className="tabular-nums">
        <span className="font-semibold">{row.quantity.toLocaleString()}</span>{" "}
        <span className="text-[11px] text-muted-foreground uppercase">{row.unitOfIssue}</span>
      </span>
    ),
  },
  {
    id: "setAside",
    label: "Set-aside",
    sortKey: "setAside",
    width: 132,
    hideable: true,
    cell: ({ row }) => <SetAside code={row.setAside} />,
  },
  {
    id: "type",
    label: "Award type",
    sortKey: "type",
    width: 124,
    hideable: true,
    cell: ({ row }) => (
      <span className="truncate text-[13px]" title={SOLICITATION_TYPE_DESCRIPTIONS[row.solicitationType ?? ""]}>
        {SOLICITATION_TYPES[row.solicitationType ?? ""] ?? "—"}
      </span>
    ),
  },
  {
    id: "sources",
    label: "Sources",
    sortKey: "sources",
    align: "right",
    width: 116,
    hideable: true,
    cell: ({ row }) => (row.sourceCount ? <span className="tabular-nums">{row.sourceCount}</span> : muted("—")),
  },
  {
    id: "delivery",
    label: "Delivery",
    sortKey: "delivery",
    align: "right",
    width: 120,
    hideable: true,
    cell: ({ row }) => (row.requiredDeliveryDays !== null ? <span className="tabular-nums">{row.requiredDeliveryDays}d</span> : muted("—")),
  },
  {
    id: "closes",
    label: "Closes",
    sortKey: "closes",
    align: "right",
    width: 144,
    hideable: true,
    cell: ({ row, today }) => (
      <span className="inline-flex flex-col items-end">
        <Closing date={row.returnByDate} today={today} />
        {row.extendedDays ? <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300">Extended +{row.extendedDays}d</span> : null}
      </span>
    ),
  },
  {
    id: "posted",
    label: "Posted",
    sortKey: "posted",
    width: 112,
    hideable: true,
    cell: ({ row }) => <span className="text-[13px] tabular-nums">{formatDate(row.postedDate)}</span>,
  },
  {
    id: "fsc",
    label: "Supply class",
    sortKey: "fsc",
    width: 200,
    hideable: true,
    cell: ({ row }) =>
      row.fsc ? (
        <span className="block truncate text-[13px]">
          <span className="tabular-nums">{row.fsc}</span> {muted(row.fscName)}
        </span>
      ) : (
        muted("—")
      ),
  },
  {
    id: "amsc",
    label: "AMSC",
    sortKey: "amsc",
    width: 100,
    hideable: true,
    cell: ({ row }) =>
      row.amsc ? (
        <span className="font-mono text-[13px]" title={AMSC[row.amsc]}>
          {row.amsc}
        </span>
      ) : (
        muted("—")
      ),
  },
  {
    id: "inspection",
    label: "Inspection",
    sortKey: "inspection",
    width: 124,
    hideable: true,
    cell: ({ row }) => <span className="text-[13px]">{POINTS[row.inspectionPoint ?? ""] ?? "—"}</span>,
  },
  {
    id: "office",
    label: "Buying office",
    sortKey: "office",
    width: 200,
    hideable: true,
    cell: ({ row }) => (
      <span className="block truncate text-[13px]" title={row.buyingOffice}>
        {officeLabel(row.buyingOffice)}
      </span>
    ),
  },
  {
    id: "pr",
    label: "PR #",
    sortKey: "pr",
    width: 132,
    hideable: true,
    cell: ({ row }) => <Mono value={row.prNumber} label="PR number" />,
  },
];

const SORT_KIND: Record<SortKey, [asc: string, desc: string]> = {
  closes: ["earliest first", "latest first"],
  posted: ["oldest first", "newest first"],
  qty: ["smallest first", "largest first"],
  item: ["A → Z", "Z → A"],
  solicitation: ["A → Z", "Z → A"],
  nsn: ["low → high", "high → low"],
  fsc: ["low → high", "high → low"],
  setAside: ["restricted first", "unrestricted first"],
  type: ["A → Z", "Z → A"],
  sources: ["fewest first", "most first"],
  amsc: ["A → Z", "Z → A"],
  delivery: ["shortest first", "longest first"],
  inspection: ["A → Z", "Z → A"],
  office: ["A → Z", "Z → A"],
  pr: ["A → Z", "Z → A"],
};

/** "earliest first", "largest first"… for sort menus and chip tooltips. */
export const directionLabel = (key: SortKey, desc: boolean) => SORT_KIND[key][desc ? 1 : 0];

export const COLUMN_BY_ID =Object.fromEntries(COLUMNS.map((c) => [c.id, c])) as Record<ColumnId, ColumnDef>;
const DEFAULT_ORDER = COLUMNS.map((c) => c.id);
const DEFAULT_HIDDEN: ColumnId[] = ["sources", "delivery", "posted", "fsc", "amsc", "inspection", "office", "pr"];

// ── Column preferences (order + visibility), remembered per browser ─────────────────

export type ColumnPrefs = { order: ColumnId[]; hidden: ColumnId[] };

const STORAGE_KEY = "dibbs-rfq:columns:v1";
const listeners = new Set<() => void>();
let memoryFallback: string | null = null; // when localStorage is unavailable (private mode, blocked storage)

function readPrefs() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryFallback;
  }
}

function writePrefs(value: string | null) {
  memoryFallback = value;
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage blocked: keep the in-memory copy
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && onChange();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function normalize(raw: string | null): ColumnPrefs {
  const fallback = { order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<ColumnPrefs>;
    const known = (id: unknown): id is ColumnId => typeof id === "string" && id in COLUMN_BY_ID;
    const order = [...new Set((parsed.order ?? []).filter(known))];
    for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id); // columns added since the prefs were saved
    const hidden = (parsed.hidden ?? []).filter((id): id is ColumnId => known(id) && COLUMN_BY_ID[id].hideable);
    return { order, hidden };
  } catch {
    return fallback;
  }
}

/** Column order and visibility from localStorage; SSR and first paint use the defaults. */
export function useColumnPrefs() {
  const raw = useSyncExternalStore(subscribe, readPrefs, () => null);
  const prefs = useMemo(() => normalize(raw), [raw]);
  const save = useCallback((next: ColumnPrefs) => writePrefs(JSON.stringify(next)), []);
  const reset = useCallback(() => writePrefs(null), []);
  const visible = prefs.order.filter((id) => !prefs.hidden.includes(id)).map((id) => COLUMN_BY_ID[id]);
  return { ...prefs, visible, save, reset, isDefault: raw === null };
}
