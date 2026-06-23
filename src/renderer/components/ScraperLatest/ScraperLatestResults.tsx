import React from "react";
import type {
  ScraperTagFavoriteRecord,
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchVirtualizedResultsGrid from "@/renderer/components/MultiSearch/MultiSearchVirtualizedResultsGrid";
import {
  buildMultiSearchResultLanguageFilterCodes,
  filterMultiSearchMergedResultsByLanguage,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import useIncrementalMultiSearchMerge from "@/renderer/components/MultiSearch/useIncrementalMultiSearchMerge";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchMergeProgress,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { MultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import { buildSearchResultViewHistoryIdentity, isScraperViewHistoryCardNew } from "@/renderer/utils/scraperViewHistory";
import type { Manga } from "@/renderer/types";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";
import { applyManualMultiSearchSplits } from "@/renderer/components/MultiSearch/multiSearchManualSplit";

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
  enableRomajiPhoneticMerge?: boolean;
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
  enableRomajiPhoneticMerge = false,
  onReload,
  onSecondaryAction,
  onContinue,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
  onToggleLanguageFilterMode,
}: Props) {
  const [mergeRefreshKey, setMergeRefreshKey] = React.useState(0);
  const [isStatusPanelOpen, setIsStatusPanelOpen] = React.useState(false);
  const [splitResultIds, setSplitResultIds] = React.useState<Set<string>>(() => new Set());
  const { mergedResults, mergeProgress } = useIncrementalMultiSearchMerge(
    sources,
    mergeRefreshKey,
    { enableRomajiPhoneticMerge },
  );
  const resultLanguageCodes = React.useMemo(
    () => buildMultiSearchResultLanguageFilterCodes(sources),
    [sources],
  );
  const manuallySplitResults = React.useMemo(
    () => applyManualMultiSearchSplits(mergedResults, splitResultIds),
    [mergedResults, splitResultIds],
  );
  const languageFilteredResults = React.useMemo(
    () => filterMultiSearchMergedResultsByLanguage(manuallySplitResults, languageFilterModes),
    [languageFilterModes, manuallySplitResults],
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
  const visibleSourceCount = React.useMemo(
    () => visibleResults.reduce((count, result) => count + result.sources.length, 0),
    [visibleResults],
  );
  const mergeProgressMax = Math.max(mergeProgress.totalSourceCount, 1);
  const mergeProgressClassName = [
    "multi-search__merge-progress",
    mergeProgress.isActive ? "is-visible" : "",
  ].filter(Boolean).join(" ");
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
            {visibleResults.length} carte(s), {visibleSourceCount} source(s) non vue(s).
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
              setMergeRefreshKey((currentKey) => currentKey + 1);
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
                setMergeRefreshKey((currentKey) => currentKey + 1);
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

      {visibleResults.length ? (
        <MultiSearchVirtualizedResultsGrid
          results={visibleResults}
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
          onSplitResult={(resultId) => setSplitResultIds((currentIds) => {
            const nextIds = new Set(currentIds);
            nextIds.add(resultId);
            return nextIds;
          })}
        />
      ) : !loading ? (
        <div className="multi-search__message is-info">{emptyLabel}</div>
      ) : null}

      {visibleResults.length > 0 && continueActionLabel && onContinue ? (
        <div className="scraper-latest-results__continue">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMergeRefreshKey((currentKey) => currentKey + 1);
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
