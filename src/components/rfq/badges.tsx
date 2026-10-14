import { SET_ASIDE_DESCRIPTIONS, SET_ASIDES } from "@/lib/rfqs/labels";
import { cn } from "@/lib/utils";

/** Restricted set-asides get a green badge; unrestricted stays quiet. */
export function SetAside({ code, className }: { code: string; className?: string }) {
  if (code === "N") return <span className={cn("text-[13px] text-muted-foreground", className)}>Unrestricted</span>;
  return (
    <span
      title={SET_ASIDE_DESCRIPTIONS[code]}
      className={cn(
        "inline-flex w-fit rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-emerald-800 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-950 dark:text-emerald-300",
        className,
      )}
    >
      {SET_ASIDES[code] ?? code}
    </span>
  );
}
