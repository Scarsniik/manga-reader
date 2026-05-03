import React from "react";
import LanguageFlags from "@/renderer/components/LanguageFlags/LanguageFlags";
import {
  getMultiSearchLanguageFilterMode,
  toggleMultiSearchLanguageFilterMode,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
} from "@/renderer/components/MultiSearch/types";
import { getLanguageLabel } from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  ScraperBookmarkFilterState,
  ScraperBookmarkReadingStatus,
  ScraperBookmarkSortKey,
} from "@/renderer/components/ScraperBookmarks/bookmarkFiltering";
import { DEFAULT_BOOKMARK_FILTERS } from "@/renderer/components/ScraperBookmarks/bookmarkFiltering";

type Props = {
  filters: ScraperBookmarkFilterState;
  languageCodes: string[];
  resultCount: number;
  totalCount: number;
  onChange: (filters: ScraperBookmarkFilterState) => void;
};

const READING_STATUS_OPTIONS: Array<{
  value: ScraperBookmarkReadingStatus;
  label: string;
}> = [
  { value: "unread", label: "Non lu" },
  { value: "inProgress", label: "En cours" },
  { value: "read", label: "Lu" },
];

const SORT_OPTIONS: Array<{
  value: ScraperBookmarkSortKey;
  label: string;
}> = [
  { value: "created-desc", label: "Ajout recent" },
  { value: "created-asc", label: "Ajout ancien" },
  { value: "updated-desc", label: "Maj recente" },
  { value: "title-asc", label: "Titre A-Z" },
  { value: "title-desc", label: "Titre Z-A" },
  { value: "page-desc", label: "Pages decroissant" },
  { value: "page-asc", label: "Pages croissant" },
  { value: "scraper-asc", label: "Scrapper A-Z" },
];

const countActiveFilters = (filters: ScraperBookmarkFilterState): number => (
  (filters.query.trim() ? 1 : 0)
  + Object.values(filters.languageFilterModes).filter((mode) => mode === "only" || mode === "without").length
  + (filters.minPages.trim() ? 1 : 0)
  + (filters.maxPages.trim() ? 1 : 0)
  + filters.readingStatuses.length
  + (filters.sortBy !== DEFAULT_BOOKMARK_FILTERS.sortBy ? 1 : 0)
);

const updateLanguageFilterMode = (
  modes: MultiSearchLanguageFilterModes,
  languageCode: string,
  toggledMode: Exclude<MultiSearchLanguageFilterMode, "default">,
): MultiSearchLanguageFilterModes => {
  const currentMode = getMultiSearchLanguageFilterMode(modes, languageCode);
  const nextMode = toggleMultiSearchLanguageFilterMode(currentMode, toggledMode);
  const nextModes = {
    ...modes,
    [languageCode]: nextMode,
  };

  if (nextMode === "default") {
    delete nextModes[languageCode];
  }

  return nextModes;
};

export default function ScraperBookmarkFilters({
  filters,
  languageCodes,
  resultCount,
  totalCount,
  onChange,
}: Props) {
  const activeFilterCount = countActiveFilters(filters);
  const selectedStatuses = new Set(filters.readingStatuses);

  const updateFilters = (partial: Partial<ScraperBookmarkFilterState>) => {
    onChange({
      ...filters,
      ...partial,
    });
  };

  const toggleReadingStatus = (status: ScraperBookmarkReadingStatus) => {
    updateFilters({
      readingStatuses: selectedStatuses.has(status)
        ? filters.readingStatuses.filter((value) => value !== status)
        : [...filters.readingStatuses, status],
    });
  };

  const toggleLanguageMode = (
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => {
    updateFilters({
      languageFilterModes: updateLanguageFilterMode(filters.languageFilterModes, languageCode, mode),
    });
  };

  return (
    <div className="scraper-bookmarks-view__filters">
      <div className="scraper-bookmarks-view__filters-head">
        <strong>{`${resultCount}/${totalCount} bookmark(s)`}</strong>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_BOOKMARK_FILTERS)}
          disabled={activeFilterCount === 0}
        >
          Reinitialiser
        </button>
      </div>

      <div className="scraper-bookmarks-view__filters-grid">
        <label className="scraper-bookmarks-view__field is-wide">
          <span>Recherche</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => updateFilters({ query: event.target.value })}
            placeholder="Titre, auteur, tag..."
          />
        </label>

        <label className="scraper-bookmarks-view__field">
          <span>Tri</span>
          <select
            value={filters.sortBy}
            onChange={(event) => updateFilters({ sortBy: event.target.value as ScraperBookmarkSortKey })}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="scraper-bookmarks-view__field">
          <span>Pages min</span>
          <input
            type="number"
            min="1"
            value={filters.minPages}
            onChange={(event) => updateFilters({ minPages: event.target.value })}
          />
        </label>

        <label className="scraper-bookmarks-view__field">
          <span>Pages max</span>
          <input
            type="number"
            min="1"
            value={filters.maxPages}
            onChange={(event) => updateFilters({ maxPages: event.target.value })}
          />
        </label>

        <fieldset className="scraper-bookmarks-view__field scraper-bookmarks-view__field-group">
          <legend>Lecture</legend>
          <div className="scraper-bookmarks-view__checkboxes">
            {READING_STATUS_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={selectedStatuses.has(option.value)}
                  onChange={() => toggleReadingStatus(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="scraper-bookmarks-view__field scraper-bookmarks-view__language-field">
          <span>Langues</span>
          <div className="scraper-bookmarks-view__language-filter-bar">
            {languageCodes.length ? languageCodes.map((languageCode) => {
              const filterMode = getMultiSearchLanguageFilterMode(filters.languageFilterModes, languageCode);
              const languageLabel = getLanguageLabel(languageCode);

              return (
                <button
                  key={languageCode}
                  type="button"
                  className={[
                    "scraper-bookmarks-view__language-button",
                    `is-${filterMode}`,
                  ].join(" ")}
                  onClick={() => toggleLanguageMode(languageCode, "only")}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    toggleLanguageMode(languageCode, "without");
                  }}
                  title={languageLabel}
                  aria-label={`${languageLabel} : ${filterMode}`}
                >
                  <LanguageFlags languageCodes={[languageCode]} />
                </button>
              );
            }) : (
              <span className="scraper-bookmarks-view__language-empty">Aucune langue</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
