import React, { FormEvent } from "react";
import type {
  MultiSearchAdvancedPages,
  MultiSearchDepthMode,
  MultiSearchPageLimit,
  MultiSearchPaceMode,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";

type Props = {
  query: string;
  depthMode: MultiSearchDepthMode;
  advancedPages: MultiSearchAdvancedPages;
  paceMode: MultiSearchPaceMode;
  viewMode: MultiSearchViewMode;
  isSearching: boolean;
  canSubmit: boolean;
  canStopSearch: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStopSearch: () => void;
  onQueryChange: (value: string) => void;
  onDepthModeChange: (value: MultiSearchDepthMode) => void;
  onAdvancedPagesChange: (value: MultiSearchAdvancedPages) => void;
  onPaceModeChange: (value: MultiSearchPaceMode) => void;
  onViewModeChange: (value: MultiSearchViewMode) => void;
};

const DEPTH_PAGE_OPTIONS = [1, 2, 3, 5, 10, 20];

export const getDepthPages = (
  depthMode: MultiSearchDepthMode,
  advancedPages: MultiSearchAdvancedPages,
): MultiSearchPageLimit => {
  if (depthMode === "extended") {
    return 3;
  }

  if (depthMode === "advanced") {
    return advancedPages === "maximum" ? null : advancedPages;
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
  canStopSearch,
  onSubmit,
  onStopSearch,
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
        <button
          type="button"
          className="secondary"
          onClick={onStopSearch}
          disabled={!canStopSearch}
        >
          Arreter
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
              onChange={(event) => {
                const value = event.target.value;
                onAdvancedPagesChange(value === "maximum" ? "maximum" : Number(value));
              }}
              aria-label="Pages par scrapper"
            >
              {DEPTH_PAGE_OPTIONS.map((pageCount) => (
                <option key={pageCount} value={pageCount}>{pageCount} page(s)</option>
              ))}
              <option value="maximum">Maximum</option>
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
