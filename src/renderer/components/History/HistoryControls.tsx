import React from "react";
import type { ScraperRecord } from "@/shared/scraper";
import {
  HISTORY_MULTI_SOURCE_FILTER,
  type HistoryTabId,
} from "@/renderer/components/History/historyUtils";

type FiltersProps = {
  activeTab: HistoryTabId;
  query: string;
  scraperFilter: string;
  scrapers: ScraperRecord[];
  onQueryChange: (query: string) => void;
  onScraperFilterChange: (scraperId: string) => void;
};

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  resultCount: number;
  onPrevious: () => void;
  onNext: () => void;
};

export function HistoryTabs<TabId extends string>({ tabs, activeTab, onChange, ariaLabel = "Sections de l'historique" }: {
  tabs: Array<{
    id: TabId;
    label: string;
  }>;
  activeTab: TabId;
  onChange: (tab: TabId) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="history-view__tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? "is-active" : ""}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function HistoryFilters({
  activeTab,
  query,
  scraperFilter,
  scrapers,
  onQueryChange,
  onScraperFilterChange,
}: FiltersProps) {
  return (
    <div className="history-view__filters">
      <label>
        <span>Recherche</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Titre, source, scrapper..."
        />
      </label>
      <label>
        <span>Source</span>
        <select
          value={scraperFilter}
          onChange={(event) => onScraperFilterChange(event.target.value)}
        >
          <option value="">Toutes les sources</option>
          {activeTab === "reading" ? (
            <option value="library">Bibliotheque locale</option>
          ) : null}
          {activeTab === "searches" ? (
            <option value={HISTORY_MULTI_SOURCE_FILTER}>Recherche multi-source</option>
          ) : null}
          {scrapers.map((scraper) => (
            <option key={scraper.id} value={scraper.id}>
              {scraper.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function HistoryPagination({
  currentPage,
  totalPages,
  resultCount,
  onPrevious,
  onNext,
}: PaginationProps) {
  return (
    <>
      <div className="history-view__summary">
        <span>{resultCount} element(s)</span>
        <span>Page {currentPage}/{totalPages}</span>
      </div>
      {totalPages > 1 ? (
        <div className="history-view__pagination">
          <button
            type="button"
            onClick={onPrevious}
            disabled={currentPage <= 1}
          >
            Precedent
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={currentPage >= totalPages}
          >
            Suivant
          </button>
        </div>
      ) : null}
    </>
  );
}
