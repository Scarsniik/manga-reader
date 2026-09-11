import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ScraperRecord,
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
} from "@/shared/scraper";
import ScraperTagFavoriteResults from "@/renderer/components/ScraperTagFavorites/ScraperTagFavoriteResults";
import useTagFavoriteRuns from "@/renderer/components/ScraperTagFavorites/useTagFavoriteRuns";
import {
  buildMultiSearchResultLanguageFilterCodes,
  filterMultiSearchMergedResultsByLanguage,
  getMultiSearchSourceLanguageValues,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import { filterMultiSearchMergedResultsByText } from "@/renderer/components/MultiSearch/multiSearchResultFilters";
import {
  flattenMultiSearchSources,
  mergeMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import useScraperSourceFavoriteResults from "@/renderer/components/ScraperSourceFavorites/useScraperSourceFavoriteResults";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";
import useParams from "@/renderer/hooks/useParams";
import useVisualMultiSearchMerge from "@/renderer/components/MultiSearch/useVisualMultiSearchMerge";
import "@/renderer/components/MultiSearch/style.scss";
import "@/renderer/components/MultiSearch/card.scss";
import "@/renderer/components/ScraperAuthorFavorites/style.scss";

type Props = {
  scraper: ScraperRecord;
  tagUrl: string;
  tagTitle: string;
  cover?: string;
  scrapeDetailsWithCards: boolean;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  tagFavorites?: ScraperTagFavoriteRecord[];
  hideBlacklistedCards?: boolean;
  headerAction?: React.ReactNode;
  onSwitchToPagedView: () => void;
  onOpenSourceDetails?: (source: MultiSearchSourceResult) => void;
};

const STATIC_TAG_SOURCE_DATE = "1970-01-01T00:00:00.000Z";
const RESULT_TEXT_FILTER_DELAY_MS = 350;

const buildDirectTagFavorite = (
  scraper: ScraperRecord,
  tagUrl: string,
  tagTitle: string,
  cover: string | undefined,
): ScraperTagFavoriteRecord => {
  const source: ScraperTagFavoriteSource = {
    scraperId: scraper.id,
    tagUrl,
    name: tagTitle || tagUrl,
    cover,
    createdAt: STATIC_TAG_SOURCE_DATE,
    updatedAt: STATIC_TAG_SOURCE_DATE,
  };

  return {
    id: `direct-tag::${scraper.id}::${tagUrl}`,
    name: source.name,
    cover,
    sources: [source],
    createdAt: STATIC_TAG_SOURCE_DATE,
    updatedAt: STATIC_TAG_SOURCE_DATE,
  };
};

export default function ScraperTagCombinedView({
  scraper,
  tagUrl,
  tagTitle,
  cover,
  scrapeDetailsWithCards,
  tagBlacklistByScraper,
  tagFavorites = [],
  hideBlacklistedCards = false,
  headerAction = null,
  onSwitchToPagedView,
  onOpenSourceDetails,
}: Props) {
  const { params } = useParams();
  const [resultTextFilter, setResultTextFilter] = useState("");
  const [debouncedResultTextFilter, setDebouncedResultTextFilter] = useState("");
  const favorite = useMemo(
    () => buildDirectTagFavorite(scraper, tagUrl, tagTitle, cover),
    [cover, scraper, tagTitle, tagUrl],
  );
  const scrapersById = useMemo(
    () => new Map<string, ScraperRecord>([[scraper.id, scraper]]),
    [scraper],
  );
  const {
    runs,
    visibleSources,
    pageIndex,
    visiblePageEndIndex,
    loading,
    message,
    error,
    canGoPrevious,
    canGoNext,
    canAppendPages,
    start,
    reload,
    goToPreviousPage,
    goToNextPage,
    appendPages,
  } = useTagFavoriteRuns(favorite, scrapersById, {
    scrapeDetailsWithCards,
  });
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
    trackedSources: visibleSources,
    logLabel: "direct tag combined view",
    onOpenSourceDetails,
  });
  const mergeOptions = useMemo(() => ({
    enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
    preferredTitleLanguageCodes: params?.multiSearchMergedTitleLanguagePriority ?? [],
  }), [
    params?.multiSearchEnableRomajiPhoneticMerge,
    params?.multiSearchMergedTitleLanguagePriority,
  ]);
  const mergedResults = useMemo(
    () => mergeMultiSearchResults(visibleSources, mergeOptions),
    [mergeOptions, visibleSources],
  );
  const { mergedResults: visuallyMergedResults } = useVisualMultiSearchMerge(
    mergedResults,
    mergeOptions,
    params?.scraperVisualCoverMatchingEnabled !== false,
  );
  const resultLanguageCodes = useMemo(
    () => buildMultiSearchResultLanguageFilterCodes(visibleSources),
    [visibleSources],
  );
  const languageFilteredResults = useMemo(
    () => filterMultiSearchMergedResultsByLanguage(visuallyMergedResults, languageFilterModes),
    [languageFilterModes, visuallyMergedResults],
  );
  const visibleMergedResults = useMemo(
    () => filterMultiSearchMergedResultsByText(
      languageFilteredResults,
      debouncedResultTextFilter,
      getMultiSearchSourceLanguageValues,
    ),
    [debouncedResultTextFilter, languageFilteredResults],
  );
  const visibleSourceCount = useMemo(
    () => visibleMergedResults.reduce((count, result) => count + result.sources.length, 0),
    [visibleMergedResults],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedResultTextFilter(resultTextFilter);
    }, RESULT_TEXT_FILTER_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [resultTextFilter]);

  useEffect(() => {
    setOpenError(null);
    setLanguageFilterModes({});
    setResultTextFilter("");
    setDebouncedResultTextFilter("");
    void start();
  }, [setLanguageFilterModes, setOpenError, start]);

  const handleSwitchToPagedView = useCallback(() => {
    onSwitchToPagedView();
  }, [onSwitchToPagedView]);

  return (
    <ScraperTagFavoriteResults
      favorite={favorite}
      runs={runs}
      pageIndex={pageIndex}
      visiblePageEndIndex={visiblePageEndIndex}
      mergedResults={visibleMergedResults}
      totalResultCount={mergedResults.length}
      visibleSourceCount={visibleSourceCount}
      loadedSourceCount={loadedSources.length}
      resultLanguageCodes={resultLanguageCodes}
      languageFilterModes={languageFilterModes}
      textFilter={resultTextFilter}
      loading={loading}
      message={message}
      error={error || openError}
      canGoPrevious={canGoPrevious}
      canGoNext={canGoNext}
      canAppendPages={canAppendPages}
      libraryMangas={libraryMangas}
      bookmarkedSourceKeys={bookmarkedSourceKeys}
      sourceProgressIndex={sourceProgressIndex}
      viewHistoryRecordsById={viewHistoryRecordsById}
      newViewHistoryIds={newSourceHistoryIds}
      tagBlacklistByScraper={tagBlacklistByScraper}
      tagFavorites={tagFavorites}
      hideBlacklistedCards={hideBlacklistedCards}
      showUnseenFirst={false}
      backLabel={null}
      description={`Vue fusionnee de ${scraper.name}.`}
      headerAction={(
        <>
          <button
            type="button"
            className="scraper-author-favorites-view__clear"
            onClick={handleSwitchToPagedView}
          >
            Vue par pages
          </button>
          {headerAction}
        </>
      )}
      onReload={() => void reload()}
      onPreviousPage={() => void goToPreviousPage()}
      onNextPage={() => void goToNextPage()}
      onAppendPages={(pageCount) => void appendPages(pageCount)}
      onToggleLanguageFilterMode={handleToggleLanguageFilterMode}
      onTextFilterChange={setResultTextFilter}
      onFillTextFilterFromBaseQuery={() => setResultTextFilter(tagTitle)}
      onClearTextFilter={() => setResultTextFilter("")}
      onOpenFavoriteSource={handleSwitchToPagedView}
      onOpenSource={handleOpenSource}
      onOpenSourceInWorkspace={handleOpenSourceInWorkspace}
      onOpenProgressReader={(source, page, totalPages, readerMangaId, openInWorkspace) => void handleOpenProgressReader(
        source,
        page,
        totalPages,
        readerMangaId,
        openInWorkspace,
      )}
      onSetSourcesRead={(identities, read) => void handleSetSourcesRead(identities, read)}
    />
  );
}
