import { daysBetween, formatDate } from "@/lib/rfqs/labels";
import { cn } from "@/lib/utils";

/** "Oct 16 · 2 days" with urgency color. */
export function Closing({ date, today, className }: { date: string; today: string; className?: string }) {
  const days = daysBetween(today, date);
  const rel = days < 0 ? "closed" : days === 0 ? "today" : days === 1 ? "tomorrow" : `${days} days`;
  return (
    <span
      className={cn(
        "tabular-nums",
        days < 0 ? "text-muted-foreground line-through" : days <= 1 ? "text-red-600 dark:text-red-400" : days <= 3 && "text-amber-600 dark:text-amber-400",
        className,
      )}
      title={`Return by ${formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
    >
      {formatDate(date)} <span className="text-xs opacity-80">· {rel}</span>
    </span>
  );
}
