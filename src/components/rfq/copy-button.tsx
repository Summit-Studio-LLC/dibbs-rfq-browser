"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** One-click copy for identifiers people paste elsewhere (solicitation #, NSN, part #, CAGE). */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={cn(
        "relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring",
        copied && "text-emerald-600 opacity-100! dark:text-emerald-400",
        className,
      )}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
    </button>
  );
}
