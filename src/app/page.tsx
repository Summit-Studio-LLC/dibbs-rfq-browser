import { Suspense } from "react";
import { LogoMark } from "@/components/brand/logo-mark";
import { Browser, BrowserSkeleton, DataStatus } from "@/components/rfq/browser";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col md:h-dvh">
      <header className="shrink-0 border-b bg-card">
        <div className="mx-auto flex w-full max-w-[1680px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <LogoMark className="size-9 shrink-0 drop-shadow-sm" />
          <div className="min-w-0">
            <h1 className="text-base leading-tight font-semibold tracking-tight">DIBBS RFQ Browser</h1>
            <p className="truncate text-xs text-muted-foreground">Open DLA requests for quotation from dibbs.bsm.dla.mil</p>
          </div>
          <div className="ml-auto hidden md:block">
            <Suspense fallback={null}>
              <DataStatus />
            </Suspense>
          </div>
        </div>
      </header>
      <Suspense fallback={<BrowserSkeleton />}>
        <Browser searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
