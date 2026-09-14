import React from "react";
import type {
  ScraperAuthorFavoriteSource,
  ScraperRecord,
  ScraperTagFavoriteRecord,
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import { MagnifyingGlassIcon } from "@/renderer/components/icons";
import MultiSearchLanguageFilterBar from "@/renderer/components/MultiSearch/MultiSearchLanguageFilterBar";
import MultiSearchReadingStatusFilterBar from "@/renderer/components/MultiSearch/MultiSearchReadingStatusFilterBar";
import MultiSearchVirtualizedResultsGrid from "@/renderer/components/MultiSearch/MultiSearchVirtualizedResultsGrid";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import MultiSearchTextFilterBar from "@/renderer/components/MultiSearch/MultiSearchTextFilterBar";
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
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import BlacklistedCardsDisplayToggle, {
  useLocalBlacklistedCardsDisplay,
} from "@/renderer/components/BlacklistedCardsDisplayToggle";
import OriginalWorksFilterToggle from "@/renderer/components/OriginalWorksFilterToggle/OriginalWorksFilterToggle";
import ResultFilterToggle from "@/renderer/components/ResultFilterToggle/ResultFilterToggle";
import useFrozenScraperUnseenFilter from "@/renderer/hooks/useFrozenScraperUnseenFilter";
import QuickReviewLauncher from "@/renderer/components/QuickReview/QuickReviewLauncher";
import { buildQuickReviewItemsFromMergedResults } from "@/renderer/components/QuickReview/quickReviewItems";
import ScraperAuthorSeriesResults from "@/renderer/components/ScraperAuthorFavorites/ScraperAuthorSeriesResults";
import {
  buildAuthorSeriesGroups,
  type AuthorSeriesAssignmentOverride,
  type AuthorSeriesChapterGroup,
  type AuthorSeriesGroup,
} from "@/renderer/components/ScraperAuthorFavorites/authorSeriesGroups";
import AuthorSeriesCorrespondenceView from "@/renderer/components/ScraperAuthorFavorites/AuthorSeriesCorrespondenceView";
import {
  applyAuthorSeriesCorrespondenceSnapshots,
  buildAuthorSeriesPrefilledCorrespondenceResult,
  type AuthorSeriesCorrespondenceSnapshot,
} from "@/renderer/components/ScraperAuthorFavorites/authorSeriesCorrespondence";
import { createPrefilledBackgroundSearch } from "@/renderer/backgroundSearch/backgroundSearchClient";
import { buildMangaCorrespondenceInput } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceInput";
import useParams from "@/renderer/hooks/useParams";
import useModal from "@/renderer/hooks/useModal";
import AuthorSeriesAssignmentDialog from "@/renderer/components/ScraperAuthorFavorites/AuthorSeriesAssignmentDialog";
import useAuthorSeriesChapterCoverages from "@/renderer/components/ScraperAuthorFavorites/useAuthorSeriesChapterCoverages";
import useVisualMultiSearchMerge from "@/renderer/components/MultiSearch/useVisualMultiSearchMerge";
import {
  buildAuthorSeriesQuickReview,
} from "@/renderer/components/ScraperAuthorFavorites/authorSeriesQuickReview";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import { BACKGROUND_SEARCH_RESULTS_VIEW_ID } from "@/renderer/utils/scraperBrowserNavigation";
import useAdaptiveMultiSearchListProcessing from "@/renderer/components/MultiSearch/useAdaptiveMultiSearchListProcessing";

type ResultsViewMode = "cards" | "series";

// Deep cover/chapter enrichment is useful for ambiguous small result sets, but
// it is counterproductive for very large authors: grouping by parsed titles is
// immediate and avoids hundreds of network requests just to change the view.
const AUTHOR_SERIES_DEEP_ANALYSIS_LIMIT = 300;

type Props = {
  title: string;
  description: string;
  runs: AuthorFavoriteSourceRun[];
  displayedResults: MultiSearchMergedResult[];
  loadedSourceCount: number;
  resultLanguageCodes: string[];
  languageFilterModes: MultiSearchLanguageFilterModes;
  readingStatusFilters: MultiSearchReadingStatusFilter[];
  textFilter: string;
  debouncedTextFilter: string;
  showUnseenFirst: boolean;
  loading: boolean;
  message: string | null;
  error: string | null;
  canLoadMore: boolean;
  multiSearchQuery: string;
  scrapers: ScraperRecord[];
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  newViewHistoryIds: Set<string>;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  tagFavorites?: ScraperTagFavoriteRecord[];
  hideBlacklistedCards?: boolean;
  readOnly?: boolean;
  backLabel?: string | null;
  sourceSectionTitle?: string;
  resultsSectionTitle?: string;
  loadingMessage?: string;
  viewModeAction?: React.ReactNode;
  favoriteAction?: React.ReactNode;
  statusNotice?: React.ReactNode;
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
  renderSourceAction?: (run: AuthorFavoriteSourceRun) => React.ReactNode;
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
  selectedCoverUrl?: string;
  onSelectCover?: (coverUrl: string) => void;
};

export default function ScraperAuthorCombinedResults({
  title,
  description,
  runs,
  displayedResults,
  loadedSourceCount,
  resultLanguageCodes,
  languageFilterModes,
  readingStatusFilters,
  textFilter,
  debouncedTextFilter,
  showUnseenFirst,
  loading,
  message,
  error,
  canLoadMore,
  multiSearchQuery,
  scrapers,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  newViewHistoryIds,
  tagBlacklistByScraper,
  tagFavorites = [],
  hideBlacklistedCards = false,
  readOnly = false,
  backLabel = null,
  sourceSectionTitle = "Sources",
  resultsSectionTitle = "Resultats combines",
  loadingMessage = "Chargement de l'auteur combine...",
  viewModeAction = null,
  favoriteAction = null,
  statusNotice = null,
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
  renderSourceAction,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
  selectedCoverUrl,
  onSelectCover,
}: Props) {
  const [splitResultIds, setSplitResultIds] = React.useState<Set<string>>(() => new Set());
  const [originalOnly, setOriginalOnly] = React.useState(false);
  const [resultsViewMode, setResultsViewMode] = React.useState<ResultsViewMode>("cards");
  const [openingSeriesId, setOpeningSeriesId] = React.useState<string | null>(null);
  const [activeSeriesJob, setActiveSeriesJob] = React.useState<{
    seriesId: string;
    jobId: string;
  } | null>(null);
  const seriesJobsByIdRef = React.useRef(new Map<string, string>());
  const [seriesSnapshots, setSeriesSnapshots] = React.useState<
    Map<string, AuthorSeriesCorrespondenceSnapshot>
  >(() => new Map());
  const [seriesAssignments, setSeriesAssignments] = React.useState<
    Map<string, AuthorSeriesAssignmentOverride>
  >(() => new Map());
  const [seriesOpenError, setSeriesOpenError] = React.useState<string | null>(null);
  const { params } = useParams();
  const { openModal, closeModal } = useModal();
  const seriesMergeOptions = React.useMemo(() => ({
    enableRomajiPhoneticMerge: true,
    assumeSameAuthor: true,
    preferredTitleLanguageCodes: displayedResults[0]?.preferredTitleLanguageCodes ?? [],
  }), [displayedResults]);
  const visualCoverMatchingEnabled = params?.scraperVisualCoverMatchingEnabled !== false;
  const seriesDeepAnalysisEnabled = resultsViewMode === "series"
    && displayedResults.length <= AUTHOR_SERIES_DEEP_ANALYSIS_LIMIT;
  const {
    mergedResults: visuallyMergedResults,
    fingerprintsBySourceKey: seriesCoverFingerprints,
    loading: seriesCoverFingerprintsLoading,
  } = useVisualMultiSearchMerge(
    displayedResults,
    seriesMergeOptions,
    visualCoverMatchingEnabled && seriesDeepAnalysisEnabled,
  );
  const {
    active: showUnseenOnly,
    recordsById: unseenFilterRecordsById,
    newCardIds: unseenFilterNewCardIds,
    setActive: setShowUnseenOnly,
  } = useFrozenScraperUnseenFilter(
    viewHistoryRecordsById,
    newViewHistoryIds,
    { resetKey: `${title}\u0000${multiSearchQuery}` },
  );
  const {
    shouldHideBlacklistedCards,
    showBlacklistedCardsLocally,
    setShowBlacklistedCardsLocally,
  } = useLocalBlacklistedCardsDisplay(hideBlacklistedCards);
  const displayListFilters = React.useMemo(() => ({
    languageFilterModes,
    readingStatusFilters,
    textFilter: debouncedTextFilter,
    readingStatusContext: {
      libraryMangas,
      bookmarkedSourceKeys,
      sourceProgressIndex,
      viewHistoryRecordsById,
    },
    display: {
      originalOnly,
      tagBlacklistByScraper,
      hideBlacklistedCards: shouldHideBlacklistedCards,
      viewHistoryRecordsById: unseenFilterRecordsById,
      newViewHistoryIds: unseenFilterNewCardIds,
      showUnseenFirst,
      showUnseenOnly,
      splitResultIds,
    },
  }), [
    bookmarkedSourceKeys,
    debouncedTextFilter,
    languageFilterModes,
    libraryMangas,
    originalOnly,
    readingStatusFilters,
    shouldHideBlacklistedCards,
    showUnseenFirst,
    showUnseenOnly,
    sourceProgressIndex,
    splitResultIds,
    tagBlacklistByScraper,
    unseenFilterNewCardIds,
    unseenFilterRecordsById,
    viewHistoryRecordsById,
  ]);
  const {
    results: visibleDisplayedResults,
    blacklistedResultCount,
    loading: listProcessingLoading,
  } = useAdaptiveMultiSearchListProcessing(visuallyMergedResults, [], displayListFilters);
  const quickReviewItems = React.useMemo(
    () => buildQuickReviewItemsFromMergedResults(visibleDisplayedResults),
    [visibleDisplayedResults],
  );
  const {
    coveragesBySourceKey: seriesChapterCoverages,
    loading: seriesChapterCoveragesLoading,
  } = useAuthorSeriesChapterCoverages(
    visibleDisplayedResults,
    seriesDeepAnalysisEnabled,
  );
  const seriesAnalysisLoading = listProcessingLoading
    || seriesChapterCoveragesLoading
    || seriesCoverFingerprintsLoading;
  const automaticSeriesGroups = React.useMemo(
    () => buildAuthorSeriesGroups(
      visibleDisplayedResults,
      seriesMergeOptions,
      new Map(),
      seriesChapterCoverages,
      seriesCoverFingerprints,
    ),
    [
      seriesChapterCoverages,
      seriesCoverFingerprints,
      seriesMergeOptions,
      visibleDisplayedResults,
    ],
  );
  const synchronizedAutomaticSeriesGroups = React.useMemo(
    () => applyAuthorSeriesCorrespondenceSnapshots(
      automaticSeriesGroups,
      seriesSnapshots,
      seriesMergeOptions,
    ),
    [automaticSeriesGroups, seriesMergeOptions, seriesSnapshots],
  );
  const assignedSeriesGroups = React.useMemo(() => (
    seriesAssignments.size
      ? buildAuthorSeriesGroups(
        synchronizedAutomaticSeriesGroups.flatMap((series) => (
          series.chapters.map((chapter) => chapter.result)
        )),
        seriesMergeOptions,
        seriesAssignments,
        seriesChapterCoverages,
        seriesCoverFingerprints,
      )
      : synchronizedAutomaticSeriesGroups
  ), [
    seriesAssignments,
    seriesChapterCoverages,
    seriesCoverFingerprints,
    seriesMergeOptions,
    synchronizedAutomaticSeriesGroups,
  ]);
  const seriesGroups = React.useMemo(
    () => applyAuthorSeriesCorrespondenceSnapshots(
      assignedSeriesGroups,
      seriesSnapshots,
      seriesMergeOptions,
    ),
    [assignedSeriesGroups, seriesMergeOptions, seriesSnapshots],
  );
  const seriesQuickReview = React.useMemo(
    () => buildAuthorSeriesQuickReview(seriesGroups, title),
    [seriesGroups, title],
  );
  const seriesGroupCount = React.useMemo(
    () => seriesGroups.filter((series) => series.kind === "series").length,
    [seriesGroups],
  );
  const oneShotCount = React.useMemo(
    () => seriesGroups.find((series) => series.kind === "oneShots")?.chapters.length ?? 0,
    [seriesGroups],
  );

  React.useEffect(() => {
    setActiveSeriesJob(null);
    setOpeningSeriesId(null);
    setSeriesOpenError(null);
    const emptySeriesJobs = new Map<string, string>();
    seriesJobsByIdRef.current = emptySeriesJobs;
    setSeriesSnapshots(new Map());
    setSeriesAssignments(new Map());
  }, [multiSearchQuery, title]);

  const ensureSeriesJobId = React.useCallback(async (seriesId: string): Promise<string | null> => {
    const series = seriesGroups.find((candidate) => candidate.id === seriesId);
    if (!series || series.kind !== "series") return null;

    const existingJobId = seriesJobsByIdRef.current.get(seriesId);
    if (existingJobId) return existingJobId;

    const input = buildMangaCorrespondenceInput({
      params,
      reference: series.reference,
      request: "otherChapters",
      strategy: "balanced",
      scrapers,
    });
    const result = buildAuthorSeriesPrefilledCorrespondenceResult(series);
    const metadata = await createPrefilledBackgroundSearch({
      input,
      kind: "mangaCorrespondence",
      params,
      primaryTerm: series.title,
      result,
      resultCount: result.matches.length,
      title: `Correspondances · ${series.title}`,
    });
    const nextJobs = new Map(seriesJobsByIdRef.current);
    nextJobs.set(seriesId, metadata.id);
    seriesJobsByIdRef.current = nextJobs;
    return metadata.id;
  }, [params, scrapers, seriesGroups]);

  const handleOpenSeries = React.useCallback(async (seriesId: string) => {
    setOpeningSeriesId(seriesId);
    setSeriesOpenError(null);
    try {
      const jobId = await ensureSeriesJobId(seriesId);
      if (!jobId) return;
      setActiveSeriesJob({ seriesId, jobId });
    } catch (openError) {
      setSeriesOpenError(openError instanceof Error
        ? openError.message
        : "Impossible d'ouvrir la correspondance de cette série.");
    } finally {
      setOpeningSeriesId(null);
    }
  }, [ensureSeriesJobId]);

  const handleOpenSeriesInWorkspace = React.useCallback(async (seriesId: string) => {
    const series = seriesGroups.find((candidate) => candidate.id === seriesId);
    if (!series || series.kind !== "series") return false;

    const jobId = await ensureSeriesJobId(seriesId);
    if (!jobId) return false;
    return openWorkspaceTarget({
      kind: "manga-manager.view",
      viewId: BACKGROUND_SEARCH_RESULTS_VIEW_ID,
      title: `Correspondances · ${series.title}`,
      locationState: { backgroundSearchJobId: jobId },
    }, { activate: false });
  }, [ensureSeriesJobId, seriesGroups]);

  const handleSeriesSnapshot = React.useCallback((
    seriesId: string,
    snapshot: AuthorSeriesCorrespondenceSnapshot,
  ) => {
    setSeriesSnapshots((currentSnapshots) => {
      if (currentSnapshots.get(seriesId) === snapshot) return currentSnapshots;
      const nextSnapshots = new Map(currentSnapshots);
      nextSnapshots.set(seriesId, snapshot);
      return nextSnapshots;
    });
  }, []);
  const handleActiveSeriesSnapshot = React.useCallback((
    snapshot: AuthorSeriesCorrespondenceSnapshot,
  ) => {
    if (activeSeriesJob) handleSeriesSnapshot(activeSeriesJob.seriesId, snapshot);
  }, [activeSeriesJob, handleSeriesSnapshot]);

  const handleCorrectSeriesAssignment = React.useCallback((
    series: AuthorSeriesGroup,
    chapter: AuthorSeriesChapterGroup,
  ) => {
    const sourceKeys = chapter.result.sources.map(buildMultiSearchSourceIdentityKey);
    const existingAssignments = sourceKeys.flatMap((sourceKey) => {
      const assignment = seriesAssignments.get(sourceKey);
      return assignment ? [assignment] : [];
    });
    const assignedSeriesTitles = new Set(existingAssignments.map((assignment) => (
      assignment.seriesTitle
    )));
    const assignedChapters = new Set(existingAssignments.map((assignment) => assignment.chapter));
    const currentSeries = assignedSeriesTitles.size === 1
      ? Array.from(assignedSeriesTitles)[0]
      : series.kind === "series" ? series.title : "";
    const currentChapter = assignedChapters.size === 1
      ? Array.from(assignedChapters)[0]
      : series.kind === "series" && chapter.chapter !== "Non renseigné"
        ? chapter.chapter
        : "";
    const seriesOptions = seriesGroups.flatMap((candidate) => (
      candidate.kind === "series" ? [candidate.title] : []
    ));

    openModal({
      title: "Corriger le classement",
      className: "author-series-assignment-modal",
      content: (
        <AuthorSeriesAssignmentDialog
          cardTitle={chapter.result.title}
          currentSeries={currentSeries}
          currentChapter={currentChapter}
          seriesOptions={seriesOptions}
          canReset={existingAssignments.length > 0}
          onCancel={closeModal}
          onReset={async () => {
            setSeriesAssignments((currentAssignments) => {
              const nextAssignments = new Map(currentAssignments);
              sourceKeys.forEach((sourceKey) => nextAssignments.delete(sourceKey));
              return nextAssignments;
            });
            closeModal();
          }}
          onSave={async (seriesTitle, chapterValue) => {
            setSeriesAssignments((currentAssignments) => {
              const nextAssignments = new Map(currentAssignments);
              sourceKeys.forEach((sourceKey) => nextAssignments.set(sourceKey, {
                seriesTitle,
                chapter: chapterValue,
              }));
              return nextAssignments;
            });
            closeModal();
          }}
        />
      ),
    });
  }, [closeModal, openModal, seriesAssignments, seriesGroups]);

  const renderResultCard = (result: MultiSearchMergedResult) => (
    <MultiSearchResultCard
      key={result.id}
      result={result}
      libraryMangas={libraryMangas}
      bookmarkedSourceKeys={bookmarkedSourceKeys}
      sourceProgressIndex={sourceProgressIndex}
      viewHistoryRecordsById={viewHistoryRecordsById}
      newViewHistoryIds={newViewHistoryIds}
      tagBlacklistByScraper={tagBlacklistByScraper}
      tagFavorites={tagFavorites}
      viewHistoryRecordingDisabled={loading}
      selectedCoverUrl={selectedCoverUrl}
      onSelectCover={onSelectCover}
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
  );

  const renderResultCards = (results: MultiSearchMergedResult[]) => (
    <MultiSearchVirtualizedResultsGrid
      results={results}
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
      selectedCoverUrl={selectedCoverUrl}
      onSelectCover={onSelectCover}
      onSplitResult={(resultId) => setSplitResultIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(resultId);
        return nextIds;
      })}
    />
  );

  if (activeSeriesJob) {
    return (
      <AuthorSeriesCorrespondenceView
        jobId={activeSeriesJob.jobId}
        onBack={() => setActiveSeriesJob(null)}
        onSnapshot={handleActiveSeriesSnapshot}
      />
    );
  }

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
        {!readOnly ? <div className="scraper-author-favorites-view__header-actions">
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
        </div> : null}
      </div>

      {statusNotice}
      {message ? <div className="multi-search__message is-info">{message}</div> : null}
      {error ? <div className="multi-search__message is-error">{error}</div> : null}
      {seriesOpenError ? (
        <div className="multi-search__message is-error">{seriesOpenError}</div>
      ) : null}

      <section className="scraper-author-favorites-view__sources">
        <div className="multi-search__section-head">
          <div>
            <h3>{sourceSectionTitle}</h3>
            <p>{runs.length} source(s), {loadedSourceCount} resultat(s) charge(s).</p>
          </div>
          {!readOnly ? <div className="scraper-author-favorites-view__source-actions">
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
          </div> : null}
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
                {renderSourceAction?.(run)}
                {!readOnly ? <button
                  type="button"
                  className="scraper-author-favorites-view__source-more"
                  onClick={() => onLoadMoreForRun(run.key)}
                  disabled={loading || !run.hasNextPage || run.status === "loading"}
                >
                  Plus
                </button> : null}
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
                {resultsViewMode === "series" ? `${seriesGroupCount} série(s), ` : ""}
                {resultsViewMode === "series" && oneShotCount
                  ? `${oneShotCount} one-shot(s), `
                  : ""}
                {visibleDisplayedResults.length} carte(s), {loadedSourceCount} source(s) chargee(s)
                {seriesAnalysisLoading ? ", analyse du classement…" : ""}
                {shouldHideBlacklistedCards && blacklistedResultCount > 0
                  ? `, ${blacklistedResultCount} masquee(s)`
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
                  <OriginalWorksFilterToggle
                    active={originalOnly}
                    onChange={setOriginalOnly}
                    label="Originaux"
                    variant="result"
                  />
                  <ResultFilterToggle
                    active={showUnseenOnly}
                    label="Non vus seulement"
                    inactiveTitle="Afficher les cards non vues au moment d'activer ce filtre"
                    activeTitle="Afficher aussi les cards déjà vues"
                    onChange={setShowUnseenOnly}
                    variant="result"
                  />
                </div>
              </div>
            </div>
            <div className="multi-search__section-actions">
              <div className="scraper-author-series-view-mode" aria-label="Mode d’affichage">
                <button
                  type="button"
                  className={resultsViewMode === "cards" ? "is-active" : ""}
                  aria-pressed={resultsViewMode === "cards"}
                  onClick={() => setResultsViewMode("cards")}
                >
                  Cartes
                </button>
                <button
                  type="button"
                  className={resultsViewMode === "series" ? "is-active" : ""}
                  aria-pressed={resultsViewMode === "series"}
                  onClick={() => setResultsViewMode("series")}
                >
                  Par série
                </button>
              </div>
              <QuickReviewLauncher
                disabled={resultsViewMode === "series" && seriesAnalysisLoading}
                items={resultsViewMode === "series"
                  ? seriesQuickReview.items
                  : quickReviewItems}
                onOpenSeries={resultsViewMode === "series"
                  ? handleOpenSeriesInWorkspace
                  : undefined}
                seriesSession={resultsViewMode === "series"
                  ? seriesQuickReview.seriesSession
                  : undefined}
              />
              <BlacklistedCardsDisplayToggle
                blacklistedCardCount={blacklistedResultCount}
                hideBlacklistedCards={hideBlacklistedCards}
                showBlacklistedCardsLocally={showBlacklistedCardsLocally}
                onShowBlacklistedCardsLocallyChange={setShowBlacklistedCardsLocally}
              />
            </div>
          </div>

          {resultsViewMode === "series" ? (
            <>
              {seriesAnalysisLoading && visibleDisplayedResults.length ? (
              <div className="scraper-browser__message">
                  Groupes affichés · analyse des chapitres et des couvertures en cours…
              </div>
              ) : null}
              <ScraperAuthorSeriesResults
                groups={seriesGroups}
                openingSeriesId={openingSeriesId}
                onOpenSeries={(seriesId) => void handleOpenSeries(seriesId)}
                onCorrectAssignment={handleCorrectSeriesAssignment}
                renderCard={renderResultCard}
              />
            </>
          ) : renderResultCards(visibleDisplayedResults)}
          {!listProcessingLoading && !visibleDisplayedResults.length ? (
            <div className="scraper-browser__message">
              {showUnseenOnly
                ? "Aucune card non vue ne correspond aux filtres actifs."
                : "Aucun resultat ne correspond aux filtres actifs."}
            </div>
          ) : null}
        </section>
      ) : loading ? (
        <div className="scraper-browser__message">{loadingMessage}</div>
      ) : null}
    </section>
  );
}
