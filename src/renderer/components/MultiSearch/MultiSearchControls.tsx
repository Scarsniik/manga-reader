import React, { FormEvent } from "react";
import type {
  MultiSearchDepthMode,
  MultiSearchPaceMode,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";

type Props = {
  query: string;
  depthMode: MultiSearchDepthMode;
  advancedPages: number;
  paceMode: MultiSearchPaceMode;
  viewMode: MultiSearchViewMode;
  isSearching: boolean;
  canSubmit: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onQueryChange: (value: string) => void;
  onDepthModeChange: (value: MultiSearchDepthMode) => void;
  onAdvancedPagesChange: (value: number) => void;
  onPaceModeChange: (value: MultiSearchPaceMode) => void;
  onViewModeChange: (value: MultiSearchViewMode) => void;
};

const DEPTH_PAGE_OPTIONS = [1, 2, 3, 5, 10];

export const getDepthPages = (depthMode: MultiSearchDepthMode, advancedPages: number): number => {
  if (depthMode === "extended") {
    return 3;
  }

  if (depthMode === "advanced") {
    return advancedPages;
  }

  return 1;
};

export default function MultiSearchControls({
  query,
  depthMode,
  advancedPages,
  paceMode,
  viewMode,
  isSearching,
  canSubmit,
  onSubmit,
  onQueryChange,
  onDepthModeChange,
  onAdvancedPagesChange,
  onPaceModeChange,
  onViewModeChange,
}: Props) {
  return (
    <form className="multi-search__panel multi-search__form" onSubmit={onSubmit}>
      <div className="multi-search__query-row">
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="One Piece, Naruto, Bleach..."
        />
        <button type="submit" disabled={isSearching || !canSubmit}>
          {isSearching ? "Recherche..." : "Lancer"}
        </button>
      </div>

      <div className="multi-search__controls-grid">
        <div className="multi-search__control">
          <strong>Profondeur</strong>
          <div className="multi-search__segmented">
            {([
              ["quick", "Rapide : 1 page"],
              ["extended", "Etendue : 3 pages"],
              ["advanced", "Avancee"],
            ] as Array<[MultiSearchDepthMode, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={depthMode === value ? "is-active" : ""}
                onClick={() => onDepthModeChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {depthMode === "advanced" ? (
            <select
              value={advancedPages}
              onChange={(event) => onAdvancedPagesChange(Number(event.target.value))}
              aria-label="Pages par scrapper"
            >
              {DEPTH_PAGE_OPTIONS.map((pageCount) => (
                <option key={pageCount} value={pageCount}>{pageCount} page(s)</option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="multi-search__control">
          <strong>Rythme de recherche</strong>
          <div className="multi-search__segmented">
            {([
              ["fast", "Rapide"],
              ["careful", "Prudent"],
            ] as Array<[MultiSearchPaceMode, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={paceMode === value ? "is-active" : ""}
                onClick={() => onPaceModeChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <span>
            {paceMode === "fast"
              ? "Plus reactif, peut echouer sur certains sites."
              : "Plus lent, mais plus stable sur les sites sensibles."}
          </span>
        </div>

        <div className="multi-search__control">
          <strong>Vue</strong>
          <div className="multi-search__segmented">
            {([
              ["merged", "Fusionnee"],
              ["byScraper", "Par scrapper"],
            ] as Array<[MultiSearchViewMode, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={viewMode === value ? "is-active" : ""}
                onClick={() => onViewModeChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}
