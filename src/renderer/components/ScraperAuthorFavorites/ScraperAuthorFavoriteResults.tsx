import React from "react";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
  ScraperTagFavoriteRecord,
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import ScraperAuthorCombinedResults from "@/renderer/components/ScraperAuthorFavorites/ScraperAuthorCombinedResults";
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
  favorite: ScraperAuthorFavoriteRecord;
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
  selectedFavoriteMultiSearchQuery: string;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  tagFavorites?: ScraperTagFavoriteRecord[];
  hideBlacklistedCards?: boolean;
  resultOnly?: boolean;
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
  onTextFilterChange: (value: string) => void;
  onFillTextFilterFromBaseQuery: () => void;
  onClearTextFilter: () => void;
  onOpenFavoriteSource: (source: ScraperAuthorFavoriteSource) => void;
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

export default function ScraperAuthorFavoriteResults({
  favorite,
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
  selectedFavoriteMultiSearchQuery,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  newViewHistoryIds,
  tagBlacklistByScraper,
  tagFavorites = [],
  hideBlacklistedCards = false,
  resultOnly = false,
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
  onOpenFavoriteSource,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
}: Props) {
  return (
    <ScraperAuthorCombinedResults
      title={favorite.name}
      description={`${favorite.sources.length} source(s) auteur associee(s).`}
      runs={runs}
      displayedResults={displayedResults}
      visibleResultCount={visibleResultCount}
      loadedSourceCount={loadedSourceCount}
      resultLanguageCodes={resultLanguageCodes}
      languageFilterModes={languageFilterModes}
      readingStatusFilters={readingStatusFilters}
      textFilter={textFilter}
      loading={loading}
      message={message}
      error={error}
      canLoadMore={canLoadMore}
      multiSearchQuery={selectedFavoriteMultiSearchQuery}
      libraryMangas={libraryMangas}
      bookmarkedSourceKeys={bookmarkedSourceKeys}
      sourceProgressIndex={sourceProgressIndex}
      viewHistoryRecordsById={viewHistoryRecordsById}
      newViewHistoryIds={newViewHistoryIds}
      tagBlacklistByScraper={tagBlacklistByScraper}
      tagFavorites={tagFavorites}
      hideBlacklistedCards={hideBlacklistedCards}
      readOnly={resultOnly}
      backLabel={resultOnly ? null : "Retour aux auteurs favoris"}
      onBack={onBack}
      onReload={onReload}
      onOpenMultiSearch={onOpenMultiSearch}
      onLoadMoreForAll={onLoadMoreForAll}
      onLoadAllForAll={onLoadAllForAll}
      onLoadMoreForRun={onLoadMoreForRun}
      onToggleLanguageFilterMode={onToggleLanguageFilterMode}
      onToggleReadingStatus={onToggleReadingStatus}
      onTextFilterChange={onTextFilterChange}
      onFillTextFilterFromBaseQuery={onFillTextFilterFromBaseQuery}
      onClearTextFilter={onClearTextFilter}
      onOpenAuthorSource={onOpenFavoriteSource}
      onOpenSource={onOpenSource}
      onOpenSourceInWorkspace={onOpenSourceInWorkspace}
      onOpenProgressReader={onOpenProgressReader}
      onSetSourcesRead={onSetSourcesRead}
    />
  );
}
