"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Matches a media query; assumes desktop during SSR and hydration. */
export function useMediaQuery(query: string, serverValue = true) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
export const useIsTabletUp = () => useMediaQuery("(min-width: 768px)");

/** Keyboard shortcuts shouldn't fire while the user is typing or working inside a menu or dialog. */
export function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=listbox], [role=dialog]")
  );
}

/** A Radix popover/menu or a drawer is open: Escape belongs to it, not to the page. */
export const overlayOpen = () => !!document.querySelector("[data-radix-popper-content-wrapper], [role=dialog], [data-vaul-drawer]");
