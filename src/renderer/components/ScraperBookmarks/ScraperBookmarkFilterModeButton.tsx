import React from "react";

type ScraperBookmarkFilterMode = "default" | "only" | "without";

type Props = {
  ariaLabel: string;
  children: React.ReactNode;
  mode: ScraperBookmarkFilterMode;
  onToggle: (mode: Exclude<ScraperBookmarkFilterMode, "default">) => void;
  title: string;
};

export default function ScraperBookmarkFilterModeButton({
  ariaLabel,
  children,
  mode,
  onToggle,
  title,
}: Props) {
  return (
    <button
      type="button"
      className={[
        "scraper-bookmarks-view__filter-mode-button",
        `is-${mode}`,
      ].join(" ")}
      onClick={() => onToggle("only")}
      onContextMenu={(event) => {
        event.preventDefault();
        onToggle("without");
      }}
      title={title}
      aria-label={`${ariaLabel} : ${mode}`}
    >
      {children}
    </button>
  );
}
