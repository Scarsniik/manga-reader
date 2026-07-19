import React from "react";
import type {
  ScraperTagFavoriteRecord,
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import {
  buildSearchResultViewHistoryIdentity,
  sortByScraperViewHistoryNewState,
} from "@/renderer/utils/scraperViewHistory";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchReadingStatusFilterBar from "@/renderer/components/MultiSearch/MultiSearchReadingStatusFilterBar";
import MultiSearchTextFilterBar from "@/renderer/components/MultiSearch/MultiSearchTextFilterBar";
import MultiSearchVirtualizedResultsGrid from "@/renderer/components/MultiSearch/MultiSearchVirtualizedResultsGrid";
import { DownloadArrowIcon, LoadingSpinnerIcon } from "@/renderer/components/icons";
import type { Manga } from "@/renderer/types";
import type { MultiSearchAuthorExtractionProgress } from "@/renderer/components/MultiSearch/multiSearchAuthors";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchMergeProgress,
  MultiSearchMergedResult,
  MultiSearchReadingStatusFilter,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchUtils";
import type { MultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import {
  countBlacklistedMultiSearchResults,
  filterBlacklistedMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchTagBlacklist";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";
import BlacklistedCardsDisplayToggle, {
  useLocalBlacklistedCardsDisplay,
} from "@/renderer/components/BlacklistedCardsDisplayToggle";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";

type Props = {
  viewMode: MultiSearchViewMode;
  runs: MultiSearchScraperRun[];
  mergedResults: MultiSearchMergedResult[];
  mergeProgress: MultiSearchMergeProgress;
  visibleSourceCount: number;
  loadedSourceCount: number;
  resultLanguageCodes: string[];
  languageFilterModes: MultiSearchLanguageFilterModes;
  readingStatusFilters: MultiSearchReadingStatusFilter[];
  textFilter: string;
  baseQuery: string;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  tagFavorites?: ScraperTagFavoriteRecord[];
  hideBlacklistedCards?: boolean;
  viewHistoryRecordingDisabled?: boolean;
  showUnseenFirst: boolean;
  isExportingJson: boolean;
  isExtractingAuthors: boolean;
  canExtractAuthors: boolean;
  authorExtractionProgress: MultiSearchAuthorExtractionProgress | null;
  cachedAuthorCount: number | null;
  showMergeReloadButton: boolean;
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
  onSplitResult: (resultId: string) => void;
  onExportJson: () => void;
  onExportMergedResultsJson: () => void;
  onExtractAuthors: () => void;
  onReloadMerge: () => void;
  onTextFilterChange: (value: string) => void;
  onFillTextFilterFromBaseQuery: () => void;
  onClearTextFilter: () => void;
  onToggleLanguageFilterMode: (
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => void;
  onToggleReadingStatusFilter: (status: MultiSearchReadingStatusFilter) => void;
};

const buildSingleSourceMergedResult = (source: MultiSearchSourceResult): MultiSearchMergedResult => ({
  id: `multi-search::${buildMultiSearchSourceIdentityKey(source)}`,
  title: source.result.title,
  coverUrl: source.result.thumbnailUrl,
  summary: source.result.summary,
  pageCount: source.result.pageCount,
  sources: [source],
  sourceLanguageCodes: source.sourceLanguageCodes.length ? source.sourceLanguageCodes : [UNKNOWN_MULTI_SEARCH_VALUE],
  tentativeAuthorNames: source.tentativeAuthorNames,
  contentTypes: source.contentTypes,
});

const getMergeProgressLabel = (progress: MultiSearchMergeProgress): string => {
  if (progress.phase === "queued") {
    return `Fusion en attente : ${progress.totalSourceCount} source(s) a analyser.`;
  }

  if (progress.phase === "sorting") {
    return `Fusion en cours : tri de ${progress.mergedGroupCount} carte(s).`;
  }

  return [
    `Fusion en cours : ${progress.processedSourceCount}/${progress.totalSourceCount} source(s) analysee(s)`,
    `${progress.mergedGroupCount} carte(s) provisoire(s)`,
  ].join(", ");
};

const getAuthorExtractionButtonLabel = (
  isExtractingAuthors: boolean,
  progress: MultiSearchAuthorExtractionProgress | null,
  cachedAuthorCount: number | null,
): string => {
  if (!isExtractingAuthors) {
    return cachedAuthorCount === null
      ? "Extraire auteurs"
      : `Voir auteurs (${cachedAuthorCount})`;
  }

  if (!progress || progress.totalSourceCount === 0) {
    return "Extraction...";
  }

  return `Extraction ${progress.processedSourceCount}/${progress.totalSourceCount}`;
};

export default function MultiSearchResultsSection({
  viewMode,
  runs,
  mergedResults,
  mergeProgress,
  visibleSourceCount,
  loadedSourceCount,
  resultLanguageCodes,
  languageFilterModes,
  readingStatusFilters,
  textFilter,
  baseQuery,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  newViewHistoryIds,
  tagBlacklistByScraper,
  tagFavorites = [],
  hideBlacklistedCards = false,
  viewHistoryRecordingDisabled = false,
  showUnseenFirst,
  isExportingJson,
  isExtractingAuthors,
  canExtractAuthors,
  authorExtractionProgress,
  cachedAuthorCount,
  showMergeReloadButton,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
  onSplitResult,
  onExportJson,
  onExportMergedResultsJson,
  onExtractAuthors,
  onReloadMerge,
  onTextFilterChange,
  onFillTextFilterFromBaseQuery,
  onClearTextFilter,
  onToggleLanguageFilterMode,
  onToggleReadingStatusFilter,
}: Props) {
  const {
    shouldHideBlacklistedCards,
    showBlacklistedCardsLocally,
    setShowBlacklistedCardsLocally,
  } = useLocalBlacklistedCardsDisplay(hideBlacklistedCards);
  const sortMergedResultsByUnseen = React.useCallback((results: MultiSearchMergedResult[]) => (
    sortByScraperViewHistoryNewState(
      results,
      (result) => result.sources.map((source) => buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)),
      viewHistoryRecordsById,
      newViewHistoryIds,
      showUnseenFirst,
    )
  ), [newViewHistoryIds, showUnseenFirst, viewHistoryRecordsById]);
  const sortedMergedResults = React.useMemo(
    () => sortMergedResultsByUnseen(mergedResults),
    [mergedResults, sortMergedResultsByUnseen],
  );
  const displayedMergedResults = React.useMemo(
    () => filterBlacklistedMultiSearchResults(
      sortedMergedResults,
      tagBlacklistByScraper,
      shouldHideBlacklistedCards,
    ),
    [shouldHideBlacklistedCards, sortedMergedResults, tagBlacklistByScraper],
  );
  const blacklistedMergedResultCount = React.useMemo(
    () => countBlacklistedMultiSearchResults(sortedMergedResults, tagBlacklistByScraper),
    [sortedMergedResults, tagBlacklistByScraper],
  );
  const mergeProgressMax = Math.max(mergeProgress.totalSourceCount, 1);
  const mergeProgressClassName = [
    "multi-search__merge-progress",
    mergeProgress.isActive ? "is-visible" : "",
  ].filter(Boolean).join(" ");
  const isMergePending = mergeProgress.isActive || loadedSourceCount > mergeProgress.sourceCount;
  const isWaitingForMergedCards = isMergePending && displayedMergedResults.length === 0;
  const scraperResultGroups = React.useMemo(() => (
    viewMode === "byScraper"
      ? runs.map((run) => {
        const sortedResults = sortMergedResultsByUnseen(run.results.map(buildSingleSourceMergedResult));

        return {
          scraperId: run.scraper.id,
          scraperName: run.scraper.name,
          blacklistedResultCount: countBlacklistedMultiSearchResults(sortedResults, tagBlacklistByScraper),
          results: filterBlacklistedMultiSearchResults(
            sortedResults,
            tagBlacklistByScraper,
            shouldHideBlacklistedCards,
          ),
        };
      })
      : []
  ), [runs, shouldHideBlacklistedCards, sortMergedResultsByUnseen, tagBlacklistByScraper, viewMode]);
  const blacklistedScraperResultCount = React.useMemo(
    () => scraperResultGroups.reduce((count, group) => count + group.blacklistedResultCount, 0),
    [scraperResultGroups],
  );

  if (viewMode === "merged") {
    return (
      <section className="multi-search__results">
        <div className="multi-search__section-head">
          <div>
            <h3>Resultats fusionnes</h3>
            <p>
              {isWaitingForMergedCards
                ? `Preparation des cartes depuis ${visibleSourceCount} source(s) chargee(s)...`
                : `${displayedMergedResults.length} carte(s), ${visibleSourceCount} source(s) chargee(s)${
                  shouldHideBlacklistedCards && blacklistedMergedResultCount > 0
                    ? `, ${blacklistedMergedResultCount} masquee(s)`
                    : ""
                }.`}
            </p>
            <div
              className={mergeProgressClassName}
              role={mergeProgress.isActive ? "status" : undefined}
              aria-live={mergeProgress.isActive ? "polite" : undefined}
              aria-hidden={!mergeProgress.isActive}
            >
              <span>{getMergeProgressLabel(mergeProgress)}</span>
              <progress
                max={mergeProgressMax}
                value={Math.min(mergeProgress.processedSourceCount, mergeProgressMax)}
              />
            </div>
            <div className="multi-search__result-filter-stack">
              <MultiSearchTextFilterBar
                value={textFilter}
                baseQuery={baseQuery}
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
                  onToggleStatus={onToggleReadingStatusFilter}
                />
              </div>
            </div>
          </div>
          <div className="multi-search__section-actions">
            <BlacklistedCardsDisplayToggle
              blacklistedCardCount={blacklistedMergedResultCount}
              hideBlacklistedCards={hideBlacklistedCards}
              showBlacklistedCardsLocally={showBlacklistedCardsLocally}
              onShowBlacklistedCardsLocallyChange={setShowBlacklistedCardsLocally}
            />
            <button
              type="button"
              className="multi-search__export-json-button"
              onClick={onExtractAuthors}
              disabled={!canExtractAuthors || isExtractingAuthors}
              title={cachedAuthorCount === null
                ? "Extraire les auteurs depuis les resultats charges"
                : "Rouvrir les derniers auteurs extraits"}
            >
              {isExtractingAuthors ? (
                <LoadingSpinnerIcon className="multi-search__button-spinner" aria-hidden="true" focusable="false" />
              ) : null}
              <span>{getAuthorExtractionButtonLabel(
                isExtractingAuthors,
                authorExtractionProgress,
                cachedAuthorCount,
              )}</span>
            </button>
            {showMergeReloadButton ? (
              <>
                <button
                  type="button"
                  className="multi-search__reload-merge-button"
                  onClick={onReloadMerge}
                  disabled={loadedSourceCount === 0}
                  title="Recalculer la fusion depuis les resultats charges"
                >
                  Recharger fusion
                </button>
                <button
                  type="button"
                  className="multi-search__export-json-button"
                  onClick={onExportMergedResultsJson}
                  disabled={isExportingJson || loadedSourceCount === 0}
                  title="Ouvrir seulement les mergedResults en JSON"
                >
                  <DownloadArrowIcon aria-hidden="true" focusable="false" />
                  <span>Merged JSON</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="multi-search__export-json-button"
              onClick={onExportJson}
              disabled={isExportingJson || loadedSourceCount === 0}
              title="Ouvrir les resultats JSON"
            >
              <DownloadArrowIcon aria-hidden="true" focusable="false" />
              <span>{isExportingJson ? "Ouverture..." : "JSON"}</span>
            </button>
          </div>
        </div>

        {isWaitingForMergedCards ? (
          <div className="multi-search__merge-waiting" role="status" aria-live="polite">
            <LoadingSpinnerIcon
              className="multi-search__button-spinner"
              aria-hidden="true"
              focusable="false"
            />
            <span>Fusion des resultats en cours. Les cartes vont apparaitre une fois la liste stabilisee.</span>
          </div>
        ) : (
          <MultiSearchVirtualizedResultsGrid
            results={displayedMergedResults}
            libraryMangas={libraryMangas}
            bookmarkedSourceKeys={bookmarkedSourceKeys}
            sourceProgressIndex={sourceProgressIndex}
            viewHistoryRecordsById={viewHistoryRecordsById}
            newViewHistoryIds={newViewHistoryIds}
            tagBlacklistByScraper={tagBlacklistByScraper}
            tagFavorites={tagFavorites}
            viewHistoryRecordingDisabled={viewHistoryRecordingDisabled}
            onOpenSource={onOpenSource}
            onOpenSourceInWorkspace={onOpenSourceInWorkspace}
            onOpenProgressReader={onOpenProgressReader}
            onSetSourcesRead={onSetSourcesRead}
            onSplitResult={onSplitResult}
          />
        )}
        {!mergeProgress.isActive && !displayedMergedResults.length && mergedResults.length ? (
          <div className="scraper-browser__message">Aucun resultat ne correspond aux filtres actifs.</div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="multi-search__results">
      <div className="multi-search__section-head">
        <div>
          <h3>Resultats par scrapper</h3>
          <p>
            {visibleSourceCount} source(s) chargee(s) sans fusion
            {shouldHideBlacklistedCards && blacklistedScraperResultCount > 0
              ? `, ${blacklistedScraperResultCount} masquee(s)`
              : ""}.
          </p>
          <div className="multi-search__result-filter-stack">
            <MultiSearchTextFilterBar
              value={textFilter}
              baseQuery={baseQuery}
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
                onToggleStatus={onToggleReadingStatusFilter}
              />
            </div>
          </div>
        </div>
        <div className="multi-search__section-actions">
          <BlacklistedCardsDisplayToggle
            blacklistedCardCount={blacklistedScraperResultCount}
            hideBlacklistedCards={hideBlacklistedCards}
            showBlacklistedCardsLocally={showBlacklistedCardsLocally}
            onShowBlacklistedCardsLocallyChange={setShowBlacklistedCardsLocally}
          />
          <button
            type="button"
            className="multi-search__export-json-button"
            onClick={onExtractAuthors}
            disabled={!canExtractAuthors || isExtractingAuthors}
            title={cachedAuthorCount === null
              ? "Extraire les auteurs depuis les resultats charges"
              : "Rouvrir les derniers auteurs extraits"}
          >
            {isExtractingAuthors ? (
              <LoadingSpinnerIcon className="multi-search__button-spinner" aria-hidden="true" focusable="false" />
            ) : null}
            <span>{getAuthorExtractionButtonLabel(
              isExtractingAuthors,
              authorExtractionProgress,
              cachedAuthorCount,
            )}</span>
          </button>
          <button
            type="button"
            className="multi-search__export-json-button"
            onClick={onExportJson}
            disabled={isExportingJson || loadedSourceCount === 0}
            title="Ouvrir les resultats JSON"
          >
            <DownloadArrowIcon aria-hidden="true" focusable="false" />
            <span>{isExportingJson ? "Ouverture..." : "JSON"}</span>
          </button>
        </div>
      </div>

      <div className="multi-search__by-scraper">
        {scraperResultGroups.map((group) => (
          <div key={group.scraperId} className="multi-search__scraper-results">
            <h4>{group.scraperName}</h4>
            <MultiSearchVirtualizedResultsGrid
              results={group.results}
              libraryMangas={libraryMangas}
              bookmarkedSourceKeys={bookmarkedSourceKeys}
              sourceProgressIndex={sourceProgressIndex}
              viewHistoryRecordsById={viewHistoryRecordsById}
              newViewHistoryIds={newViewHistoryIds}
              tagBlacklistByScraper={tagBlacklistByScraper}
              tagFavorites={tagFavorites}
              viewHistoryRecordingDisabled={viewHistoryRecordingDisabled}
              onOpenSource={onOpenSource}
              onOpenSourceInWorkspace={onOpenSourceInWorkspace}
              onOpenProgressReader={onOpenProgressReader}
              onSetSourcesRead={onSetSourcesRead}
            />
            {!group.results.length && shouldHideBlacklistedCards && group.blacklistedResultCount > 0 ? (
              <div className="scraper-browser__message">Tous les resultats visibles sont masques par la blacklist.</div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
