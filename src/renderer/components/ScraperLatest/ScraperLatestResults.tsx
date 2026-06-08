import React from "react";
import type {
  ScraperTagFavoriteRecord,
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchVirtualizedResultsGrid from "@/renderer/components/MultiSearch/MultiSearchVirtualizedResultsGrid";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchConstants";
import {
  buildMultiSearchResultLanguageFilterCodes,
  filterMultiSearchMergedResultsByLanguage,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { MultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import { buildSearchResultViewHistoryIdentity, isScraperViewHistoryCardNew } from "@/renderer/utils/scraperViewHistory";
import type { Manga } from "@/renderer/types";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";

type StatusItem = {
  key: string;
  name: string;
  status: string;
  detail: string;
  error?: string;
};

type Props = {
  title: string;
  summary: string;
  emptyLabel: string;
  sources: MultiSearchSourceResult[];
  loading: boolean;
  message: string | null;
  error: string | null;
  openError: string | null;
  statusItems?: StatusItem[];
  actionLabel?: string;
  secondaryActionLabel?: string;
  continueActionLabel?: string;
  actionsDisabled?: boolean;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  tagFavorites?: ScraperTagFavoriteRecord[];
  languageFilterModes: MultiSearchLanguageFilterModes;
  onReload: () => void;
  onSecondaryAction?: () => void;
  onContinue?: () => void;
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
  onToggleLanguageFilterMode: (
    languageCode: string,
    mode: Exclude<MultiSearchLanguageFilterMode, "default">,
  ) => void;
};

const buildSingleSourceLatestResult = (
  source: MultiSearchSourceResult,
  index: number,
): MultiSearchMergedResult => ({
  id: [
    source.scraper.id,
    source.pageIndex,
    source.result.detailUrl || source.result.authorUrl || source.result.title,
    index,
  ].join("::"),
  title: source.result.title,
  coverUrl: source.result.thumbnailUrl,
  summary: source.result.summary,
  pageCount: source.result.pageCount,
  sources: [source],
  sourceLanguageCodes: source.sourceLanguageCodes.length
    ? source.sourceLanguageCodes
    : [UNKNOWN_MULTI_SEARCH_VALUE],
  tentativeAuthorNames: source.tentativeAuthorNames,
  contentTypes: source.contentTypes,
});

const buildStatusSummary = (items: StatusItem[]): string => {
  const counts = items.reduce<Record<string, number>>((result, item) => {
    result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, {});
  const parts = [
    counts.loading ? `${counts.loading} en cours` : "",
    counts.waiting ? `${counts.waiting} en attente` : "",
    counts.done ? `${counts.done} termine(s)` : "",
    counts.error ? `${counts.error} erreur(s)` : "",
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : `${items.length} source(s)`;
};

export default function ScraperLatestResults({
  title,
  summary,
  emptyLabel,
  sources,
  loading,
  message,
  error,
  openError,
  statusItems = [],
  actionLabel = "Recharger",
  secondaryActionLabel,
  continueActionLabel,
  actionsDisabled = false,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  newViewHistoryIds,
  tagBlacklistByScraper,
  tagFavorites = [],
  languageFilterModes,
  onReload,
  onSecondaryAction,
  onContinue,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
  onToggleLanguageFilterMode,
}: Props) {
  const [isStatusPanelOpen, setIsStatusPanelOpen] = React.useState(false);
  const sourceResults = React.useMemo(
    () => sources.map((source, index) => buildSingleSourceLatestResult(source, index)),
    [sources],
  );
  const resultLanguageCodes = React.useMemo(
    () => buildMultiSearchResultLanguageFilterCodes(sources),
    [sources],
  );
  const languageFilteredResults = React.useMemo(
    () => filterMultiSearchMergedResultsByLanguage(sourceResults, languageFilterModes),
    [languageFilterModes, sourceResults],
  );
  const visibleResults = React.useMemo(
    () => languageFilteredResults.filter((result) => (
      isScraperViewHistoryCardNew(
        viewHistoryRecordsById,
        result.sources.map((source) => buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)),
        newViewHistoryIds,
      )
    )),
    [languageFilteredResults, newViewHistoryIds, viewHistoryRecordsById],
  );
  const displayedResults = React.useMemo(
    () => {
      const noDoublesResults = visibleResults.reduce<MultiSearchMergedResult[]>((accumulator, current) => {
        if (current.sources.length === 1 && accumulator.some((result) => result.sources.length === 1 && result.sources[0] === current.sources[0])) {
          return accumulator;
        }

        return [...accumulator, current];
      }, []);
      return noDoublesResults;
    }, [visibleResults],
  );
  const visibleSourceCount = React.useMemo(
    () => displayedResults.reduce((count, result) => count + result.sources.length, 0),
    [displayedResults],
  );
  const feedback = error || openError || message;
  const statusPanelId = React.useId();
  const statusSummary = React.useMemo(
    () => buildStatusSummary(statusItems),
    [statusItems],
  );

  React.useEffect(() => {
    setIsStatusPanelOpen(false);
  }, [title]);

  return (
    <section className="multi-search__results scraper-latest-results">
      <div className="multi-search__section-head">
        <div>
          <h3>{title}</h3>
          <p>{summary}</p>
          <p>
            {displayedResults.length} carte(s), {visibleSourceCount} source(s) non vue(s).
          </p>
          <div className="multi-search__result-filter-stack">
            <MultiSearchLanguageFilterBar
              languageCodes={resultLanguageCodes}
              filterModes={languageFilterModes}
              onToggleFilterMode={onToggleLanguageFilterMode}
            />
          </div>
        </div>
        <div className="multi-search__section-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onReload();
            }}
            disabled={loading || actionsDisabled}
          >
            {loading ? "Chargement..." : actionLabel}
          </button>
          {secondaryActionLabel && onSecondaryAction ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onSecondaryAction();
              }}
              disabled={loading || actionsDisabled}
            >
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <div className={[
          "multi-search__message",
          error || openError ? "is-error" : "is-info",
        ].join(" ")}
        >
          {feedback}
        </div>
      ) : null}

      {statusItems.length ? (
        <div className="scraper-latest-results__status-panel">
          <button
            type="button"
            className="scraper-latest-results__status-toggle"
            aria-expanded={isStatusPanelOpen}
            aria-controls={statusPanelId}
            onClick={() => setIsStatusPanelOpen((currentValue) => !currentValue)}
          >
            <span>Detail des sources</span>
            <strong>{statusSummary}</strong>
          </button>
          {isStatusPanelOpen ? (
            <div id={statusPanelId} className="multi-search__status-list scraper-latest-results__status-list">
              {statusItems.map((item) => (
                <div key={item.key} className={`multi-search__status is-${item.status}`}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.detail}</span>
                  </div>
                  {item.error ? <p>{item.error}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {displayedResults.length ? (
        <MultiSearchVirtualizedResultsGrid
          results={displayedResults}
          libraryMangas={libraryMangas}
          bookmarkedSourceKeys={bookmarkedSourceKeys}
          sourceProgressIndex={sourceProgressIndex}
          viewHistoryRecordsById={viewHistoryRecordsById}
          newViewHistoryIds={newViewHistoryIds}
          tagBlacklistByScraper={tagBlacklistByScraper}
          tagFavorites={tagFavorites}
          viewHistoryRecordingDisabled={loading}
          onOpenSource={onOpenSource}
          onOpenSourceInWorkspace={onOpenSourceInWorkspace}
          onOpenProgressReader={onOpenProgressReader}
          onSetSourcesRead={onSetSourcesRead}
        />
      ) : !loading ? (
        <div className="multi-search__message is-info">{emptyLabel}</div>
      ) : null}

      {displayedResults.length > 0 && continueActionLabel && onContinue ? (
        <div className="scraper-latest-results__continue">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onContinue();
            }}
            disabled={loading || actionsDisabled}
          >
            {loading ? "Chargement..." : continueActionLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}
