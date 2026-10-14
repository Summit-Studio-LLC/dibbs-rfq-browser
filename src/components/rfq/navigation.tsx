"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, startTransition, use, useOptimistic } from "react";
import { Button } from "@/components/ui/button";
import { type Filters, hrefWith } from "@/lib/rfqs/filters";

/** What the in-flight navigation will change: the result list, just the page, or just the open item. */
export type Pending = "filter" | "page" | "select" | null;

type Navigation = {
  /** The view as the user last asked for it; updates on the click frame, before the server answers. */
  f: Filters;
  /** The view the rendered rows belong to. */
  committed: Filters;
  pending: Pending;
  apply: (patch: Partial<Filters>) => void;
  hrefFor: (patch: Partial<Filters>) => string;
  select: (id: string | null) => void;
};

const NavigationContext = createContext<Navigation | null>(null);

const kindOf = (patch: Partial<Filters>): Exclude<Pending, null> => {
  const keys = Object.keys(patch);
  if (keys.every((k) => k === "id")) return "select";
  if (keys.every((k) => k === "page" || k === "id")) return "page";
  return "filter";
};

/**
 * One optimistic copy of the URL filters for every control on the page, so a sort click
 * right after a filter change builds on that change instead of racing it.
 */
export function NavigationProvider({ filters, children }: { filters: Filters; children: React.ReactNode }) {
  const router = useRouter();
  const [f, setF] = useOptimistic(filters);
  const [pending, setPending] = useOptimistic<Pending>(null);

  const hrefFor = (patch: Partial<Filters>) => hrefWith(f, patch);
  const apply = (patch: Partial<Filters>) =>
    startTransition(() => {
      const kind = kindOf(patch);
      setF({ ...f, ...(kind === "filter" ? { page: 1 } : {}), ...patch });
      setPending(kind);
      // Pages get history entries (back returns to the previous page); filter tweaks and selection don't.
      if (kind === "page") router.push(hrefFor(patch), { scroll: false });
      else router.replace(hrefFor(patch), { scroll: false });
    });
  const select = (id: string | null) => apply({ id });

  return <NavigationContext value={{ f, committed: filters, pending, apply, hrefFor, select }}>{children}</NavigationContext>;
}

export function useNav() {
  const ctx = use(NavigationContext);
  if (!ctx) throw new Error("useNav must be used inside <NavigationProvider>");
  return ctx;
}

/** True for clicks the browser should handle itself (new tab, new window, download). */
export const isModifiedClick = (e: React.MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

/** A real link to a line item (open-in-new-tab works) that opens it in place on a plain click. */
export function SelectLink({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { select, hrefFor } = useNav();
  return (
    <Link
      href={hrefFor({ id })}
      scroll={false}
      prefetch={false}
      className={className}
      onClick={(e) => {
        if (isModifiedClick(e)) return;
        e.preventDefault();
        select(id);
      }}
    >
      {children}
    </Link>
  );
}

export function CloseDetailButton() {
  const { select } = useNav();
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Close details" title="Close (Esc)" onClick={() => select(null)}>
      <XIcon />
    </Button>
  );
}
