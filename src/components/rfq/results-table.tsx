"use client";

import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { restrictToHorizontalAxis, restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  Columns3Icon,
  EllipsisVerticalIcon,
  EyeOffIcon,
  GripVerticalIcon,
  ListPlusIcon,
  LoaderCircleIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_FILTERS,
  DESC_FIRST,
  lineItemId,
  MAX_SORTS,
  PAGE_SIZES,
  SORT_LABELS,
  type SortKey,
  type SortSpec,
  sortBy,
  thenBy,
} from "@/lib/rfqs/filters";
import { formatNsn, SOLICITATION_TYPES } from "@/lib/rfqs/labels";
import type { RfqRow } from "@/lib/rfqs/queries";
import { cn } from "@/lib/utils";
import { SetAside } from "./badges";
import { Closing } from "./closing";
import { COLUMN_BY_ID, type ColumnDef, type ColumnId, directionLabel, useColumnPrefs } from "./columns";
import { isTypingTarget } from "./hooks";
import { isModifiedClick, SelectLink, useNav } from "./navigation";

type Prefs = ReturnType<typeof useColumnPrefs>;

const ROW_BG = "[--row-bg:var(--card)] hover:[--row-bg:color-mix(in_oklab,var(--accent)_70%,var(--card))]";
const SELECTED_BG = "[--row-bg:color-mix(in_oklab,var(--primary)_8%,var(--card))]";
const ITEM_MIN_WIDTH = 240;

export function ResultsTable({ rows, total, pageCount, today }: { rows: RfqRow[]; total: number; pageCount: number; today: string }) {
  const { f, committed, pending, select, apply } = useNav();
  const columns = useColumnPrefs();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [scrolledX, setScrolledX] = useState(false);
  const ids = rows.map((r) => lineItemId(r.solicitationNumber, r.prNumber));
  const listPending = pending === "filter" || pending === "page";

  // A new page or a new result set starts at its top.
  const listKey = JSON.stringify({ ...committed, id: null });
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    const card = cardRef.current;
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [listKey]);

  // j/k or ↑/↓ move the selection through the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || !ids.length) return;
      const down = e.key === "j" || (e.key === "ArrowDown" && f.id);
      const up = e.key === "k" || (e.key === "ArrowUp" && f.id);
      if (!down && !up) return;
      e.preventDefault();
      const at = f.id ? ids.indexOf(f.id) : -1;
      const next = ids[Math.min(ids.length - 1, Math.max(0, at === -1 ? 0 : at + (down ? 1 : -1)))];
      if (next === f.id) return;
      select(next);
      requestAnimationFrame(() => document.querySelector(`[data-row="${window.CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section ref={cardRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <ProgressBar active={listPending} />
      <Toolbar total={total} count={rows.length} pageCount={pageCount} columns={columns} />
      {rows.length ? (
        <>
          <div
            ref={scrollRef}
            data-scrolled-x={scrolledX ? "" : undefined}
            onScroll={(e) => setScrolledX(e.currentTarget.scrollLeft > 0)}
            className={cn(
              "group/scroll transition-opacity duration-200 md:min-h-0 md:flex-1 md:overflow-auto",
              listPending ? "opacity-55 delay-150" : "opacity-100",
            )}
          >
            <DataTable rows={rows} ids={ids} columns={columns} today={today} />
            <CardList rows={rows} ids={ids} today={today} />
          </div>
          <Pager total={total} pageCount={pageCount} count={rows.length} />
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
          <SearchXIcon className="size-8 text-muted-foreground/60" />
          <p className="mt-3 font-semibold">No RFQs match these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">Try a broader search, or clear the filters.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => apply({ ...DEFAULT_FILTERS, sort: f.sort, size: f.size })}
          >
            Clear search and filters
          </Button>
        </div>
      )}
    </section>
  );
}

function ProgressBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-200",
        active ? "opacity-100 delay-150" : "opacity-0",
      )}
    >
      {active && <div className="h-full w-1/3 animate-progress rounded-full bg-primary" />}
    </div>
  );
}

// ── Desktop / tablet table ──────────────────────────────────────────────────────────

function DataTable({ rows, ids, columns, today }: { rows: RfqRow[]; ids: string[]; columns: Prefs; today: string }) {
  const { f, select, hrefFor, apply } = useNav();
  const justDragged = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const visible = columns.visible;
  const minWidth = visible.reduce((sum, c) => sum + (c.width ?? ITEM_MIN_WIDTH), 0);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0); // swallow the click that ends a drag
    if (!over || active.id === over.id) return;
    const order = columns.order;
    columns.save({ order: arrayMove(order, order.indexOf(active.id as ColumnId), order.indexOf(over.id as ColumnId)), hidden: columns.hidden });
  };
  const onSort = (key: SortKey, additive: boolean) => {
    if (justDragged.current) return;
    apply({ sort: additive ? thenBy(f.sort, key) : sortBy(f.sort, key) });
  };

  return (
    <DndContext id="column-order" sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToHorizontalAxis]} onDragEnd={onDragEnd}>
      <table className="hidden w-full table-fixed border-separate border-spacing-0 text-sm md:table" style={{ minWidth }}>
        <colgroup>
          {visible.map((c) => (
            <col key={c.id} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <SortableContext items={visible.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              {visible.map((c, i) => (
                <HeaderCell key={c.id} column={c} index={i} columns={columns} sticky={i === 0} onSort={onSort} />
              ))}
            </SortableContext>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const id = ids[r];
            const selected = f.id === id;
            return (
              <tr
                key={id}
                data-row={id}
                aria-selected={selected}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a, button")) return;
                  if (e.metaKey || e.ctrlKey) window.open(hrefFor({ id }), "_blank");
                  else select(id);
                }}
                className={cn("group/row cursor-pointer", selected ? SELECTED_BG : ROW_BG)}
              >
                {visible.map((c, i) => (
                  <td
                    key={c.id}
                    className={cn(
                      "border-b bg-(--row-bg) px-3 py-2.5 align-middle transition-colors duration-150",
                      c.align === "right" && "text-right",
                      i === 0 &&
                        "sticky left-0 z-10 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary before:opacity-0 before:transition-opacity group-aria-selected/row:before:opacity-100 after:pointer-events-none after:absolute after:inset-y-0 after:-right-3 after:w-3 after:bg-linear-to-r after:from-foreground/8 after:to-transparent after:opacity-0 after:transition-opacity group-data-scrolled-x/scroll:after:opacity-100",
                    )}
                  >
                    {c.id === "item" ? (
                      <SelectLink id={id} className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {c.cell({ row, today })}
                      </SelectLink>
                    ) : (
                      c.cell({ row, today })
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </DndContext>
  );
}

function HeaderCell({
  column,
  index,
  columns,
  sticky,
  onSort,
}: {
  column: ColumnDef;
  index: number;
  columns: Prefs;
  sticky: boolean;
  onSort: (key: SortKey, additive: boolean) => void;
}) {
  const { f } = useNav();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const { onKeyDown, ...pointerListeners } = listeners ?? {};
  const level = column.sortKey ? f.sort.findIndex((s) => s.key === column.sortKey) : -1;
  const spec = level >= 0 ? f.sort[level] : undefined;

  return (
    <th
      ref={setNodeRef}
      scope="col"
      aria-sort={level === 0 ? (spec?.desc ? "descending" : "ascending") : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...pointerListeners}
      className={cn(
        "group/th sticky top-0 z-20 h-10 border-b bg-muted px-1.5 text-left align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground select-none",
        sticky && "left-0 z-30",
        isDragging && "z-40 cursor-grabbing rounded-md bg-card text-foreground shadow-xl ring-1 ring-primary/30",
      )}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          onKeyDown={onKeyDown as React.KeyboardEventHandler<HTMLButtonElement> | undefined}
          aria-label={`Reorder ${column.label} column`}
          className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity group-hover/th:opacity-100 hover:text-foreground focus-visible:opacity-100"
        >
          <GripVerticalIcon className="size-3.5" />
        </button>
        {column.sortKey ? (
          <button
            type="button"
            onClick={(e) => onSort(column.sortKey!, e.shiftKey)}
            title="Click to sort · Shift+click to add as a secondary sort"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 rounded py-1 transition-colors hover:text-foreground",
              column.align === "right" && "justify-end",
              spec && "text-foreground",
            )}
          >
            <span className="truncate">{column.label}</span>
            <SortIcon spec={spec} level={level} multi={f.sort.length > 1} />
          </button>
        ) : (
          <span className="flex-1 truncate">{column.label}</span>
        )}
        <ColumnMenu column={column} index={index} columns={columns} />
      </div>
    </th>
  );
}

function SortIcon({ spec, level, multi }: { spec?: SortSpec; level: number; multi: boolean }) {
  if (!spec) return <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/th:opacity-60" />;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-primary">
      <ArrowUpIcon className={cn("size-3.5 transition-transform duration-200", spec.desc && "rotate-180")} />
      {multi && (
        <span className="flex size-3.5 items-center justify-center rounded-full bg-primary/12 text-[9px] font-bold tabular-nums">{level + 1}</span>
      )}
    </span>
  );
}

function ColumnMenu({ column, index, columns }: { column: ColumnDef; index: number; columns: Prefs }) {
  const { f, apply } = useNav();
  const key = column.sortKey;
  const inSort = key ? f.sort.some((s) => s.key === key) : false;
  const visible = columns.visible;
  const move = (delta: number) => {
    const neighbor = visible[index + delta];
    if (!neighbor) return;
    const order = columns.order;
    columns.save({ order: arrayMove(order, order.indexOf(column.id), order.indexOf(neighbor.id)), hidden: columns.hidden });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`${column.label} column options`}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition group-hover/th:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 data-[state=open]:bg-background data-[state=open]:opacity-100"
        >
          <EllipsisVerticalIcon className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border shadow-xl shadow-foreground/10">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{column.label}</DropdownMenuLabel>
        {key && (
          <>
            <DropdownMenuItem onSelect={() => apply({ sort: [{ key, desc: false }] })}>
              <ArrowUpIcon /> Sort {directionLabel(key, false)}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => apply({ sort: [{ key, desc: true }] })}>
              <ArrowDownIcon /> Sort {directionLabel(key, true)}
            </DropdownMenuItem>
            {!inSort && (
              <DropdownMenuItem onSelect={() => apply({ sort: thenBy(f.sort, key) })}>
                <ListPlusIcon /> {f.sort.length >= MAX_SORTS ? "Use as last sort level" : "Add as next sort level"}
              </DropdownMenuItem>
            )}
            {inSort && f.sort.length > 1 && (
              <DropdownMenuItem onSelect={() => apply({ sort: f.sort.filter((s) => s.key !== key) })}>
                <XIcon /> Remove from sort
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem disabled={index === 0} onSelect={() => move(-1)}>
          <ArrowLeftIcon /> Move left
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === visible.length - 1} onSelect={() => move(1)}>
          <ArrowRightIcon /> Move right
        </DropdownMenuItem>
        {column.hideable && (
          <DropdownMenuItem onSelect={() => columns.save({ order: columns.order, hidden: [...columns.hidden, column.id] })}>
            <EyeOffIcon /> Hide column
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Phone list ──────────────────────────────────────────────────────────────────────

function CardList({ rows, ids, today }: { rows: RfqRow[]; ids: string[]; today: string }) {
  const { f } = useNav();
  return (
    <ul className="divide-y md:hidden">
      {rows.map((row, r) => {
        const id = ids[r];
        const active = f.id === id;
        return (
          <li
            key={id}
            className={cn(
              "relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 transition-colors active:bg-accent",
              active && "bg-primary/[0.06] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary",
            )}
          >
            <div className="min-w-0">
              <SelectLink id={id} className="block truncate font-semibold outline-none after:absolute after:inset-0">
                {row.nomenclature.replace(/,+$/, "")}
              </SelectLink>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {row.solicitationNumber} · {formatNsn(row.nsn)}
              </p>
            </div>
            <div className="row-span-2 flex flex-col items-end gap-0.5">
              <Closing date={row.returnByDate} today={today} />
              <span className="text-xs text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{row.quantity.toLocaleString()}</span> {row.unitOfIssue}
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <SetAside code={row.setAside} />
              <span className="truncate">{SOLICITATION_TYPES[row.solicitationType ?? ""] ?? ""}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Toolbar: count, sort chips, columns, page size, compact pager ──────────────────

function Toolbar({ total, count, pageCount, columns }: { total: number; count: number; pageCount: number; columns: Prefs }) {
  const { f, committed, pending, apply } = useNav();
  const first = total ? (committed.page - 1) * committed.size + 1 : 0;
  const flip = (key: SortKey) => apply({ sort: f.sort.map((s) => (s.key === key ? { key, desc: !s.desc } : s)) });

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
      <p className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
        <span>
          <span className="font-semibold text-foreground">
            {first.toLocaleString()}–{(first + Math.max(count, 1) - 1).toLocaleString()}
          </span>{" "}
          of <span className="font-semibold text-foreground">{total.toLocaleString()}</span> {f.includeClosed ? "" : "open "}line items
        </span>
        {pending && pending !== "select" && <LoaderCircleIcon className="size-3.5 animate-spin" aria-label="Loading" />}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Sorted by</span>
        {f.sort.map((s, i) => (
          <span
            key={s.key}
            className="inline-flex animate-in items-center rounded-full border border-primary/20 bg-accent text-xs font-medium text-accent-foreground duration-150 fade-in-0 zoom-in-95"
          >
            <button
              type="button"
              onClick={() => flip(s.key)}
              title={`${directionLabel(s.key, s.desc)} · click to reverse`}
              className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1.5 pl-2 hover:text-foreground"
            >
              {f.sort.length > 1 && <span className="text-[10px] text-muted-foreground tabular-nums">{i + 1}</span>}
              {SORT_LABELS[s.key]}
              <ArrowUpIcon className={cn("size-3 transition-transform duration-200", s.desc && "rotate-180")} />
            </button>
            {f.sort.length > 1 && (
              <button
                type="button"
                aria-label={`Remove ${SORT_LABELS[s.key]} from sort`}
                onClick={() => apply({ sort: f.sort.filter((x) => x.key !== s.key) })}
                className="-ml-0.5 rounded-full py-0.5 pr-1.5 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </span>
        ))}
        <AddSort />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <ColumnPicker columns={columns} />
        <Select value={String(f.size)} onValueChange={(v) => apply({ size: Number(v) })}>
          <SelectTrigger size="sm" className="hidden sm:flex" aria-label="Rows per page">
            <SelectValue>{f.size} / page</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} rows per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pageCount > 1 && <CompactPager pageCount={pageCount} />}
      </div>
    </div>
  );
}

/** "+ Sort" menu: on phones it's the only way to sort; on desktop it complements Shift+click. */
function AddSort() {
  const { f, apply } = useNav();
  const used = new Set(f.sort.map((s) => s.key));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          <ChevronsUpDownIcon /> Sort
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 border shadow-xl shadow-foreground/10">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Sort by</DropdownMenuLabel>
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <DropdownMenuItem key={key} onSelect={() => apply({ sort: [{ key, desc: DESC_FIRST.has(key) }] })}>
            {SORT_LABELS[key]}
            {used.has(key) && <span className="ml-auto text-xs text-muted-foreground">current</span>}
          </DropdownMenuItem>
        ))}
        {f.sort.length < MAX_SORTS && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Then by</DropdownMenuLabel>
            {(Object.keys(SORT_LABELS) as SortKey[])
              .filter((key) => !used.has(key))
              .map((key) => (
                <DropdownMenuItem key={key} onSelect={() => apply({ sort: thenBy(f.sort, key) })}>
                  <ListPlusIcon /> {SORT_LABELS[key]}
                </DropdownMenuItem>
              ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColumnPicker({ columns }: { columns: Prefs }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const order = columns.order;
    columns.save({ order: arrayMove(order, order.indexOf(active.id as ColumnId), order.indexOf(over.id as ColumnId)), hidden: columns.hidden });
  };
  const toggle = (id: ColumnId, on: boolean) =>
    columns.save({ order: columns.order, hidden: on ? columns.hidden.filter((h) => h !== id) : [...columns.hidden, id] });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="hidden md:inline-flex">
          <Columns3Icon /> Columns
          <span className="text-xs text-muted-foreground tabular-nums">
            {columns.visible.length}/{columns.order.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Columns</p>
          <Button variant="link" size="xs" disabled={columns.isDefault} onClick={columns.reset}>
            Reset
          </Button>
        </div>
        <DndContext id="column-picker" sensors={sensors} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onDragEnd}>
          <SortableContext items={columns.order} strategy={verticalListSortingStrategy}>
            <ul className="max-h-[60vh] overflow-y-auto p-1">
              {columns.order.map((id) => (
                <PickerRow key={id} column={COLUMN_BY_ID[id]} checked={!columns.hidden.includes(id)} onToggle={(on) => toggle(id, on)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">Drag to reorder (or drag table headers). Saved in this browser.</p>
      </PopoverContent>
    </Popover>
  );
}

function PickerRow({ column, checked, onToggle }: { column: ColumnDef; checked: boolean; onToggle: (on: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-sm", isDragging ? "relative z-10 bg-card shadow-lg ring-1 ring-primary/30" : "hover:bg-accent")}
    >
      <button type="button" {...attributes} {...listeners} aria-label={`Reorder ${column.label}`} className="cursor-grab text-muted-foreground/60 hover:text-foreground">
        <GripVerticalIcon className="size-4" />
      </button>
      <Checkbox id={`col-${column.id}`} checked={checked} disabled={!column.hideable} onCheckedChange={(v) => onToggle(v === true)} />
      <label htmlFor={`col-${column.id}`} className="flex-1 cursor-pointer select-none">
        {column.label}
      </label>
    </li>
  );
}

// ── Pagination ──────────────────────────────────────────────────────────────────────

/** Page numbers around the current one, with gaps: 1 … 4 5 [6] 7 8 … 196 */
function pageWindow(page: number, pageCount: number, radius: number) {
  const pages = new Set([1, pageCount]);
  for (let p = page - radius; p <= page + radius; p++) if (p >= 1 && p <= pageCount) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? (["gap", p] as const) : ([p] as const)));
}

function PageLink({
  page,
  label,
  current,
  disabled,
  variant = "ghost",
  className,
  children,
}: {
  page: number;
  label: string;
  current?: boolean;
  disabled?: boolean;
  variant?: "ghost" | "outline";
  className?: string;
  children: React.ReactNode;
}) {
  const { f, pending, apply, hrefFor } = useNav();
  const loading = pending === "page" && f.page === page && !current;
  if (disabled || current) {
    return (
      <Button
        variant={current ? "default" : variant}
        size="sm"
        disabled={disabled}
        aria-current={current ? "page" : undefined}
        aria-label={label}
        className={cn("min-w-7 tabular-nums", className)}
      >
        {children}
      </Button>
    );
  }
  return (
    <Button variant={variant} size="sm" asChild className={cn("min-w-7 tabular-nums", className)}>
      <Link
        href={hrefFor({ page })}
        scroll={false}
        aria-label={label}
        onClick={(e) => {
          if (isModifiedClick(e)) return;
          e.preventDefault();
          apply({ page });
        }}
      >
        {loading ? <LoaderCircleIcon className="animate-spin" /> : children}
      </Link>
    </Button>
  );
}

function CompactPager({ pageCount }: { pageCount: number }) {
  const { committed } = useNav();
  const page = committed.page;
  return (
    <div className="flex items-center gap-0.5">
      <PageLink page={page - 1} label="Previous page" disabled={page <= 1} variant="outline" className="px-1.5">
        <ChevronLeftIcon />
      </PageLink>
      <span className="px-1.5 text-xs text-muted-foreground tabular-nums">
        {page} / {pageCount.toLocaleString()}
      </span>
      <PageLink page={page + 1} label="Next page" disabled={page >= pageCount} variant="outline" className="px-1.5">
        <ChevronRightIcon />
      </PageLink>
    </div>
  );
}

function Pager({ total, pageCount, count }: { total: number; pageCount: number; count: number }) {
  const { committed, apply } = useNav();
  const page = committed.page;
  const first = (page - 1) * committed.size + 1;
  const [goTo, setGoTo] = useState("");
  const jump = () => {
    const n = Number(goTo);
    if (Number.isInteger(n) && n >= 1) apply({ page: Math.min(n, pageCount) });
    setGoTo("");
  };

  return (
    <nav aria-label="Pagination" className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t bg-card px-3 py-2">
      <div className="min-w-0 space-y-0.5">
        <p className="hidden text-xs text-muted-foreground xl:block">
          <Kbd>j</Kbd> <Kbd>k</Kbd> move · <Kbd>Esc</Kbd> close · <Kbd>/</Kbd> search · Shift+click a header for a second sort
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          Showing{" "}
          <span className="font-medium text-foreground">
            {first.toLocaleString()}–{(first + count - 1).toLocaleString()}
          </span>{" "}
          of {total.toLocaleString()}
        </p>
      </div>
      {pageCount > 1 && (
        <div className="ml-auto flex items-center gap-1">
          <PageLink page={1} label="First page" disabled={page <= 1} className="hidden sm:inline-flex">
            <ChevronFirstIcon />
          </PageLink>
          <PageLink page={page - 1} label="Previous page" disabled={page <= 1} variant="outline">
            <ChevronLeftIcon /> <span className="hidden sm:inline">Prev</span>
          </PageLink>
          <div className="hidden items-center gap-0.5 md:flex">
            {pageWindow(page, pageCount, 1).map((p, i) =>
              p === "gap" ? (
                <span key={`gap${i}`} className="px-1 text-muted-foreground">
                  …
                </span>
              ) : (
                <PageLink key={p} page={p} label={`Page ${p}`} current={p === page}>
                  {p.toLocaleString()}
                </PageLink>
              ),
            )}
          </div>
          <span className="px-2 text-sm text-muted-foreground tabular-nums md:hidden">
            {page} / {pageCount}
          </span>
          <PageLink page={page + 1} label="Next page" disabled={page >= pageCount} variant="outline">
            <span className="hidden sm:inline">Next</span> <ChevronRightIcon />
          </PageLink>
          <PageLink page={pageCount} label="Last page" disabled={page >= pageCount} className="hidden sm:inline-flex">
            <ChevronLastIcon />
          </PageLink>
          <form
            className="ml-2 hidden items-center gap-1.5 text-sm text-muted-foreground lg:flex"
            onSubmit={(e) => {
              e.preventDefault();
              jump();
            }}
          >
            Go to
            <Input
              inputMode="numeric"
              value={goTo}
              onChange={(e) => setGoTo(e.target.value.replace(/\D/g, ""))}
              placeholder={String(page)}
              aria-label="Go to page"
              className="h-7 w-14 text-center tabular-nums"
            />
          </form>
        </div>
      )}
    </nav>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">{children}</kbd>;
}

