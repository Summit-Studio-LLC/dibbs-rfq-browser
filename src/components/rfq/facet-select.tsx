"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FacetOption } from "@/lib/rfqs/queries";
import { cn } from "@/lib/utils";

export type FacetChoice = { value: string; label: string; hint?: string; count: number };

/** Merge facet counts with the current selection, so selected values stay visible even at zero. */
export function facetChoices(
  options: FacetOption[],
  selected: string[],
  label: (value: string, name?: string | null) => string,
  hint?: (value: string) => string | undefined,
): FacetChoice[] {
  const seen = new Set(options.map((o) => o.value));
  const merged: FacetOption[] = [...options, ...selected.filter((v) => !seen.has(v)).map((value) => ({ value, count: 0 }))];
  return merged.map((o) => ({
    value: o.value,
    label: label(o.value, o.name),
    hint: hint?.(o.value),
    count: o.count,
  }));
}

/** Multi-select popover with counts. Each toggle applies immediately. */
export function FacetSelect({
  title,
  choices,
  selected,
  onChange,
  searchable = choices.length > 10,
  className,
}: {
  title: string;
  choices: FacetChoice[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  className?: string;
}) {
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const summary =
    selected.length === 1
      ? (choices.find((c) => c.value === selected[0])?.label ?? selected[0])
      : selected.length > 1
        ? `${selected.length} selected`
        : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("max-w-64", selected.length && "border-primary/40 bg-primary/5", className)}>
          <span className={cn(selected.length && "text-muted-foreground")}>{title}</span>
          {summary && <span className="truncate font-semibold">{summary}</span>}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={`Search ${title.toLowerCase()}…`} />}
          <CommandList className="max-h-80">
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {choices.map((c) => {
                const active = selected.includes(c.value);
                return (
                  <CommandItem
                    key={c.value}
                    value={`${c.value} ${c.label}`}
                    onSelect={() => toggle(c.value)}
                    className="items-start [&>svg:last-child]:hidden"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {active && <CheckIcon className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block">{c.label}</span>
                      {c.hint && <span className="block text-xs text-muted-foreground">{c.hint}</span>}
                    </span>
                    <span className="ml-2 text-xs tabular-nums text-muted-foreground">{c.count.toLocaleString()}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
                Clear {title.toLowerCase()}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
