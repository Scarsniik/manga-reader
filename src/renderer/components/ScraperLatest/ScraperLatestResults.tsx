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
import {
  countBlacklistedMultiSearchResults,
  filterBlacklistedMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchTagBlacklist";
import BlacklistedCardsDisplayToggle from "@/renderer/components/BlacklistedCardsDisplayToggle";

type StatusItem = {
  key: string;
  name: string;
  status: string;
  state?: "loading" | "continuable" | "complete" | "error";
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
  continueActionDisabled?: boolean;
  continueActionTitle?: string;
  continueCount?: number;
  replaceContinueActionLabel?: string;
  replaceContinueActionDisabled?: boolean;
  replaceContinueActionTitle?: string;
  settingsActionLabel?: string;
  settingsActionActive?: boolean;
  actionsDisabled?: boolean;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  preserveStoredResults?: boolean;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  tagFavorites?: ScraperTagFavoriteRecord[];
  hideBlacklistedCards?: boolean;
  showBlacklistedCardsLocally?: boolean;
  hiddenBlacklistedCardCount?: number;
  languageFilterModes: MultiSearchLanguageFilterModes;
  enableRomajiPhoneticMerge?: boolean;
  onShowBlacklistedCardsLocallyChange?: (showBlacklistedCards: boolean) => void;
  onReload: () => void;
  onSecondaryAction?: () => void;
  onContinue?: (count: number) => void;
  onContinueCountChange?: (count: number) => void;
  onReplaceContinue?: () => void;
  onOpenSettings?: () => void;
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
    const state = item.state ?? resolveStatusItemState(item);
    result[state] = (result[state] ?? 0) + 1;
    return result;
  }, {});
  const parts = [
    counts.loading ? `${counts.loading} en cours` : "",
    counts.continuable ? `${counts.continuable} avec suite` : "",
    counts.complete ? `${counts.complete} sans suite` : "",
    counts.error ? `${counts.error} erreur(s)` : "",
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : `${items.length} source(s)`;
};

const resolveStatusItemState = (item: StatusItem): NonNullable<StatusItem["state"]> => {
  if (item.state) {
    return item.state;
  }

  if (item.status === "waiting" || item.status === "loading") {
    return "loading";
  }

  if (item.status === "error") {
    return "error";
  }

  return "complete";
};

const getStatusItemStateLabel = (state: NonNullable<StatusItem["state"]>): string => {
  if (state === "loading") {
    return "En cours";
  }

  if (state === "continuable") {
    return "Fini avec suite disponible";
  }

  if (state === "error") {
    return "Erreur";
  }

  return "Fini sans suite";
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
  continueActionDisabled = false,
  continueActionTitle,
  continueCount = 1,
  replaceContinueActionLabel,
  replaceContinueActionDisabled = false,
  replaceContinueActionTitle,
  settingsActionLabel,
  settingsActionActive = false,
  actionsDisabled = false,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  newViewHistoryIds,
  preserveStoredResults = false,
  tagBlacklistByScraper,
  tagFavorites = [],
  hideBlacklistedCards = false,
  showBlacklistedCardsLocally = false,
  hiddenBlacklistedCardCount = 0,
  languageFilterModes,
  enableRomajiPhoneticMerge = false,
  onShowBlacklistedCardsLocallyChange,
  onReload,
  onSecondaryAction,
  onContinue,
  onContinueCountChange,
  onReplaceContinue,
  onOpenSettings,
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
    () => preserveStoredResults
      ? languageFilteredResults
      : languageFilteredResults.filter((result) => (
        isScraperViewHistoryCardNew(
          viewHistoryRecordsById,
          result.sources.map((source) => buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)),
          newViewHistoryIds,
        )
      )),
    [languageFilteredResults, newViewHistoryIds, preserveStoredResults, viewHistoryRecordsById],
  );
  const visibleBlacklistedResultCount = React.useMemo(
    () => countBlacklistedMultiSearchResults(visibleResults, tagBlacklistByScraper),
    [tagBlacklistByScraper, visibleResults],
  );
  const shouldHideBlacklistedCards = hideBlacklistedCards && !showBlacklistedCardsLocally;
  const displayedResults = React.useMemo(
    () => filterBlacklistedMultiSearchResults(
      visibleResults,
      tagBlacklistByScraper,
      shouldHideBlacklistedCards,
    ),
    [shouldHideBlacklistedCards, tagBlacklistByScraper, visibleResults],
  );
  const blacklistedCardCount = Math.max(0, hiddenBlacklistedCardCount) + visibleBlacklistedResultCount;
  const mergedCardCount = manuallySplitResults.length;
  const languageHiddenCardCount = Math.max(0, mergedCardCount - languageFilteredResults.length);
  const visibleSourceCount = React.useMemo(
    () => displayedResults.reduce((count, result) => count + result.sources.length, 0),
    [displayedResults],
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
  const normalizedContinueCount = Math.max(1, Math.floor(continueCount || 1));
  const isContinueDisabled = loading || actionsDisabled || continueActionDisabled;
  const isReplaceContinueDisabled = loading || actionsDisabled || replaceContinueActionDisabled;
  const resolvedContinueActionTitle = continueActionDisabled
    ? continueActionTitle ?? "Aucun resultat charge : lance un scan qui trouve au moins un resultat avant de continuer."
    : loading
      ? "Chargement en cours."
      : `Continuer le scan ${normalizedContinueCount} fois.`;
  const resolvedReplaceContinueActionTitle = replaceContinueActionDisabled
    ? replaceContinueActionTitle ?? "Aucune suite disponible."
    : loading
      ? "Chargement en cours."
      : "Continuer le scan en remplacant les resultats actuels.";

  React.useEffect(() => {
    setIsStatusPanelOpen(false);
  }, [title]);

  return (
    <section className="multi-search__results scraper-latest-results">
      <div className="multi-search__section-head scraper-latest-results__head">
        <div className="scraper-latest-results__head-top">
          <h3>{title}</h3>
          <div className="multi-search__section-actions">
            {onShowBlacklistedCardsLocallyChange ? (
              <BlacklistedCardsDisplayToggle
                blacklistedCardCount={blacklistedCardCount}
                hideBlacklistedCards={hideBlacklistedCards}
                showBlacklistedCardsLocally={showBlacklistedCardsLocally}
                onShowBlacklistedCardsLocallyChange={onShowBlacklistedCardsLocallyChange}
              />
            ) : null}
            {settingsActionLabel && onOpenSettings ? (
              <button
                type="button"
                className={settingsActionActive ? "secondary is-active" : "secondary"}
                onClick={onOpenSettings}
                disabled={loading}
              >
                {settingsActionLabel}
              </button>
            ) : null}
            {continueActionLabel && onContinue ? (
              <div className="scraper-latest-results__continue-action">
                <label className="scraper-latest-results__continue-count">
                  <span>Passes</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={normalizedContinueCount}
                    onChange={(event) => {
                      onContinueCountChange?.(Number.parseInt(event.currentTarget.value, 10) || 1);
                    }}
                    disabled={loading || actionsDisabled}
                    aria-label="Nombre de continuations"
                  />
                </label>
                <span className="scraper-latest-results__action-tooltip" title={resolvedContinueActionTitle}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setMergeRefreshKey((currentKey) => currentKey + 1);
                      onContinue(normalizedContinueCount);
                    }}
                    disabled={isContinueDisabled}
                    title={resolvedContinueActionTitle}
                  >
                    {loading ? "Chargement..." : continueActionLabel}
                  </button>
                </span>
              </div>
            ) : null}
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
        <div className="scraper-latest-results__summary">
          <p>{summary}</p>
          {preserveStoredResults ? (
            <p>
              {sources.length} résultat(s) avant fusion · {mergedCardCount} card(s) fusionnée(s) · {displayedResults.length} affichée(s)
              {shouldHideBlacklistedCards && blacklistedCardCount > 0
                ? ` · ${blacklistedCardCount} masquee(s) par la blacklist`
                : ""}
              {languageHiddenCardCount > 0
                ? ` · ${languageHiddenCardCount} exclue(s) par le filtre de langue`
                : ""}.
            </p>
          ) : (
            <p>
              {displayedResults.length} card(s), {visibleSourceCount} source(s) non vue(s)
              {shouldHideBlacklistedCards && blacklistedCardCount > 0
                ? `, ${blacklistedCardCount} masquee(s)`
                : ""}.
            </p>
          )}
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
              {statusItems.map((item) => {
                const state = resolveStatusItemState(item);
                const stateLabel = getStatusItemStateLabel(state);
                return (
                  <div key={item.key} className={`multi-search__status is-${item.status} is-${state}`}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <span
                      className={`scraper-latest-results__status-icon is-${state}`}
                      role="img"
                      aria-label={stateLabel}
                      title={stateLabel}
                    />
                    {item.error ? <p>{item.error}</p> : null}
                  </div>
                );
              })}
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
          onSplitResult={(resultId) => setSplitResultIds((currentIds) => {
            const nextIds = new Set(currentIds);
            nextIds.add(resultId);
            return nextIds;
          })}
        />
      ) : !loading ? (
        <div className="multi-search__message is-info">
          {shouldHideBlacklistedCards && blacklistedCardCount > 0
            ? "Toutes les nouveautes visibles sont masquees par la blacklist."
            : emptyLabel}
        </div>
      ) : null}

      {displayedResults.length > 0 && replaceContinueActionLabel && onReplaceContinue ? (
        <div className="scraper-latest-results__continue">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMergeRefreshKey((currentKey) => currentKey + 1);
              onReplaceContinue();
            }}
            disabled={isReplaceContinueDisabled}
            title={resolvedReplaceContinueActionTitle}
          >
            {loading ? "Chargement..." : replaceContinueActionLabel}
          </button>
        </div>
      ) : null}

    </section>
  );
}
