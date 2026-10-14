"use client";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsTabletUp } from "./hooks";

/** A popover on tablet and desktop; a bottom drawer on phones, as mobile users expect. */
export function ResponsivePopover({
  trigger,
  title,
  description,
  children,
  align = "start",
  className,
  open,
  onOpenChange,
  showDone = true,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Phones get a "Done" footer unless the content brings its own buttons. */
  showDone?: boolean;
}) {
  const tabletUp = useIsTabletUp();
  if (tabletUp) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align={align} className={className}>
          {children}
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="max-h-[88dvh]">
        <DrawerHeader className="text-left!">
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-2", "[&_[data-slot=command-list]]:max-h-none")}>{children}</div>
        {showDone && (
          <DrawerFooter className="border-t">
            <DrawerClose asChild>
              <Button size="lg">Done</Button>
            </DrawerClose>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
