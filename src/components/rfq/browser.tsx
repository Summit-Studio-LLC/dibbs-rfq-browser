import { connection } from "next/server";
import { parseFilters, type RawParams } from "@/lib/rfqs/filters";
import { formatDate, todayEastern } from "@/lib/rfqs/labels";
import { getFacets, getFreshness, getRfqDetail, searchRfqs } from "@/lib/rfqs/queries";
import { cn } from "@/lib/utils";
import { DetailLayout } from "./detail-layout";
import { DetailPanel } from "./detail-panel";
import { FilterBar } from "./filter-bar";
import { NavigationProvider } from "./navigation";
import { ResultsTable } from "./results-table";

const PAGE = "mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-8";

export async function Browser({ searchParams }: { searchParams: Promise<RawParams> }) {
  const filters = parseFilters(await searchParams);
  await connection(); // "today" and the data must be read per request, never in a prerender
  const today = todayEastern();
  const [results, facets, detail] = await Promise.all([
    searchRfqs(filters),
    getFacets(filters),
    filters.id ? getRfqDetail(filters.id) : undefined,
  ]);

  return (
    <NavigationProvider filters={filters}>
      <div className={cn("flex flex-1 flex-col gap-4 py-4 md:min-h-0", PAGE)}>
        <FilterBar facets={facets} today={today} />
        <DetailLayout detailId={filters.id} detail={detail !== undefined ? <DetailPanel item={detail} today={today} /> : null}>
          <ResultsTable rows={results.rows} total={results.total} pageCount={results.pageCount} today={today} />
        </DetailLayout>
      </div>
    </NavigationProvider>
  );
}

/** "DIBBS Oct 9–13 · refreshed Oct 14, 4:54 PM ET" for the page header. */
export async function DataStatus() {
  await connection();
  const { days, earliest, latest, ingestedAt } = await getFreshness();
  if (!latest || !earliest) return <span className="text-xs text-muted-foreground">No DIBBS data loaded yet</span>;
  const refreshed = ingestedAt?.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
      title={`${days.length} DIBBS posting-day files loaded`}
    >
      <span className="size-1.5 rounded-full bg-emerald-500" />
      <span>
        <span className="font-medium text-foreground">
          DIBBS {formatDate(earliest)}–{formatDate(latest)}
        </span>
        {refreshed && ` · refreshed ${refreshed} ET`}
      </span>
    </span>
  );
}

export function BrowserSkeleton() {
  return (
    <div className={cn("flex flex-1 animate-pulse flex-col gap-4 py-5", PAGE)}>
      <div className="h-11 rounded-lg bg-muted" />
      <div className="flex gap-2">
        {[44, 24, 28, 24, 28].map((w, i) => (
          <div key={i} className="h-8 rounded-lg bg-muted" style={{ width: `${w * 0.25}rem` }} />
        ))}
      </div>
      <div className="flex-1 overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="space-y-2 border-b px-4 py-3.5">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
