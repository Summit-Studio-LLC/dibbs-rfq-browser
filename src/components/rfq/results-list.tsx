"use client";

import { ChevronLeftIcon, ChevronRightIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import { Button } from "@/components/ui/button";
import { type Filters, hrefWith, lineItemId, PAGE_SIZE } from "@/lib/rfqs/filters";
import { formatNsn, SET_ASIDE_DESCRIPTIONS, SET_ASIDES, SOLICITATION_TYPES } from "@/lib/rfqs/labels";
import type { RfqRow } from "@/lib/rfqs/queries";
import { cn } from "@/lib/utils";
import { Closing } from "./closing";
import { CopyButton } from "./copy-button";

const COLUMNS = "md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_5.5rem_minmax(0,1.2fr)_8.5rem]";
const ROW_COPY = "md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100";

export function ResultsList({
  rows,
  filters,
  today,
  total,
  pageCount,
}: {
  rows: RfqRow[];
  filters: Filters;
  today: string;
  total: number;
  pageCount: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useOptimistic(filters.id);
  const [pending, setPending] = useOptimistic(false);

  const open = (e: React.MouseEvent, id: string, href: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let the browser open a new tab
    e.preventDefault();
    startTransition(() => {
      setSelected(id);
      setPending(true);
      router.replace(href, { scroll: false });
    });
  };

  if (!rows.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <SearchXIcon className="size-8 text-muted-foreground/60" />
        <p className="mt-3 font-semibold">No RFQs match these filters</p>
        <p className="mt-1 text-sm text-muted-foreground">Try a broader search, or remove a filter above.</p>
      </div>
    );
  }

  const sortHeader = (label: string, sort: Filters["sort"]) => (
    <Link href={hrefWith(filters, { sort })} scroll={false} className={cn("hover:text-foreground", filters.sort === sort && "text-foreground")}>
      {label}
      {filters.sort === sort && " ↓"}
    </Link>
  );
  const first = (filters.page - 1) * PAGE_SIZE + 1;

  return (
    <>
      <div data-selecting={pending ? "" : undefined} className="min-h-0 flex-1 lg:overflow-y-auto">
        <div
          className={cn(
            "sticky top-0 z-20 hidden gap-4 border-b bg-muted/85 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur md:grid",
            COLUMNS,
          )}
        >
          <span>Item</span>
          <span>Solicitation · NSN</span>
          <span className="text-right">{sortHeader("Qty", "qty")}</span>
          <span>Eligibility · Award</span>
          <span className="text-right">{sortHeader("Closes", "closing")}</span>
        </div>
        <ul className="divide-y">
          {rows.map((row) => {
            const id = lineItemId(row.solicitationNumber, row.prNumber);
            const href = hrefWith(filters, { id });
            const active = selected === id;
            const nsn = formatNsn(row.nsn);
            return (
              <li
                key={id}
                className={cn(
                  "group/row relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-accent/50 md:items-center",
                  COLUMNS,
                  active && "bg-primary/[0.06] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary hover:bg-primary/[0.08]",
                )}
              >
                <div className="min-w-0">
                  <Link
                    href={href}
                    scroll={false}
                    prefetch={false}
                    onClick={(e) => open(e, id, href)}
                    aria-current={active || undefined}
                    className="block truncate text-sm font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                  >
                    {row.nomenclature.replace(/,+$/, "")}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.fsc ? (
                      <>
                        <span className="tabular-nums">{row.fsc}</span> · {row.fscName ?? "Unknown class"}
                      </>
                    ) : (
                      "Part-numbered item"
                    )}
                  </p>
                  {row.matchedSource && (
                    <p className="mt-1 truncate text-xs font-medium text-primary">Matched approved part {row.matchedSource}</p>
                  )}
                </div>

                <div className="row-span-2 flex flex-col items-end gap-0.5 md:order-last md:row-span-1">
                  <Closing date={row.returnByDate} today={today} />
                  {row.extendedDays ? (
                    <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300">Extended +{row.extendedDays}d</span>
                  ) : null}
                  <span className="text-xs text-muted-foreground tabular-nums md:hidden">
                    <span className="font-semibold text-foreground">{row.quantity.toLocaleString()}</span> {row.unitOfIssue}
                  </span>
                </div>

                <div className="min-w-0 font-mono">
                  <div className="flex items-center gap-0.5">
                    <span className="truncate text-[13px] font-medium text-foreground/90">{row.solicitationNumber}</span>
                    <CopyButton value={row.solicitationNumber} label="solicitation number" className={ROW_COPY} />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span className="truncate text-xs text-muted-foreground">{nsn}</span>
                    <CopyButton value={nsn} label="NSN" className={ROW_COPY} />
                  </div>
                </div>

                <div className="hidden text-right md:block">
                  <p className="text-sm font-semibold tabular-nums">{row.quantity.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground uppercase">{row.unitOfIssue}</p>
                </div>

                <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:col-span-1 md:flex-col md:items-start md:gap-0.5">
                  <SetAside code={row.setAside} />
                  <span className="max-w-full truncate text-xs text-muted-foreground" title="Award type · approved sources on file">
                    {SOLICITATION_TYPES[row.solicitationType ?? ""] ?? "Unknown type"}
                    {row.sourceCount > 0 && ` · ${row.sourceCount} source${row.sourceCount === 1 ? "" : "s"}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <nav className="flex shrink-0 items-center justify-between gap-2 border-t bg-card px-4 py-2.5 text-sm" aria-label="Pagination">
        <span className="text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">
            {first.toLocaleString()}–{(first + rows.length - 1).toLocaleString()}
          </span>{" "}
          of {total.toLocaleString()}
        </span>
        {pageCount > 1 && (
          <div className="flex gap-2">
            <PageLink filters={filters} page={filters.page - 1} disabled={filters.page <= 1}>
              <ChevronLeftIcon /> Previous
            </PageLink>
            <PageLink filters={filters} page={filters.page + 1} disabled={filters.page >= pageCount}>
              Next <ChevronRightIcon />
            </PageLink>
          </div>
        )}
      </nav>
    </>
  );
}

function PageLink({ filters, page, disabled, children }: { filters: Filters; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={hrefWith(filters, { page })}>{children}</Link>
    </Button>
  );
}

export function SetAside({ code, className }: { code: string; className?: string }) {
  if (code === "N") return <span className={cn("text-xs text-muted-foreground", className)}>Unrestricted</span>;
  return (
    <span
      title={SET_ASIDE_DESCRIPTIONS[code]}
      className={cn(
        "inline-flex w-fit rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950 dark:text-emerald-300",
        className,
      )}
    >
      {SET_ASIDES[code] ?? code}
    </span>
  );
}
