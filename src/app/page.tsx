import { Suspense } from "react";
import { Browser, BrowserSkeleton } from "@/components/rfq/browser";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex shrink-0 items-baseline gap-3 border-b px-4 py-3 sm:px-6">
        <h1 className="font-semibold tracking-tight">DIBBS RFQ Browser</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">Open DLA requests for quotation, searchable and filterable</p>
      </header>
      <Suspense fallback={<BrowserSkeleton />}>
        <Browser searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
