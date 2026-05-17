import React from "react";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import { MagnifyingGlassIcon } from "@/renderer/components/icons";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchReadingStatusFilterBar from "@/renderer/components/MultiSearch/MultiSearchReadingStatusFilterBar";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
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

type Props = {
  favorite: ScraperAuthorFavoriteRecord;
  runs: AuthorFavoriteSourceRun[];
  displayedResults: MultiSearchMergedResult[];
  visibleResultCount: number;
  loadedSourceCount: number;
  resultLanguageCodes: string[];
  languageFilterModes: MultiSearchLanguageFilterModes;
  readingStatusFilters: MultiSearchReadingStatusFilter[];
  loading: boolean;
  message: string | null;
  error: string | null;
  canLoadMore: boolean;
  selectedFavoriteMultiSearchQuery: string;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  onBack: () => void;
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
  onOpenFavoriteSource: (source: ScraperAuthorFavoriteSource) => void;
  onOpenSource: (source: MultiSearchSourceResult) => void;
  onOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
  onOpenProgressReader: (
    source: MultiSearchSourceResult,
    page: number,
    totalPages: number | null,
    readerMangaId?: string,
  ) => void;
  onSetSourcesRead: (identities: ScraperViewHistoryCardIdentity[], read: boolean) => void;
};

export default function ScraperAuthorFavoriteResults({
  favorite,
  runs,
  displayedResults,
  visibleResultCount,
  loadedSourceCount,
  resultLanguageCodes,
  languageFilterModes,
  readingStatusFilters,
  loading,
  message,
  error,
  canLoadMore,
  selectedFavoriteMultiSearchQuery,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  newViewHistoryIds,
  onBack,
  onReload,
  onOpenMultiSearch,
  onLoadMoreForAll,
  onLoadAllForAll,
  onLoadMoreForRun,
  onToggleLanguageFilterMode,
  onToggleReadingStatus,
  onOpenFavoriteSource,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
}: Props) {
  return (
    <section className="scraper-author-favorites-view scraper-browser__panel">
      <div className="scraper-author-favorites-view__header">
        <div>
          <button
            type="button"
            className="scraper-author-favorites-view__back"
            onClick={onBack}
          >
            Retour aux auteurs favoris
          </button>
          <h2>{favorite.name}</h2>
          <p>{favorite.sources.length} source(s) auteur associee(s).</p>
        </div>
        <div className="scraper-author-favorites-view__header-actions">
          <button
            type="button"
            className="scraper-author-favorites-view__multi-search"
            onClick={onOpenMultiSearch}
            disabled={!selectedFavoriteMultiSearchQuery}
            title={selectedFavoriteMultiSearchQuery
              ? `Pre-remplir la recherche multi-sources avec ${selectedFavoriteMultiSearchQuery}`
              : "Aucun nom auteur disponible"}
          >
            <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
            <span>Recherche multi-source</span>
          </button>
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
                onClick={() => onOpenFavoriteSource(run.favoriteSource)}
                aria-label={`Ouvrir la page auteur ${run.favoriteSource.name} dans ${run.scraper.name}`}
                title={`Ouvrir dans ${run.scraper.name}`}
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
              <h3>Resultats combines</h3>
              <p>{visibleResultCount} carte(s), {loadedSourceCount} source(s) chargee(s).</p>
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

          <div className="multi-search__results-grid">
            {displayedResults.map((result) => (
              <MultiSearchResultCard
                key={result.id}
                result={result}
                libraryMangas={libraryMangas}
                bookmarkedSourceKeys={bookmarkedSourceKeys}
                sourceProgressIndex={sourceProgressIndex}
                viewHistoryRecordsById={viewHistoryRecordsById}
                newViewHistoryIds={newViewHistoryIds}
                onOpenSource={onOpenSource}
                onOpenSourceInWorkspace={onOpenSourceInWorkspace}
                onOpenProgressReader={onOpenProgressReader}
                onSetSourcesRead={onSetSourcesRead}
              />
            ))}
          </div>
        </section>
      ) : loading ? (
        <div className="scraper-browser__message">Chargement de l'auteur combine...</div>
      ) : null}
    </section>
  );
}
