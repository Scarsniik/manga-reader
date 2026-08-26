import React, { useEffect, useRef, useState } from "react";
import type { BookmarkFrequentStatsKind } from "@/renderer/components/ScraperBookmarks/bookmarkFrequentStats.worker";

type Props = {
  disabled?: boolean;
  onOpen: (kind: BookmarkFrequentStatsKind) => void;
  onOpenInWorkspace: (kind: BookmarkFrequentStatsKind) => void;
};

const MIDDLE_BUTTON = 1;

const OPTIONS: Array<{ kind: BookmarkFrequentStatsKind; label: string }> = [
  { kind: "tags", label: "Tags fréquents" },
  { kind: "authors", label: "Auteurs fréquents" },
];

export default function ScraperBookmarkStatsMenu({
  disabled = false,
  onOpen,
  onOpenInWorkspace,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeOnOutsideInteraction = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="scraper-bookmarks-view__stats-menu">
      <button
        type="button"
        className="scraper-bookmarks-view__clear"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        Comptages
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="scraper-bookmarks-view__stats-menu-popover" role="menu">
          {OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpen(option.kind);
              }}
              onMouseDown={(event) => {
                if (event.button === MIDDLE_BUTTON) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              onAuxClick={(event) => {
                if (event.button !== MIDDLE_BUTTON) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                onOpenInWorkspace(option.kind);
              }}
              title={`${option.label}. Clic molette : nouvel onglet workspace`}
              data-prevent-middle-click-autoscroll="true"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
