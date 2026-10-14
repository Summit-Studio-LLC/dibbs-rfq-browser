"use client";

import { format } from "date-fns";
import { CalendarRangeIcon, LoaderCircleIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { activeFilterCount, CLOSING_WINDOWS, DEFAULT_FILTERS, type Filters } from "@/lib/rfqs/filters";
import {
  AMSC,
  BUYING_OFFICES,
  formatDate,
  officeLabel,
  POINTS,
  SET_ASIDE_DESCRIPTIONS,
  SET_ASIDES,
  SOLICITATION_TYPE_DESCRIPTIONS,
  SOLICITATION_TYPES,
} from "@/lib/rfqs/labels";
import type { Facets } from "@/lib/rfqs/queries";
import { cn } from "@/lib/utils";
import { type FacetChoice, FacetSelect, facetChoices } from "./facet-select";
import { useIsTabletUp } from "./hooks";
import { useNav } from "./navigation";
import { ResponsivePopover } from "./responsive-popover";

export const ACTIVE_CONTROL = "border-primary/40 bg-accent text-accent-foreground";

export function FilterBar({ facets, today }: { facets: Facets; today: string }) {
  const { f, pending, apply } = useNav();

  const setAside = facetChoices(facets.setAside, f.setAside, (v) => SET_ASIDES[v] ?? v, (v) => SET_ASIDE_DESCRIPTIONS[v]);
  const type = facetChoices(facets.type, f.type, (v) => SOLICITATION_TYPES[v] ?? v, (v) => SOLICITATION_TYPE_DESCRIPTIONS[v]);
  const fsc = facetChoices(facets.fsc, f.fsc, (v, name) => (name ? `${v} · ${name}` : v));
  const custom = !!(f.closesFrom || f.closesTo);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-3">
        <SearchBox value={f.q} onSearch={(q) => apply({ q })} pending={pending === "filter"} />
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={custom ? "" : f.closing ? String(f.closing) : "any"}
            onValueChange={(v) => v && apply({ closing: v === "any" ? null : Number(v), closesFrom: null, closesTo: null })}
            aria-label="Closing within"
            className="shrink-0"
          >
            <ToggleGroupItem value="any" className={TOGGLE}>
              Any close
            </ToggleGroupItem>
            {CLOSING_WINDOWS.map((n) => (
              <ToggleGroupItem key={n} value={String(n)} className={TOGGLE} title={`Return by within ${n} days`}>
                ≤ {n}d <span className="text-xs font-normal text-muted-foreground tabular-nums">{facets.closing[`d${n}`]?.toLocaleString()}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <DateRangeFilter today={today} />
          <FacetSelect title="Set-aside" choices={setAside} selected={f.setAside} onChange={(v) => apply({ setAside: v })} />
          <FacetSelect title="Supply class" choices={fsc} selected={f.fsc} onChange={(v) => apply({ fsc: v })} searchable />
          <FacetSelect title="Award type" choices={type} selected={f.type} onChange={(v) => apply({ type: v })} />
          <MoreFilters f={f} facets={facets} apply={apply} />
        </div>
      </div>
      <ActiveChips f={f} facets={facets} apply={apply} />
    </div>
  );
}

const isoToDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const dateToIso = (d: Date) => format(d, "yyyy-MM-dd");
const rangeLabel = (from: string | null, to: string | null) =>
  from && to ? (from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`) : from ? `After ${formatDate(from)}` : `By ${formatDate(to!)}`;

/** Custom return-by window, beyond the ≤ 3/7/14 day presets. */
function DateRangeFilter({ today }: { today: string }) {
  const { f, apply } = useNav();
  const tabletUp = useIsTabletUp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const active = !!(f.closesFrom || f.closesTo);

  const onOpenChange = (next: boolean) => {
    if (next) setDraft(f.closesFrom ? { from: isoToDate(f.closesFrom), to: f.closesTo ? isoToDate(f.closesTo) : undefined } : undefined);
    setOpen(next);
  };
  const commit = (patch: Partial<Filters>) => {
    apply(patch);
    setOpen(false);
  };

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={onOpenChange}
      title="Closing date range"
      description="RFQs whose return-by date falls in this window."
      showDone={false}
      className="w-auto p-0"
      trigger={
        <Button variant="outline" size="sm" className={cn("h-8 shrink-0 bg-card", active && ACTIVE_CONTROL)}>
          <CalendarRangeIcon />
          {active ? rangeLabel(f.closesFrom, f.closesTo) : "Dates…"}
        </Button>
      }
    >
      <Calendar
        mode="range"
        numberOfMonths={tabletUp ? 2 : 1}
        selected={draft}
        onSelect={setDraft}
        defaultMonth={draft?.from ?? isoToDate(today)}
        disabled={f.includeClosed ? undefined : { before: isoToDate(today) }}
        className="mx-auto bg-transparent"
      />
      <div className="flex items-center justify-between gap-3 border-t p-3">
        <p className="text-sm text-muted-foreground">
          {draft?.from ? (
            <span className="font-medium text-foreground">
              {rangeLabel(dateToIso(draft.from), dateToIso(draft.to ?? draft.from))}
            </span>
          ) : (
            "Pick a start and end date"
          )}
        </p>
        <div className="flex gap-2">
          {active && (
            <Button variant="ghost" size="sm" onClick={() => commit({ closesFrom: null, closesTo: null })}>
              Clear
            </Button>
          )}
          <Button
            size="sm"
            disabled={!draft?.from}
            onClick={() =>
              draft?.from && commit({ closing: null, closesFrom: dateToIso(draft.from), closesTo: dateToIso(draft.to ?? draft.from) })
            }
          >
            Apply
          </Button>
        </div>
      </div>
    </ResponsivePopover>
  );
}

function SearchBox({ value, onSearch, pending }: { value: string; onSearch: (q: string) => void; pending: boolean }) {
  const [text, setText] = useState(value);
  const [sent, setSent] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  // Adopt outside changes (Clear all, back button) but not echoes of what we just sent.
  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== sent) {
      setText(value);
      setSent(value);
    }
  }

  const send = (q: string) => {
    if (q.trim() === sent.trim()) return;
    setSent(q);
    onSearch(q.trim());
  };

  useEffect(() => {
    const timer = setTimeout(() => send(text), 300);
    return () => clearTimeout(timer);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <InputGroup className="h-10 w-full bg-card shadow-xs lg:w-[24rem] lg:shrink-0 xl:w-[30rem]">
      <InputGroupAddon>{pending ? <LoaderCircleIcon className="animate-spin" /> : <SearchIcon />}</InputGroupAddon>
      <InputGroupInput
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send(text)}
        placeholder="Search item name, NSN, part #, CAGE, solicitation # or PR #"
        aria-label="Search RFQs"
        className="text-base sm:text-[15px]"
      />
      {text ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => (setText(""), send(""))}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      ) : (
        <InputGroupAddon align="inline-end" className="hidden sm:flex">
          <kbd className="rounded border px-1.5 font-mono text-xs text-muted-foreground">/</kbd>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

type Apply = (patch: Partial<Filters>) => void;

const TOGGLE = "h-8 bg-card px-2.5 data-[state=on]:bg-accent data-[state=on]:font-semibold data-[state=on]:text-accent-foreground";

function MoreFilters({ f, facets, apply }: { f: Filters; facets: Facets; apply: Apply }) {
  const count =
    f.posted.length +
    f.office.length +
    f.amsc.length +
    (f.inspection ? 1 : 0) +
    (f.qtyMin !== null || f.qtyMax !== null ? 1 : 0) +
    (f.deliveryMax !== null ? 1 : 0) +
    (f.hasSources ? 1 : 0) +
    (f.includeClosed ? 1 : 0);
  const posted = facetChoices(facets.posted, f.posted, (v) => formatDate(v, { weekday: "short", month: "short", day: "numeric" }));
  const office = facetChoices(facets.office, f.office, (v) => officeLabel(v), (v) => (BUYING_OFFICES[v] ? v : undefined));
  const amsc = facetChoices(facets.amsc, f.amsc, (v) => `${v} · ${AMSC[v] ?? "Unknown code"}`);
  const inspection = facetChoices(facets.inspection, [], (v) => POINTS[v] ?? v);

  return (
    <ResponsivePopover
      title="More filters"
      className="max-h-[75vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto"
      trigger={
        <Button variant="outline" size="sm" className={cn("h-8 shrink-0 bg-card", count && ACTIVE_CONTROL)}>
          <SlidersHorizontalIcon />
          More filters
          {count > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{count}</span>}
        </Button>
      }
    >
      <div className="space-y-5">
        <Section title="Quantity">
          <div className="flex items-center gap-2">
            <NumberField label="Min" value={f.qtyMin} onCommit={(qtyMin) => apply({ qtyMin })} />
            <span className="text-muted-foreground">to</span>
            <NumberField label="Max" value={f.qtyMax} onCommit={(qtyMax) => apply({ qtyMax })} />
          </div>
        </Section>
        <Section title="Required delivery" hint="Days after award the buyer wants the items">
          <div className="flex flex-wrap items-center gap-2">
            {[30, 90, 180].map((n) => (
              <Button
                key={n}
                size="xs"
                variant={f.deliveryMax === n ? "default" : "outline"}
                onClick={() => apply({ deliveryMax: f.deliveryMax === n ? null : n })}
              >
                ≤ {n} days
              </Button>
            ))}
            <NumberField label="Max days" value={f.deliveryMax} onCommit={(deliveryMax) => apply({ deliveryMax })} />
          </div>
        </Section>
        <Section title="Inspection point">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={f.inspection ?? "any"}
            onValueChange={(v) => v && apply({ inspection: v === "any" ? null : v })}
          >
            <ToggleGroupItem value="any" className={TOGGLE}>
              Any
            </ToggleGroupItem>
            {inspection.map((c) => (
              <ToggleGroupItem key={c.value} value={c.value} className={TOGGLE}>
                {c.label} <span className="text-xs text-muted-foreground">{c.count.toLocaleString()}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Section>
        <Section title="Approved sources">
          <CheckRow
            id="has-sources"
            checked={f.hasSources}
            onChange={(hasSources) => apply({ hasSources })}
            label="Only items with a published approved-source list"
          />
        </Section>
        <ChecklistSection title="Posted on DIBBS" choices={posted} selected={f.posted} onChange={(posted) => apply({ posted })} />
        <ChecklistSection title="Buying office" choices={office} selected={f.office} onChange={(office) => apply({ office })} />
        <ChecklistSection
          title="Acquisition method (AMSC)"
          hint="How the item can be bought: competitive, approved sources only, sole source…"
          choices={amsc}
          selected={f.amsc}
          onChange={(amsc) => apply({ amsc })}
        />
        <Section title="Closed RFQs">
          <CheckRow
            id="include-closed"
            checked={f.includeClosed}
            onChange={(includeClosed) => apply({ includeClosed })}
            label="Include RFQs whose return-by date has passed"
          />
        </Section>
      </div>
    </ResponsivePopover>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ChecklistSection({
  title,
  hint,
  choices,
  selected,
  onChange,
}: {
  title: string;
  hint?: string;
  choices: FacetChoice[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Section title={title} hint={hint}>
      <div className="space-y-1.5">
        {choices.map((c) => (
          <CheckRow
            key={c.value}
            id={`${title}-${c.value}`}
            checked={selected.includes(c.value)}
            onChange={(on) => onChange(on ? [...selected, c.value] : selected.filter((v) => v !== c.value))}
            label={c.label}
            hint={c.hint}
            count={c.count}
          />
        ))}
      </div>
    </Section>
  );
}

function CheckRow({
  id,
  checked,
  onChange,
  label,
  hint,
  count,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  count?: number;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <Label htmlFor={id} className="flex-1 flex-col items-start gap-0 font-normal leading-snug">
        <span>{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </Label>
      {count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{count.toLocaleString()}</span>}
    </div>
  );
}

function NumberField({ label, value, onCommit }: { label: string; value: number | null; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value?.toString() ?? "");
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value?.toString() ?? "");
  }
  const commit = () => {
    const next = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
    if (next !== value) onCommit(next);
  };
  return (
    <Input
      inputMode="numeric"
      placeholder={label}
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className="h-7 w-24"
    />
  );
}

function ActiveChips({ f, facets, apply }: { f: Filters; facets: Facets; apply: Apply }) {
  const fscName = (code: string) => facets.fsc.find((o) => o.value === code)?.name;
  const chips: { key: string; label: string; remove: Partial<Filters> }[] = [
    ...(f.closing ? [{ key: "closing", label: `Closes ≤ ${f.closing}d`, remove: { closing: null } }] : []),
    ...(f.closesFrom || f.closesTo
      ? [{ key: "range", label: `Closes ${rangeLabel(f.closesFrom, f.closesTo)}`, remove: { closesFrom: null, closesTo: null } }]
      : []),
    ...f.setAside.map((v) => ({ key: `sa${v}`, label: SET_ASIDES[v] ?? v, remove: { setAside: f.setAside.filter((x) => x !== v) } })),
    ...f.fsc.map((v) => ({ key: `fsc${v}`, label: `${v} ${fscName(v) ?? ""}`.trim(), remove: { fsc: f.fsc.filter((x) => x !== v) } })),
    ...f.type.map((v) => ({ key: `t${v}`, label: SOLICITATION_TYPES[v] ?? v, remove: { type: f.type.filter((x) => x !== v) } })),
    ...f.posted.map((v) => ({ key: `p${v}`, label: `Posted ${formatDate(v)}`, remove: { posted: f.posted.filter((x) => x !== v) } })),
    ...f.office.map((v) => ({ key: `o${v}`, label: officeLabel(v), remove: { office: f.office.filter((x) => x !== v) } })),
    ...f.amsc.map((v) => ({ key: `a${v}`, label: `AMSC ${v}`, remove: { amsc: f.amsc.filter((x) => x !== v) } })),
    ...(f.inspection ? [{ key: "insp", label: `Inspect at ${POINTS[f.inspection] ?? f.inspection}`, remove: { inspection: null } }] : []),
    ...(f.qtyMin !== null ? [{ key: "qmin", label: `Qty ≥ ${f.qtyMin.toLocaleString()}`, remove: { qtyMin: null } }] : []),
    ...(f.qtyMax !== null ? [{ key: "qmax", label: `Qty ≤ ${f.qtyMax.toLocaleString()}`, remove: { qtyMax: null } }] : []),
    ...(f.deliveryMax !== null ? [{ key: "dmax", label: `Delivery ≤ ${f.deliveryMax}d`, remove: { deliveryMax: null } }] : []),
    ...(f.hasSources ? [{ key: "src", label: "Has approved sources", remove: { hasSources: false } }] : []),
    ...(f.includeClosed ? [{ key: "closed", label: "Including closed", remove: { includeClosed: false } }] : []),
  ];
  if (!chips.length) return null;
  const { q, sort, size, id } = f;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => apply(c.remove)}
          className="inline-flex animate-in items-center gap-1 rounded-full border border-primary/20 bg-accent py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-accent-foreground transition-colors duration-150 fade-in-0 zoom-in-95 hover:border-primary/40 hover:bg-primary/10"
        >
          {c.label}
          <XIcon className="size-3 text-muted-foreground" />
        </button>
      ))}
      {activeFilterCount(f) > 1 && (
        <Button variant="link" size="xs" onClick={() => apply({ ...DEFAULT_FILTERS, q, sort, size, id })}>
          Clear all
        </Button>
      )}
    </div>
  );
}
