import { connection } from "next/server";
import { parseFilters, type RawParams } from "@/lib/rfqs/filters";
import { formatDate, todayEastern } from "@/lib/rfqs/labels";
import { getFacets, getFreshness, getRfqDetail, searchRfqs } from "@/lib/rfqs/queries";
import { cn } from "@/lib/utils";
import { DetailPanel } from "./detail-panel";
import { FilterBar } from "./filter-bar";
import { ResultsList } from "./results-list";

export async function Browser({ searchParams }: { searchParams: Promise<RawParams> }) {
  const filters = parseFilters(await searchParams);
  await connection(); // "today" and the data must be read per request, never in a prerender
  const today = todayEastern();
  const [results, facets, freshness, detail] = await Promise.all([
    searchRfqs(filters),
    getFacets(filters),
    getFreshness(),
    filters.id ? getRfqDetail(filters.id) : undefined,
  ]);

  return (
    <div className="group flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-4 pt-3 pb-3 sm:px-6">
        <FilterBar filters={filters} facets={facets} total={results.total} />
        <Freshness {...freshness} />
      </div>
      <div className={cn("min-h-0 flex-1 lg:grid", detail !== undefined && "lg:grid-cols-[minmax(0,1fr)_minmax(24rem,32rem)]")}>
        <main className="transition-opacity group-has-data-filtering:opacity-50 lg:overflow-y-auto">
          <ResultsList rows={results.rows} filters={filters} today={today} page={filters.page} pageCount={results.pageCount} />
        </main>
        {detail !== undefined && (
          <aside className="fixed inset-0 z-40 overflow-y-auto bg-background transition-opacity group-has-data-selecting:opacity-50 lg:static lg:z-auto lg:border-l">
            <DetailPanel item={detail} filters={filters} today={today} />
          </aside>
        )}
      </div>
    </div>
  );
}

function Freshness({ days, earliest, latest, ingestedAt }: Awaited<ReturnType<typeof getFreshness>>) {
  if (!latest || !earliest) return <p className="mt-2 text-xs text-muted-foreground">No DIBBS data loaded yet.</p>;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      DIBBS posting days {formatDate(earliest)}–{formatDate(latest)} ({days.length} files)
      {ingestedAt && ` · refreshed ${ingestedAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`}
    </p>
  );
}

export function BrowserSkeleton() {
  return (
    <div className="flex-1 animate-pulse">
      <div className="space-y-3 border-b px-4 py-3 sm:px-6">
        <div className="h-10 rounded-lg bg-muted" />
        <div className="flex gap-2">
          {[40, 24, 28, 24, 28].map((w, i) => (
            <div key={i} className="h-7 rounded-lg bg-muted" style={{ width: `${w * 0.25}rem` }} />
          ))}
        </div>
        <div className="h-4 w-40 rounded bg-muted" />
      </div>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="space-y-2 border-b px-4 py-3 sm:px-6">
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted/70" />
        </div>
      ))}
    </div>
  );
}
