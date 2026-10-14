"use client";

import { useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { isTypingTarget, overlayOpen, useIsDesktop } from "./hooks";
import { useNav } from "./navigation";

const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

/**
 * Results plus the line-item panel. On desktop the table shrinks as the panel grows in
 * (animated grid track); below lg the panel is a bottom drawer.
 */
export function DetailLayout({ detailId, detail, children }: { detailId: string | null; detail: React.ReactNode; children: React.ReactNode }) {
  const { f, select } = useNav();
  const desktop = useIsDesktop();
  const open = f.id !== null;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the last panel on screen while it slides out, or dimmed while the next one loads.
  const [last, setLast] = useState<React.ReactNode>(detail);
  if (detail && detail !== last) setLast(detail);

  const content = !open ? (
    last
  ) : detailId === f.id ? (
    detail
  ) : detailId !== null ? (
    <div className="pointer-events-none opacity-50 transition-opacity">{last}</div>
  ) : (
    <PanelSkeleton />
  );

  useEffect(() => {
    if (detailId) scrollRef.current?.scrollTo({ top: 0 });
  }, [detailId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isTypingTarget(e.target) && !overlayOpen()) select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col [--panel:26rem] motion-safe:transition-[grid-template-columns] motion-safe:duration-300 lg:grid lg:grid-rows-[minmax(0,1fr)] xl:[--panel:30rem] 2xl:[--panel:34rem]",
          EASE,
        )}
        style={{ gridTemplateColumns: `minmax(0,1fr) ${open && desktop ? "var(--panel)" : "0rem"}` }}
      >
        {children}
        <aside aria-label="Line item details" inert={!open} className="hidden min-h-0 overflow-hidden lg:block">
          <div
            className={cn(
              "ml-4 h-full w-[calc(var(--panel)-1rem)] motion-safe:transition-[opacity,translate] motion-safe:duration-300",
              EASE,
              open ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0",
            )}
          >
            <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain rounded-xl border bg-card shadow-sm">
              {desktop && content}
            </div>
          </div>
        </aside>
      </div>
      {!desktop && (
        <Drawer open={open} onOpenChange={(o) => !o && select(null)}>
          <DrawerContent className="max-h-[92dvh]" aria-describedby={undefined}>
            <DrawerTitle className="sr-only">Line item details</DrawerTitle>
            <div className="min-h-0 overflow-y-auto overscroll-contain">{content}</div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}

function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-5 p-5" aria-label="Loading details">
      <div className="space-y-2">
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-6 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted/70" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 bg-card p-3">
            <div className="h-2.5 w-1/2 rounded bg-muted" />
            <div className="h-5 w-2/3 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="h-8 w-32 rounded-lg bg-muted" />
        <div className="h-8 w-36 rounded-lg bg-muted/70" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-24 rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}
