import { daysBetween, formatDate } from "@/lib/rfqs/labels";
import { cn } from "@/lib/utils";

export function closingTone(days: number) {
  if (days < 0) return "closed";
  if (days <= 1) return "urgent";
  if (days <= 3) return "soon";
  return "normal";
}

export function relativeDays(days: number) {
  return days < 0 ? "closed" : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

/** Return-by date as a pill whose color says how urgent it is. */
export function Closing({ date, today, className }: { date: string; today: string; className?: string }) {
  const days = daysBetween(today, date);
  const tone = closingTone(days);
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium whitespace-nowrap tabular-nums",
        tone === "closed" && "text-muted-foreground line-through",
        tone === "urgent" && "bg-red-50 text-red-700 ring-1 ring-red-600/15 ring-inset dark:bg-red-950/50 dark:text-red-300",
        tone === "soon" && "bg-amber-50 text-amber-800 ring-1 ring-amber-600/20 ring-inset dark:bg-amber-950/50 dark:text-amber-300",
        tone === "normal" && "text-foreground",
        className,
      )}
      title={`Return by ${formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
    >
      {formatDate(date)}
      <span className="text-xs font-normal opacity-75">{relativeDays(days)}</span>
    </span>
  );
}
