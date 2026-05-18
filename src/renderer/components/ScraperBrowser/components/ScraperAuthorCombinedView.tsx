import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
  ScraperRecord,
} from "@/shared/scraper";
import ScraperAuthorCombinedResults from "@/renderer/components/ScraperAuthorFavorites/ScraperAuthorCombinedResults";
import useAuthorFavoriteRuns from "@/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns";
import {
  buildMultiSearchResultLanguageFilterCodes,
  filterMultiSearchMergedResultsByLanguage,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import {
  flattenMultiSearchSources,
  mergeMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import {
  filterMultiSearchMergedResultsByReadingStatus,
  toggleMultiSearchReadingStatusFilter,
} from "@/renderer/components/MultiSearch/multiSearchReadingStatusFilters";
import type { MultiSearchReadingStatusFilter } from "@/renderer/components/MultiSearch/types";
import useScraperSourceFavoriteResults from "@/renderer/components/ScraperSourceFavorites/useScraperSourceFavoriteResults";
import type { ScraperTemplateContext } from "@/renderer/utils/scraperTemplateContext";
import {
  buildSearchResultViewHistoryIdentity,
  sortByScraperViewHistoryNewState,
} from "@/renderer/utils/scraperViewHistory";
import "@/renderer/components/MultiSearch/style.scss";
import "@/renderer/components/MultiSearch/card.scss";
import "@/renderer/components/ScraperAuthorFavorites/style.scss";

type Props = {
  scraper: ScraperRecord;
  authorUrl: string;
  authorTitle: string;
  authorMultiSearchQuery: string;
  initialPageCount: number;
  cover?: string;
  templateContext?: ScraperTemplateContext | null;
  favoriteAction?: React.ReactNode;
  onOpenMultiSearch: () => void;
  onSwitchToPagedView: () => void;
};

const STATIC_AUTHOR_SOURCE_DATE = "1970-01-01T00:00:00.000Z";

const buildDirectAuthorFavorite = (
  scraper: ScraperRecord,
  authorUrl: string,
  authorTitle: string,
  cover: string | undefined,
  templateContext: ScraperTemplateContext | null | undefined,
): ScraperAuthorFavoriteRecord => {
  const source: ScraperAuthorFavoriteSource = {
    scraperId: scraper.id,
    authorUrl,
    name: authorTitle || authorUrl,
    cover,
    templateContext: templateContext ?? undefined,
    createdAt: STATIC_AUTHOR_SOURCE_DATE,
    updatedAt: STATIC_AUTHOR_SOURCE_DATE,
  };

  return {
    id: `direct-author::${scraper.id}::${authorUrl}`,
    name: source.name,
    cover,
    sources: [source],
    createdAt: STATIC_AUTHOR_SOURCE_DATE,
    updatedAt: STATIC_AUTHOR_SOURCE_DATE,
  };
};

export default function ScraperAuthorCombinedView({
  scraper,
  authorUrl,
  authorTitle,
  authorMultiSearchQuery,
  initialPageCount,
  cover,
  templateContext,
  favoriteAction = null,
  onOpenMultiSearch,
  onSwitchToPagedView,
}: Props) {
  const [readingStatusFilters, setReadingStatusFilters] = useState<MultiSearchReadingStatusFilter[]>([]);
  const favorite = useMemo(
    () => buildDirectAuthorFavorite(scraper, authorUrl, authorTitle, cover, templateContext),
    [authorTitle, authorUrl, cover, scraper, templateContext],
  );
  const scrapersById = useMemo(
    () => new Map<string, ScraperRecord>([[scraper.id, scraper]]),
    [scraper],
  );
  const {
    runs,
    loading,
    message,
    error,
    canLoadMore,
    start,
    loadMoreForAll,
    loadAllForAll,
    loadMoreForRun,
  } = useAuthorFavoriteRuns(
    favorite,
    scrapersById,
    {
      initialPageCount,
      cacheResults: false,
    },
  );
  const loadedSources = useMemo(() => flattenMultiSearchSources(runs), [runs]);
  const {
    libraryMangas,
    bookmarkedSourceKeys,
    sourceProgressIndex,
    viewHistoryRecordsById,
    newSourceHistoryIds,
    openError,
    setOpenError,
    languageFilterModes,
    setLanguageFilterModes,
    handleToggleLanguageFilterMode,
    handleOpenSource,
    handleOpenSourceInWorkspace,
    handleOpenProgressReader,
    handleSetSourcesRead,
  } = useScraperSourceFavoriteResults({
    selectedFavoriteId: favorite.id,
    trackedSources: loadedSources,
    logLabel: "direct author combined view",
  });
  const mergedResults = useMemo(() => mergeMultiSearchResults(loadedSources), [loadedSources]);
  const resultLanguageCodes = useMemo(
    () => buildMultiSearchResultLanguageFilterCodes(loadedSources),
    [loadedSources],
  );
  const visibleMergedResults = useMemo(
    () => filterMultiSearchMergedResultsByReadingStatus(
      filterMultiSearchMergedResultsByLanguage(mergedResults, languageFilterModes),
      readingStatusFilters,
      {
        libraryMangas,
        bookmarkedSourceKeys,
        sourceProgressIndex,
        viewHistoryRecordsById,
      },
    ),
    [
      bookmarkedSourceKeys,
      languageFilterModes,
      libraryMangas,
      mergedResults,
      readingStatusFilters,
      sourceProgressIndex,
      viewHistoryRecordsById,
    ],
  );
  const displayedMergedResults = useMemo(
    () => sortByScraperViewHistoryNewState(
      visibleMergedResults,
      (result) => result.sources.map((source) => buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)),
      viewHistoryRecordsById,
      newSourceHistoryIds,
      false,
    ),
    [newSourceHistoryIds, viewHistoryRecordsById, visibleMergedResults],
  );

  useEffect(() => {
    setOpenError(null);
    setLanguageFilterModes({});
    setReadingStatusFilters([]);
    void start();
  }, [setLanguageFilterModes, setOpenError, start]);

  const handleToggleReadingStatusFilter = useCallback((status: MultiSearchReadingStatusFilter) => {
    setReadingStatusFilters((currentStatuses) => (
      toggleMultiSearchReadingStatusFilter(currentStatuses, status)
    ));
  }, []);

  return (
    <ScraperAuthorCombinedResults
      title={authorTitle || "Auteur"}
      description={`Vue combinee de ${scraper.name}.`}
      runs={runs}
      displayedResults={displayedMergedResults}
      visibleResultCount={visibleMergedResults.length}
      loadedSourceCount={loadedSources.length}
      resultLanguageCodes={resultLanguageCodes}
      languageFilterModes={languageFilterModes}
      readingStatusFilters={readingStatusFilters}
      loading={loading}
      message={message}
      error={error || openError}
      canLoadMore={canLoadMore}
      multiSearchQuery={authorMultiSearchQuery}
      libraryMangas={libraryMangas}
      bookmarkedSourceKeys={bookmarkedSourceKeys}
      sourceProgressIndex={sourceProgressIndex}
      viewHistoryRecordsById={viewHistoryRecordsById}
      newViewHistoryIds={newSourceHistoryIds}
      sourceSectionTitle="Page auteur"
      loadingMessage="Chargement de la vue auteur combinee..."
      viewModeAction={(
        <button
          type="button"
          className="scraper-author-favorites-view__clear"
          onClick={onSwitchToPagedView}
        >
          Vue par pages
        </button>
      )}
      favoriteAction={favoriteAction}
      onReload={() => void start()}
      onOpenMultiSearch={onOpenMultiSearch}
      onLoadMoreForAll={() => void loadMoreForAll()}
      onLoadAllForAll={() => void loadAllForAll()}
      onLoadMoreForRun={(runKey) => void loadMoreForRun(runKey)}
      onToggleLanguageFilterMode={handleToggleLanguageFilterMode}
      onToggleReadingStatus={handleToggleReadingStatusFilter}
      onOpenAuthorSource={onSwitchToPagedView}
      getSourceButtonTitle={() => "Revenir a la vue par pages"}
      getSourceButtonAriaLabel={() => `Revenir a la vue par pages de ${authorTitle || "cet auteur"}`}
      onOpenSource={handleOpenSource}
      onOpenSourceInWorkspace={handleOpenSourceInWorkspace}
      onOpenProgressReader={(source, page, totalPages, readerMangaId) => void handleOpenProgressReader(
        source,
        page,
        totalPages,
        readerMangaId,
      )}
      onSetSourcesRead={(identities, read) => void handleSetSourcesRead(identities, read)}
    />
  );
}
