import React from "react";
import type {
  ScraperAuthorFavoriteSource,
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import { MagnifyingGlassIcon } from "@/renderer/components/icons";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchReadingStatusFilterBar from "@/renderer/components/MultiSearch/MultiSearchReadingStatusFilterBar";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import MultiSearchTextFilterBar from "@/renderer/components/MultiSearch/MultiSearchTextFilterBar";
import { filterBlacklistedMultiSearchResults } from "@/renderer/components/MultiSearch/multiSearchTagBlacklist";
import type { MultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchMergedResult,
  MultiSearchReadingStatusFilter,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { Manga } from "@/renderer/types";
import type { AuthorFavoriteSourceRun } from "@/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";

type Props = {
  title: string;
  description: string;
  runs: AuthorFavoriteSourceRun[];
  displayedResults: MultiSearchMergedResult[];
  visibleResultCount: number;
  loadedSourceCount: number;
  resultLanguageCodes: string[];
  languageFilterModes: MultiSearchLanguageFilterModes;
  readingStatusFilters: MultiSearchReadingStatusFilter[];
  textFilter: string;
  loading: boolean;
  message: string | null;
  error: string | null;
  canLoadMore: boolean;
  multiSearchQuery: string;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  hideBlacklistedCards?: boolean;
  backLabel?: string | null;
  sourceSectionTitle?: string;
  resultsSectionTitle?: string;
  loadingMessage?: string;
  viewModeAction?: React.ReactNode;
  favoriteAction?: React.ReactNode;
  multiSearchButtonLabel?: string;
  onBack?: () => void;
  onReload: () => void;
  onOpenMultiSearch: () => void;
  onLoadMoreForAll: () => void;
  onLoadAllForAll: () => void;
  onLoadMoreForRun: (runKey: string) => void;
  onToggleLanguageFilterMode: (
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => void;
  onToggleReadingStatus: (status: MultiSearchReadingStatusFilter) => void;
  onTextFilterChange: (value: string) => void;
  onFillTextFilterFromBaseQuery: () => void;
  onClearTextFilter: () => void;
  onOpenAuthorSource: (source: ScraperAuthorFavoriteSource) => void;
  getSourceButtonTitle?: (run: AuthorFavoriteSourceRun) => string;
  getSourceButtonAriaLabel?: (run: AuthorFavoriteSourceRun) => string;
  onOpenSource: (source: MultiSearchSourceResult) => void;
  onOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
  onOpenProgressReader: (
    source: MultiSearchSourceResult,
    page: number,
    totalPages: number | null,
    readerMangaId?: string,
    openInWorkspace?: boolean,
  ) => void;
  onSetSourcesRead: (identities: ScraperViewHistoryCardIdentity[], read: boolean) => void;
};

export default function ScraperAuthorCombinedResults({
  title,
  description,
  runs,
  displayedResults,
  visibleResultCount,
  loadedSourceCount,
  resultLanguageCodes,
  languageFilterModes,
  readingStatusFilters,
  textFilter,
  loading,
  message,
  error,
  canLoadMore,
  multiSearchQuery,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  newViewHistoryIds,
  tagBlacklistByScraper,
  hideBlacklistedCards = false,
  backLabel = null,
  sourceSectionTitle = "Sources",
  resultsSectionTitle = "Resultats combines",
  loadingMessage = "Chargement de l'auteur combine...",
  viewModeAction = null,
  favoriteAction = null,
  multiSearchButtonLabel = "Recherche multi-source",
  onBack,
  onReload,
  onOpenMultiSearch,
  onLoadMoreForAll,
  onLoadAllForAll,
  onLoadMoreForRun,
  onToggleLanguageFilterMode,
  onToggleReadingStatus,
  onTextFilterChange,
  onFillTextFilterFromBaseQuery,
  onClearTextFilter,
  onOpenAuthorSource,
  getSourceButtonTitle,
  getSourceButtonAriaLabel,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
}: Props) {
  const visibleDisplayedResults = React.useMemo(
    () => filterBlacklistedMultiSearchResults(
      displayedResults,
      tagBlacklistByScraper,
      hideBlacklistedCards,
    ),
    [displayedResults, hideBlacklistedCards, tagBlacklistByScraper],
  );

  return (
    <section className="scraper-author-favorites-view scraper-browser__panel">
      <div className="scraper-author-favorites-view__header">
        <div>
          {backLabel && onBack ? (
            <button
              type="button"
              className="scraper-author-favorites-view__back"
              onClick={onBack}
            >
              {backLabel}
            </button>
          ) : null}
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="scraper-author-favorites-view__header-actions">
          {viewModeAction}
          <button
            type="button"
            className="scraper-author-favorites-view__multi-search"
            onClick={onOpenMultiSearch}
            disabled={!multiSearchQuery}
            title={multiSearchQuery
              ? `Pre-remplir la recherche multi-sources avec ${multiSearchQuery}`
              : "Aucun nom auteur disponible"}
          >
            <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
            <span>{multiSearchButtonLabel}</span>
          </button>
          {favoriteAction}
          <button
            type="button"
            className="scraper-author-favorites-view__clear"
            onClick={onReload}
            disabled={loading}
          >
            Recharger
          </button>
        </div>
      </div>

      {message ? <div className="multi-search__message is-info">{message}</div> : null}
      {error ? <div className="multi-search__message is-error">{error}</div> : null}

      <section className="scraper-author-favorites-view__sources">
        <div className="multi-search__section-head">
          <div>
            <h3>{sourceSectionTitle}</h3>
            <p>{runs.length} source(s), {loadedSourceCount} resultat(s) charge(s).</p>
          </div>
          <div className="scraper-author-favorites-view__source-actions">
            <button
              type="button"
              className="multi-search__export-json-button"
              onClick={onLoadMoreForAll}
              disabled={loading || !canLoadMore}
            >
              Charger plus
            </button>
            <button
              type="button"
              className="multi-search__export-json-button"
              onClick={onLoadAllForAll}
              disabled={loading || !canLoadMore}
            >
              Charger tout
            </button>
          </div>
        </div>
        <div className="scraper-author-favorites-view__source-list">
          {runs.map((run) => (
            <div key={run.key} className={`scraper-author-favorites-view__source is-${run.status}`}>
              <button
                type="button"
                className="scraper-author-favorites-view__source-link"
                onClick={() => onOpenAuthorSource(run.favoriteSource)}
                aria-label={getSourceButtonAriaLabel
                  ? getSourceButtonAriaLabel(run)
                  : `Ouvrir la page auteur ${run.favoriteSource.name} dans ${run.scraper.name}`}
                title={getSourceButtonTitle ? getSourceButtonTitle(run) : `Ouvrir dans ${run.scraper.name}`}
              >
                <strong>{run.scraper.name}</strong>
                <span>{run.favoriteSource.name}</span>
                {run.error ? <small>{run.error}</small> : null}
              </button>
              <div>
                <span>{run.loadedPages} page(s)</span>
                <button
                  type="button"
                  className="scraper-author-favorites-view__source-more"
                  onClick={() => onLoadMoreForRun(run.key)}
                  disabled={loading || !run.hasNextPage || run.status === "loading"}
                >
                  Plus
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {loadedSourceCount ? (
        <section className="multi-search__results">
          <div className="multi-search__section-head">
            <div>
              <h3>{resultsSectionTitle}</h3>
              <p>
                {visibleDisplayedResults.length} carte(s), {loadedSourceCount} source(s) chargee(s)
                {hideBlacklistedCards && visibleDisplayedResults.length < visibleResultCount
                  ? `, ${visibleResultCount - visibleDisplayedResults.length} masquee(s)`
                  : ""}.
              </p>
              <div className="multi-search__result-filter-stack">
                <MultiSearchTextFilterBar
                  value={textFilter}
                  baseQuery={multiSearchQuery}
                  onChange={onTextFilterChange}
                  onFillFromBaseQuery={onFillTextFilterFromBaseQuery}
                  onClear={onClearTextFilter}
                />
                <div className="multi-search__facet-filter-row">
                  <MultiSearchLanguageFilterBar
                    languageCodes={resultLanguageCodes}
                    filterModes={languageFilterModes}
                    onToggleFilterMode={onToggleLanguageFilterMode}
                  />
                  <MultiSearchReadingStatusFilterBar
                    selectedStatuses={readingStatusFilters}
                    onToggleStatus={onToggleReadingStatus}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="multi-search__results-grid">
            {visibleDisplayedResults.map((result) => (
              <MultiSearchResultCard
                key={result.id}
                result={result}
                libraryMangas={libraryMangas}
                bookmarkedSourceKeys={bookmarkedSourceKeys}
                sourceProgressIndex={sourceProgressIndex}
                viewHistoryRecordsById={viewHistoryRecordsById}
                newViewHistoryIds={newViewHistoryIds}
                tagBlacklistByScraper={tagBlacklistByScraper}
                viewHistoryRecordingDisabled={loading}
                onOpenSource={onOpenSource}
                onOpenSourceInWorkspace={onOpenSourceInWorkspace}
                onOpenProgressReader={onOpenProgressReader}
                onSetSourcesRead={onSetSourcesRead}
              />
            ))}
          </div>
          {!visibleDisplayedResults.length ? (
            <div className="scraper-browser__message">Aucun resultat ne correspond aux filtres actifs.</div>
          ) : null}
        </section>
      ) : loading ? (
        <div className="scraper-browser__message">{loadingMessage}</div>
      ) : null}
    </section>
  );
}
