"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useOptimistic } from "react";
import { Button } from "@/components/ui/button";
import { type Filters, hrefWith, lineItemId } from "@/lib/rfqs/filters";
import { formatNsn, officeLabel, SET_ASIDE_DESCRIPTIONS, SET_ASIDES, SOLICITATION_TYPES } from "@/lib/rfqs/labels";
import type { RfqRow } from "@/lib/rfqs/queries";
import { cn } from "@/lib/utils";
import { Closing } from "./closing";

const COLUMNS = "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_6rem_minmax(0,1.1fr)_7.5rem]";

export function ResultsList({
  rows,
  filters,
  today,
  page,
  pageCount,
}: {
  rows: RfqRow[];
  filters: Filters;
  today: string;
  page: number;
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
      <div className="px-4 py-16 text-center">
        <p className="font-medium">No RFQs match these filters.</p>
        <p className="mt-1 text-sm text-muted-foreground">Try a broader search, or remove a filter above.</p>
      </div>
    );
  }

  const sortHeader = (label: string, sort: Filters["sort"]) => (
    <Link
      href={hrefWith(filters, { sort })}
      scroll={false}
      className={cn("hover:text-foreground", filters.sort === sort && "text-foreground")}
    >
      {label}
      {filters.sort === sort && " ↓"}
    </Link>
  );

  return (
    <div data-selecting={pending ? "" : undefined}>
      <div
        className={cn(
          "sticky top-0 z-10 hidden gap-4 border-b bg-background/95 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur md:grid",
          COLUMNS,
        )}
      >
        <span>Item</span>
        <span>Solicitation · NSN</span>
        <span className="text-right">{sortHeader("Qty", "qty")}</span>
        <span>Set-aside · Award</span>
        <span className="text-right">{sortHeader("Closes", "closing")}</span>
      </div>
      <ul>
        {rows.map((row) => {
          const id = lineItemId(row.solicitationNumber, row.prNumber);
          const href = hrefWith(filters, { id });
          const active = selected === id;
          return (
            <li key={id}>
              <Link
                href={href}
                scroll={false}
                prefetch={false}
                onClick={(e) => open(e, id, href)}
                aria-current={active || undefined}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b px-4 py-2.5 text-sm transition-colors hover:bg-muted/60",
                  COLUMNS,
                  active && "bg-primary/5 shadow-[inset_3px_0_0_var(--color-primary)] hover:bg-primary/10",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.nomenclature.replace(/,+$/, "")}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.fsc ? `${row.fsc} · ${row.fscName ?? "Unknown class"}` : "Part-numbered item"}
                  </p>
                  {row.matchedSource && (
                    <p className="mt-0.5 truncate text-xs text-sky-700 dark:text-sky-400">Matched approved part {row.matchedSource}</p>
                  )}
                </div>

                <div className="row-span-2 text-right md:order-last md:row-span-1">
                  <Closing date={row.returnByDate} today={today} className="text-sm" />
                  {row.extendedDays ? (
                    <p className="text-xs text-violet-700 dark:text-violet-400">Extended +{row.extendedDays}d</p>
                  ) : null}
                  <p className="text-xs tabular-nums text-muted-foreground md:hidden">
                    {row.quantity.toLocaleString()} {row.unitOfIssue}
                  </p>
                </div>

                <div className="min-w-0 font-mono text-xs leading-5 text-muted-foreground md:text-[0.8rem]">
                  <p className="truncate text-foreground/80">{row.solicitationNumber}</p>
                  <p className="truncate">{formatNsn(row.nsn)}</p>
                </div>

                <div className="hidden text-right tabular-nums md:block">
                  <p>{row.quantity.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{row.unitOfIssue}</p>
                </div>

                <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs md:col-span-1 md:block md:space-y-0.5">
                  <p>
                    <SetAside code={row.setAside} />
                  </p>
                  <p className="text-muted-foreground">
                    {SOLICITATION_TYPES[row.solicitationType ?? ""] ?? "—"}
                    {row.sourceCount > 0 && ` · ${row.sourceCount} source${row.sourceCount === 1 ? "" : "s"}`}
                  </p>
                  <p className="truncate text-muted-foreground md:hidden">· {officeLabel(row.buyingOffice)}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {pageCount > 1 && (
        <nav className="flex items-center justify-between gap-2 px-4 py-4 text-sm text-muted-foreground" aria-label="Pagination">
          <span className="tabular-nums">
            Page {page} of {pageCount.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <PageLink filters={filters} page={page - 1} disabled={page <= 1}>
              <ChevronLeftIcon /> Previous
            </PageLink>
            <PageLink filters={filters} page={page + 1} disabled={page >= pageCount}>
              Next <ChevronRightIcon />
            </PageLink>
          </div>
        </nav>
      )}
    </div>
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

export function SetAside({ code }: { code: string }) {
  if (code === "N") return <span className="text-muted-foreground">Unrestricted</span>;
  return (
    <span
      title={SET_ASIDE_DESCRIPTIONS[code]}
      className="inline-flex rounded-sm bg-emerald-50 px-1.5 py-px font-medium text-emerald-800 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950 dark:text-emerald-300"
    >
      {SET_ASIDES[code] ?? code}
    </span>
  );
}
