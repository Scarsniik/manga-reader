import React from "react";
import type {
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import {
  buildSearchResultViewHistoryIdentity,
  sortByScraperViewHistoryNewState,
} from "@/renderer/utils/scraperViewHistory";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import MultiSearchTextFilterBar from "@/renderer/components/MultiSearch/MultiSearchTextFilterBar";
import { filterBlacklistedMultiSearchResults } from "@/renderer/components/MultiSearch/multiSearchTagBlacklist";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { MultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import type { Manga } from "@/renderer/types";
import type { TagFavoriteSourceRun } from "@/renderer/components/ScraperTagFavorites/useTagFavoriteRuns";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";

type Props = {
  favorite: ScraperTagFavoriteRecord;
  runs: TagFavoriteSourceRun[];
  pageIndex: number;
  mergedResults: MultiSearchMergedResult[];
  totalResultCount: number;
  visibleSourceCount: number;
  loadedSourceCount: number;
  resultLanguageCodes: string[];
  languageFilterModes: MultiSearchLanguageFilterModes;
  textFilter: string;
  loading: boolean;
  message: string | null;
  error: string | null;
  canGoPrevious: boolean;
  canGoNext: boolean;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  hideBlacklistedCards?: boolean;
  showUnseenFirst: boolean;
  onBack: () => void;
  onReload: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onToggleLanguageFilterMode: (
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => void;
  onTextFilterChange: (value: string) => void;
  onFillTextFilterFromBaseQuery: () => void;
  onClearTextFilter: () => void;
  onOpenFavoriteSource: (source: ScraperTagFavoriteSource) => void;
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

type TagFavoritePaginationActionsProps = {
  loading: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

function TagFavoritePaginationActions({
  loading,
  canGoPrevious,
  canGoNext,
  onPreviousPage,
  onNextPage,
}: TagFavoritePaginationActionsProps) {
  return (
    <div className="scraper-author-favorites-view__source-actions">
      <button
        type="button"
        className="multi-search__export-json-button secondary"
        onClick={onPreviousPage}
        disabled={loading || !canGoPrevious}
      >
        Page precedente
      </button>
      <button
        type="button"
        className="multi-search__export-json-button"
        onClick={onNextPage}
        disabled={loading || !canGoNext}
      >
        Page suivante
      </button>
    </div>
  );
}

export default function ScraperTagFavoriteResults({
  favorite,
  runs,
  pageIndex,
  mergedResults,
  totalResultCount,
  visibleSourceCount,
  loadedSourceCount,
  resultLanguageCodes,
  languageFilterModes,
  textFilter,
  loading,
  message,
  error,
  canGoPrevious,
  canGoNext,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  newViewHistoryIds,
  tagBlacklistByScraper,
  hideBlacklistedCards = false,
  showUnseenFirst,
  onBack,
  onReload,
  onPreviousPage,
  onNextPage,
  onToggleLanguageFilterMode,
  onTextFilterChange,
  onFillTextFilterFromBaseQuery,
  onClearTextFilter,
  onOpenFavoriteSource,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
}: Props) {
  const displayedMergedResults = React.useMemo(
    () => filterBlacklistedMultiSearchResults(
      sortByScraperViewHistoryNewState(
        mergedResults,
        (result) => result.sources.map((source) => buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)),
        viewHistoryRecordsById,
        newViewHistoryIds,
        showUnseenFirst,
      ),
      tagBlacklistByScraper,
      hideBlacklistedCards,
    ),
    [
      hideBlacklistedCards,
      mergedResults,
      newViewHistoryIds,
      showUnseenFirst,
      tagBlacklistByScraper,
      viewHistoryRecordsById,
    ],
  );
  const hiddenMergedResultCount = mergedResults.length - displayedMergedResults.length;

  return (
    <section className="scraper-author-favorites-view scraper-browser__panel">
      <div className="scraper-author-favorites-view__header">
        <div>
          <button
            type="button"
            className="scraper-author-favorites-view__back"
            onClick={onBack}
          >
            Retour aux tags favoris
          </button>
          <h2>{favorite.name}</h2>
          <p>{favorite.sources.length} source(s) tag associee(s).</p>
        </div>
        <div className="scraper-author-favorites-view__header-actions">
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
            <h3>Sources</h3>
            <p>{runs.length} source(s), {loadedSourceCount} resultat(s) charge(s).</p>
          </div>
        </div>
        <div className="scraper-author-favorites-view__source-list">
          {runs.map((run) => (
            <div key={run.key} className={`scraper-author-favorites-view__source is-${run.status}`}>
              <button
                type="button"
                className="scraper-author-favorites-view__source-link"
                onClick={() => onOpenFavoriteSource(run.favoriteSource)}
                aria-label={`Ouvrir la page tag ${run.favoriteSource.name} dans ${run.scraper.name}`}
                title={`Ouvrir dans ${run.scraper.name}`}
              >
                <strong>{run.scraper.name}</strong>
                <span>{run.favoriteSource.name}</span>
                {run.error ? <small>{run.error}</small> : null}
              </button>
              <div>
                <span>{run.loadedPages} page(s)</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="multi-search__results">
        <div className="multi-search__section-head">
          <div>
            <h3>Resultats</h3>
            <p>
              Page {pageIndex + 1}, {displayedMergedResults.length} carte(s), {visibleSourceCount} resultat(s)
              source visible(s)
              {hideBlacklistedCards && hiddenMergedResultCount > 0
                ? `, ${hiddenMergedResultCount} masquee(s)`
                : ""}.
            </p>
            <div className="multi-search__result-filter-stack">
              <MultiSearchTextFilterBar
                value={textFilter}
                baseQuery={favorite.name}
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
              </div>
            </div>
          </div>
          <TagFavoritePaginationActions
            loading={loading}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            onPreviousPage={onPreviousPage}
            onNextPage={onNextPage}
          />
        </div>

        {displayedMergedResults.length ? (
          <div className="multi-search__results-grid">
            {displayedMergedResults.map((result) => (
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
        ) : loading ? (
          <div className="scraper-browser__message">Chargement du tag combine...</div>
        ) : totalResultCount > 0 ? (
          <div className="scraper-browser__message">Aucun resultat ne correspond aux filtres actifs.</div>
        ) : (
          <div className="scraper-browser__message">Aucun resultat sur cette page.</div>
        )}

        <div className="multi-search__section-head">
          <div>
            <p>Page {pageIndex + 1}</p>
          </div>
          <TagFavoritePaginationActions
            loading={loading}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            onPreviousPage={onPreviousPage}
            onNextPage={onNextPage}
          />
        </div>
      </section>
    </section>
  );
}
