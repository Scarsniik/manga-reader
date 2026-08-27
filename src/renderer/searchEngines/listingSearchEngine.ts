import type {
  BackgroundSearchKind,
  BackgroundSearchProgress,
  ListingBackgroundInput,
} from "@/shared/backgroundSearch";
import {
  buildScraperViewHistoryCardId,
  type ScraperAuthorFavoriteCacheSource,
  type ScraperAuthorFavoriteRecord,
  type ScraperLatestCheckpointRecord,
  type ScraperSearchResultItem,
  type ScraperViewHistoryRecord,
} from "@/shared/scraper";
import {
  buildSourceResultsFromItems,
  fetchAuthorPageWithRetry,
  fetchHomepagePageWithRetry,
  fetchSearchPageWithRetry,
  fetchTagPageWithRetry,
  getAuthorConfig,
  getHomepageConfig,
  getPaceConfig,
  getSearchConfig,
  getTagConfig,
  resolveHasNextAuthorPage,
  resolveHasNextHomepagePage,
  resolveHasNextPage,
  resolveHasNextTagPage,
  runWithConcurrency,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { doesMultiSearchSourceMatchIncludedLanguages } from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import { enrichSourceResultsWithJapaneseRomanization } from "@/renderer/components/MultiSearch/multiSearchSourceRomanization";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import {
  createScraperCardDetailsCache,
  doesScraperCardNeedMetadata,
  isScraperListingPaginationEndError,
  SCRAPER_METADATA_REQUIREMENTS_BY_PHASE,
  type ScraperRuntimeSearchPageResult,
} from "@/renderer/utils/scraperRuntime";
import { buildSearchResultViewHistoryIdentity } from "@/renderer/utils/scraperViewHistory";
import type {
  BackgroundListingRun,
  ListingBackgroundResult,
} from "@/renderer/backgroundSearch/types";
import {
  isBackgroundListingSourceUnavailableForQuota,
  resolveBackgroundLanguageProgress,
  resolveBackgroundListingConcurrency,
  resolveBackgroundListingResultLimit,
  resolveBackgroundListingTotalGroupKey,
  resolveScraperLatestSourcePageLimit,
  resolveBackgroundQuickSeenProgress,
  runBackgroundListingTotalGroup,
  usesBackgroundQuickSeenBoundary,
} from "@/renderer/backgroundSearch/backgroundListingExecution";
import {
  BACKGROUND_LISTING_MAX_STAGNANT_BACKFILL_PAGES,
  filterBackgroundListingSourcesByBlacklist,
  isBackgroundListingBackfillPage,
  isBackgroundListingPaginationStalled,
  resolveBackgroundListingAcceptedTarget,
  shouldContinueBackgroundBlacklistBackfill,
} from "@/renderer/backgroundSearch/backgroundListingBlacklist";
import { enrichCandidatesForTarget } from "@/renderer/utils/progressiveCandidateEnrichment";
import {
  buildScraperListingPageRequestKey,
} from "@/renderer/utils/scraperLatestExecutionPlanning";
import {
  createSearchExecutionContext,
  getOrCreateSearchExecutionContext,
  type SearchExecutionContext,
} from "@/renderer/searchEngines/searchExecutionContext";
import {
  findAuthorFavoriteCachedSource,
  loadUsableAuthorFavoriteCaches,
} from "@/renderer/utils/scraperAuthorFavoriteCache";
import {
  buildScraperLatestCursorCheckpointRequest,
  getScraperLatestCheckpointForKey,
  getScraperLatestCheckpoints,
  resolveScraperLatestCheckpointQuotaUnavailableReason,
  saveScraperLatestCheckpoint,
  resolveScraperLatestCheckpointCursor,
} from "@/renderer/utils/scraperLatestCheckpoints";
import {
  appendScraperLatestDiagnosticEvent,
  finishScraperLatestDiagnosticSession,
  shouldGenerateScraperLatestPerformanceReport,
  startScraperLatestDiagnosticSession,
} from "@/renderer/utils/scraperLatestDiagnostics";
import type {
  ScraperLatestDiagnosticSession,
  ScraperRequestDiagnosticContext,
} from "@/shared/scraperLatestDiagnostics";
import {
  enrichScraperListingSourcesWithCardDetails,
  processScraperListingPage,
} from "@/renderer/components/MultiSearch/listingSourcePageProcessing";
import {
  appendUniqueItemsByIdentity,
  buildScraperSearchResultIdentity,
} from "@/renderer/utils/scraperSearchResultIdentity";
import { throwIfSearchAborted } from "@/renderer/searchEngines/searchEngineCancellation";

const normalizeResultUrl = (source: MultiSearchSourceResult): string => (
  buildScraperSearchResultIdentity(source.scraper.id, source.result, "title")
);

const appendUniqueResults = (
  existing: MultiSearchSourceResult[],
  incoming: MultiSearchSourceResult[],
): MultiSearchSourceResult[] => appendUniqueItemsByIdentity(existing, incoming, normalizeResultUrl);

const countListingResults = (runs: BackgroundListingRun[]): number => (
  runs.reduce((count, run) => count + run.results.length, 0)
);

const getKnownHistoryIds = async (): Promise<Set<string>> => {
  const api = window.api ?? {};
  if (typeof api.getScraperViewHistory !== "function") return new Set();
  const records = await api.getScraperViewHistory() as ScraperViewHistoryRecord[];
  return new Set((Array.isArray(records) ? records : []).map((record) => record.id));
};

const isKnownResult = (
  knownIds: Set<string>,
  scraperId: string,
  result: ScraperSearchResultItem,
): boolean => knownIds.has(buildScraperViewHistoryCardId(
  buildSearchResultViewHistoryIdentity(scraperId, result),
));

const loadLatestAuthorCacheAssignments = async (
  input: ListingBackgroundInput,
): Promise<Map<string, ScraperAuthorFavoriteCacheSource | null>> => {
  if (
    input.useAuthorFavoriteCache !== true
    || typeof window.api?.getScraperAuthorFavoriteCache !== "function"
  ) {
    return new Map();
  }

  const sourcesByFavoriteId = new Map<string, ListingBackgroundInput["sources"]>();
  input.sources.forEach((source) => {
    if (!source.favoriteId || !source.favoriteUpdatedAt) {
      return;
    }
    const favoriteSources = sourcesByFavoriteId.get(source.favoriteId) ?? [];
    favoriteSources.push(source);
    sourcesByFavoriteId.set(source.favoriteId, favoriteSources);
  });
  const favorites: ScraperAuthorFavoriteRecord[] = Array.from(sourcesByFavoriteId.entries())
    .map(([favoriteId, sources]) => ({
      id: favoriteId,
      name: sources[0]?.name ?? favoriteId,
      sources: sources.map((source) => ({
        scraperId: source.scraper.id,
        authorUrl: source.query,
        name: source.favoriteSourceName || source.name,
        templateContext: source.templateContext ?? undefined,
        createdAt: source.favoriteUpdatedAt ?? "",
        updatedAt: source.favoriteUpdatedAt ?? "",
      })),
      createdAt: sources[0]?.favoriteUpdatedAt ?? "",
      updatedAt: sources[0]?.favoriteUpdatedAt ?? "",
    }));
  const caches = await loadUsableAuthorFavoriteCaches(
    favorites,
    input.authorFavoriteCacheMaxAgeHours,
    async (favoriteId) => window.api.getScraperAuthorFavoriteCache(favoriteId),
  );
  const assignments = new Map<string, ScraperAuthorFavoriteCacheSource | null>();

  favorites.forEach((favorite) => {
    const cache = caches.get(favorite.id);
    const inputSources = sourcesByFavoriteId.get(favorite.id) ?? [];
    if (!cache) {
      return;
    }

    const unassignedSourceIds = new Set(inputSources.map((source) => source.id));
    cache.sources.forEach((cachedSource) => {
      const exactSource = inputSources.find((source) => (
        unassignedSourceIds.has(source.id)
        && findAuthorFavoriteCachedSource({
          scraperId: source.scraper.id,
          authorUrl: source.query,
          name: source.favoriteSourceName || source.name,
          createdAt: source.favoriteUpdatedAt ?? "",
          updatedAt: source.favoriteUpdatedAt ?? "",
        }, {
          ...cache,
          sources: [cachedSource],
        }) !== null
      ));
      const assignedSource = exactSource ?? inputSources.find((source) => (
        unassignedSourceIds.has(source.id)
        && source.scraper.id === cachedSource.scraperId
      ));
      if (!assignedSource) {
        return;
      }

      assignments.set(assignedSource.id, cachedSource);
      unassignedSourceIds.delete(assignedSource.id);
    });
    unassignedSourceIds.forEach((sourceId) => assignments.set(sourceId, null));
  });

  return assignments;
};

type ListingSourceExecutionState = {
  rawQuotaResultKeys: Set<string>;
  seenCandidateResultKeys: Set<string>;
  pendingResults: MultiSearchSourceResult[];
  pendingCandidates: MultiSearchSourceResult[];
  acceptedResultTarget: number;
  consecutiveStagnantBackfillPages: number;
  consecutiveSeenResultCount: number;
  deepScanPhaseStarted: boolean;
  deepScanCheckpointPending: boolean;
  sourceHasNextPage: boolean;
  sourceExhausted: boolean;
};

export type ListingSearchExecutionOptions = {
  initialRuns?: BackgroundListingRun[];
  appendToExistingResults?: boolean;
  detailsCache?: ReturnType<typeof createScraperCardDetailsCache>;
  executionContext?: SearchExecutionContext;
};

export type ListingSearchEngineKind = Extract<
  BackgroundSearchKind,
  "scraperAuthor" | "latestSources" | "latestAuthors" | "authorFavoriteRefresh"
>;

export type ListingSearchSnapshotCallback = (
  result: ListingBackgroundResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

const createBackgroundConcurrencyRunner = (concurrency: number) => {
  const queuedTasks: Array<() => void> = [];
  let activeTaskCount = 0;

  const runNextTask = () => {
    while (activeTaskCount < concurrency && queuedTasks.length) {
      const queuedTask = queuedTasks.shift();
      if (!queuedTask) return;
      activeTaskCount += 1;
      queuedTask();
    }
  };

  return <Result,>(task: () => Promise<Result>): Promise<Result> => new Promise((resolve, reject) => {
    queuedTasks.push(() => {
      void task()
        .then(resolve, reject)
        .finally(() => {
          activeTaskCount -= 1;
          runNextTask();
        });
    });
    runNextTask();
  });
};

export const runListingSearchEngine = async (
  kind: ListingSearchEngineKind,
  input: ListingBackgroundInput,
  signal: AbortSignal,
  onSnapshot: ListingSearchSnapshotCallback,
  diagnosticSession?: ScraperLatestDiagnosticSession | null,
  executionOptions: ListingSearchExecutionOptions = {},
): Promise<ListingBackgroundResult> => {
  if (!input.sources.length) throw new Error("Aucune source n'est disponible.");
  const filterHistory = kind === "latestSources" || kind === "latestAuthors";
  const knownHistoryIds = filterHistory ? await getKnownHistoryIds() : new Set<string>();
  const latestAuthorCacheAssignments = kind === "latestAuthors"
    ? await loadLatestAuthorCacheAssignments(input)
    : new Map<string, ScraperAuthorFavoriteCacheSource | null>();
  const pace = getPaceConfig(input.paceMode);
  const executionContext = getOrCreateSearchExecutionContext(executionOptions.executionContext, {
    kind,
  });
  const detailsCache = executionOptions.detailsCache ?? executionContext.detailsCache;
  const executionFingerprint = executionContext.checkpointAdapter.fingerprint(input);
  const concurrency = resolveBackgroundListingConcurrency(input.concurrency, pace.concurrency);
  const configuredMaxPages = kind === "latestSources"
    ? resolveScraperLatestSourcePageLimit(input.maxPages)
    : input.maxPages === null
      ? 250
      : Math.max(1, input.maxPages);
  const backfillBlacklistedResults = kind === "latestSources"
    && input.excludeBlacklistedTagCards === true;
  const checkpoints: ScraperLatestCheckpointRecord[] = kind === "latestSources" && input.searchMode === "deep"
    ? await getScraperLatestCheckpoints()
    : [];
  const initialRunsByKey = new Map((executionOptions.initialRuns ?? []).map((run) => [run.key, run]));
  const runs: BackgroundListingRun[] = input.sources.map((source) => {
    const initialRun = initialRunsByKey.get(source.id);
    const module = source.mode === "tag" ? "tag" : source.mode === "search" ? "search" : "homepage";
    const checkpoint = initialRun?.checkpoint ?? (checkpoints.length
      ? getScraperLatestCheckpointForKey(checkpoints, {
        scraperId: source.scraper.id,
        module,
        query: module === "homepage" ? "" : source.query,
        includedLanguageCodes: input.includedLanguageCodes,
      }, source.scraper.updatedAt)
      : null);
    const deepScanPhaseStarted = input.searchMode === "deep"
      && (initialRun?.deepScanPhaseStarted === true || initialRun?.checkpointUsed === true);
    return {
      key: source.id,
      name: source.name,
      scraper: source.scraper,
      query: source.query,
      status: "waiting",
      results: initialRun?.results ?? [],
      pendingResults: initialRun?.pendingResults ?? [],
      pendingCandidates: initialRun?.pendingCandidates ?? [],
      loadedPages: initialRun?.loadedPages ?? 0,
      checkedPages: 0,
      hasNextPage: initialRun?.hasNextPage ?? true,
      currentPageUrl: initialRun?.currentPageUrl,
      nextPageUrl: initialRun?.nextPageUrl,
      checkpoint,
      checkpointUsed: initialRun?.checkpointUsed === true,
      deepScanPhaseStarted,
      deepScanCheckpointPending: initialRun?.deepScanCheckpointPending === true,
      sourceExhausted: initialRun?.sourceExhausted === true,
      safetyLimitReached: initialRun?.safetyLimitReached === true,
      languageRejectLimitReached: initialRun?.languageRejectLimitReached === true,
      quickConsecutiveSeenResultCount: initialRun?.quickConsecutiveSeenResultCount ?? 0,
      excludedByLanguageCount: initialRun?.excludedByLanguageCount,
      includedByLanguageCount: initialRun?.includedByLanguageCount,
      excludedByBlacklistedTagCount: initialRun?.excludedByBlacklistedTagCount,
    };
  });
  const executionPageLimits = runs.map((run) => run.loadedPages + configuredMaxPages);
  const executionStartPageIndexes = runs.map((run) => run.loadedPages);
  const executionStates: ListingSourceExecutionState[] = input.sources.map((_source, sourceIndex) => {
    const initialRun = runs[sourceIndex];
    const initialResults = initialRun.results ?? [];
    const pendingResults = initialRun.pendingResults ?? [];
    const pendingCandidates = initialRun.pendingCandidates ?? [];
    return {
      rawQuotaResultKeys: new Set(initialResults.map(normalizeResultUrl)),
      seenCandidateResultKeys: new Set([
        ...initialResults,
        ...pendingResults,
        ...pendingCandidates,
      ].map(normalizeResultUrl)),
      pendingResults: [...pendingResults],
      pendingCandidates: [...pendingCandidates],
      acceptedResultTarget: 0,
      consecutiveStagnantBackfillPages: 0,
      consecutiveSeenResultCount: initialRun.quickConsecutiveSeenResultCount ?? 0,
      deepScanPhaseStarted: initialRun.deepScanPhaseStarted === true,
      deepScanCheckpointPending: initialRun.deepScanCheckpointPending === true,
      sourceHasNextPage: initialRun.hasNextPage,
      sourceExhausted: initialRun.sourceExhausted === true,
    };
  });
  const listingPagePrefetchCache = executionContext.getPagePrefetchCache<ScraperRuntimeSearchPageResult>(
    `listing:${kind}`,
  );
  const fetchSourceListingPage = (
    sourceIndex: number,
    pageIndex: number,
    nextPageUrl?: string,
    purpose = "listing-demand",
  ): Promise<ScraperRuntimeSearchPageResult> => {
    const source = input.sources[sourceIndex];
    const run = runs[sourceIndex];
    const sourceMode = source.mode ?? (kind === "latestSources" ? "homepage" : "author");
    const diagnostics: ScraperRequestDiagnosticContext | undefined = diagnosticSession ? {
      profileId: diagnosticSession.profileId,
      purpose,
      sourceKey: source.id,
      pageIndex,
    } : undefined;
    if (sourceMode === "homepage") {
      return fetchHomepagePageWithRetry(
        run.scraper,
        getHomepageConfig(run.scraper),
        pageIndex,
        nextPageUrl,
        pace,
        { scrapeDetailsWithCards: false, diagnostics, fetchDocument: executionContext.fetchDocument },
      );
    }
    if (sourceMode === "search") {
      return fetchSearchPageWithRetry(
        run.scraper,
        getSearchConfig(run.scraper),
        run.query,
        pageIndex,
        nextPageUrl,
        pace,
        { scrapeDetailsWithCards: false, diagnostics, fetchDocument: executionContext.fetchDocument },
      );
    }
    if (sourceMode === "tag") {
      return fetchTagPageWithRetry(
        run.scraper,
        getTagConfig(run.scraper),
        run.query,
        pageIndex,
        nextPageUrl,
        pace,
        { scrapeDetailsWithCards: false, diagnostics, fetchDocument: executionContext.fetchDocument },
      );
    }
    return fetchAuthorPageWithRetry(
      run.scraper,
      getAuthorConfig(run.scraper),
      run.query,
      pageIndex,
      nextPageUrl,
      pace,
      source.templateContext ?? null,
      { scrapeDetailsWithCards: false, diagnostics, fetchDocument: executionContext.fetchDocument },
    );
  };
  const preloadSourceListingPage = (
    sourceIndex: number,
    pageIndex: number,
    nextPageUrl?: string,
  ): void => {
    if (pageIndex >= executionPageLimits[sourceIndex] || signal.aborted) {
      return;
    }

    const sourceKey = input.sources[sourceIndex].id;
    const requestKey = buildScraperListingPageRequestKey(pageIndex, nextPageUrl);
    listingPagePrefetchCache.preload(
      sourceKey,
      requestKey,
      () => fetchSourceListingPage(sourceIndex, pageIndex, nextPageUrl, "listing-prefetch"),
    );
  };
  const emit = async (label?: string): Promise<void> => onSnapshot({
    runs: [...runs],
    executionFingerprint,
  }, {
    completedUnits: runs.filter((run) => run.status === "done" || run.status === "error").length,
    totalUnits: runs.length,
    resultCount: countListingResults(runs),
    excludedResultCount: runs.reduce(
      (count, run) => count + (run.excludedByBlacklistedTagCount ?? 0),
      0,
    ),
    currentLabel: label,
  });

  const canSourceProduceMoreResults = (runIndex: number): boolean => {
    const run = runs[runIndex];
    const state = executionStates[runIndex];
    if (run.status === "error" || run.status === "cancelled") return false;
    if (run.languageRejectLimitReached) return false;
    if (state.pendingResults.length > 0) return true;
    if (state.pendingCandidates.length > 0) return true;
    if (!state.sourceHasNextPage || run.loadedPages >= executionPageLimits[runIndex]) return false;
    return true;
  };

  const storeAvailableResults = (
    run: BackgroundListingRun,
    state: ListingSourceExecutionState,
    acceptedResults: MultiSearchSourceResult[],
    resultLimit: number,
  ): BackgroundListingRun => {
    let availableResults = appendUniqueResults(run.results, state.pendingResults);
    availableResults = appendUniqueResults(availableResults, acceptedResults);
    if (resultLimit <= 0) {
      state.pendingResults = [];
      return { ...run, results: availableResults };
    }

    state.pendingResults = availableResults.slice(resultLimit);
    return { ...run, results: availableResults.slice(0, resultLimit) };
  };

  const enrichRequiredCandidateMetadata = async (
    run: BackgroundListingRun,
    candidateBatch: MultiSearchSourceResult[],
    purpose: string,
    pageIndex: number,
  ): Promise<MultiSearchSourceResult[]> => {
    const requiredIndexes = candidateBatch.flatMap((candidate, index) => (
      doesScraperCardNeedMetadata(
        candidate.result,
        SCRAPER_METADATA_REQUIREMENTS_BY_PHASE.displayedDetails,
      ) ? [index] : []
    ));
    const skippedCount = candidateBatch.length - requiredIndexes.length;
    if (skippedCount > 0) {
      appendScraperLatestDiagnosticEvent(
        diagnosticSession,
        "details.skipped-present",
        { count: skippedCount, purpose },
        run.key,
      );
    }
    if (!requiredIndexes.length) return candidateBatch;
    appendScraperLatestDiagnosticEvent(
      diagnosticSession,
      "details.requested",
      { count: requiredIndexes.length, purpose },
      run.key,
    );
    const enrichedRequired = await enrichScraperListingSourcesWithCardDetails(
      run.scraper,
      requiredIndexes.map((index) => candidateBatch[index]),
      {
        scrapeDetailsWithCards: true,
        detailConcurrency: concurrency,
        diagnostics: diagnosticSession ? {
          profileId: diagnosticSession.profileId,
          purpose,
          sourceKey: run.key,
          pageIndex,
        } : undefined,
        detailsCache,
        fetchDocument: executionContext.fetchDocument,
      },
    );
    const enrichedByIndex = new Map(requiredIndexes.map((candidateIndex, resultIndex) => (
      [candidateIndex, enrichedRequired[resultIndex] ?? candidateBatch[candidateIndex]]
    )));
    return candidateBatch.map((candidate, index) => enrichedByIndex.get(index) ?? candidate);
  };

  const consumeBufferedResults = async (
    currentRun: BackgroundListingRun,
    state: ListingSourceExecutionState,
    resultLimit: number,
    onNeedsListingPage?: () => void,
  ): Promise<BackgroundListingRun> => {
    let run = storeAvailableResults(currentRun, state, [], resultLimit);
    const remainingResultSlots = resultLimit <= 0
      ? state.pendingCandidates.length
      : Math.max(0, resultLimit - run.results.length);
    if (
      input.scrapeDetailsWithCards !== true
      || remainingResultSlots === 0
      || state.pendingCandidates.length === 0
    ) {
      return run;
    }

    let excludedByEnrichedLanguageCount = 0;
    let excludedByBlacklistedTagCount = 0;
    const enrichment = await enrichCandidatesForTarget({
      candidates: state.pendingCandidates,
      targetCount: remainingResultSlots,
      enrichBatch: (candidateBatch) => enrichRequiredCandidateMetadata(
        run,
        candidateBatch,
        "card-details-buffered",
        run.loadedPages,
      ),
      isAccepted: (item) => {
        if (!doesMultiSearchSourceMatchIncludedLanguages(item, input.includedLanguageCodes)) {
          excludedByEnrichedLanguageCount += 1;
          return false;
        }
        if (filterHistory && isKnownResult(knownHistoryIds, run.scraper.id, item.result)) {
          return false;
        }
        if (kind === "latestSources") {
          const blacklistFilter = filterBackgroundListingSourcesByBlacklist([item], input);
          if (blacklistFilter.excludedCount > 0) {
            excludedByBlacklistedTagCount += blacklistFilter.excludedCount;
            return false;
          }
        }
        return true;
      },
      maxBatchSize: concurrency,
      onProgress: ({ acceptedCandidateCount, remainingCandidateCount, targetCount }) => {
        if (acceptedCandidateCount + remainingCandidateCount < targetCount) {
          onNeedsListingPage?.();
        }
      },
    });
    state.pendingCandidates = enrichment.remainingCandidates;
    run = storeAvailableResults(run, state, enrichment.acceptedCandidates, resultLimit);
    const excludedByLanguageCount = (run.excludedByLanguageCount ?? 0)
      + excludedByEnrichedLanguageCount;
    const includedByLanguageCount = Math.max(
      0,
      (run.includedByLanguageCount ?? 0) - excludedByEnrichedLanguageCount,
    );
    const normalizedLanguageRejectLimit = Math.max(
      0,
      Math.floor(Number(input.languageRejectLimit) || 0),
    );
    return {
      ...run,
      excludedByLanguageCount,
      includedByLanguageCount,
      languageRejectLimitReached: normalizedLanguageRejectLimit > 0
        && includedByLanguageCount === 0
        && excludedByLanguageCount >= normalizedLanguageRejectLimit,
      excludedByBlacklistedTagCount: (run.excludedByBlacklistedTagCount ?? 0)
        + excludedByBlacklistedTagCount,
    };
  };

  const executeSource = async (
    runIndex: number,
    resultLimitOverride?: number,
    keepOpenForSharedQuota = false,
  ): Promise<void> => {
    let run: BackgroundListingRun = { ...runs[runIndex], status: "loading" };
    const source = input.sources[runIndex];
    const state = executionStates[runIndex];
    const beforeResultCount = run.results.length;
    let lastProcessedPage: { pageIndex: number; page: ScraperRuntimeSearchPageResult } | null = null;
    const batchStartedAt = performance.now();
    let diagnosticBatchCompleted = false;
    const completeDiagnosticBatch = (): void => {
      if (diagnosticBatchCompleted) return;
      diagnosticBatchCompleted = true;
      appendScraperLatestDiagnosticEvent(diagnosticSession, "source.batch-completed", {
        durationMs: Math.round(performance.now() - batchStartedAt),
        beforeResultCount,
        resultCount: run.results.length,
        addedResultCount: Math.max(0, run.results.length - beforeResultCount),
        targetResultCount: resultLimitOverride,
        loadedPages: run.loadedPages,
        status: run.status,
        hasNextPage: run.hasNextPage,
      }, source.id);
    };
    appendScraperLatestDiagnosticEvent(diagnosticSession, "source.batch-started", {
      currentResultCount: beforeResultCount,
      targetResultCount: resultLimitOverride,
      loadedPages: run.loadedPages,
      pendingResultCount: state.pendingResults.length,
      pendingCandidateCount: state.pendingCandidates.length,
    }, source.id);
    runs[runIndex] = run;
    await emit(run.name);
    try {
      if (latestAuthorCacheAssignments.has(source.id)) {
        const cachedSource = latestAuthorCacheAssignments.get(source.id);
        const cachedResults = cachedSource
          ? await enrichSourceResultsWithJapaneseRomanization(buildSourceResultsFromItems(
            run.scraper,
            cachedSource.results.map((cachedResult) => cachedResult.result),
            (_result, index) => cachedSource.results[index]?.pageIndex ?? 0,
            (_result, index) => cachedSource.results[index]?.searchTerm || run.name,
            () => [source.favoriteSourceName || run.name],
          ).filter((item) => (
            doesMultiSearchSourceMatchIncludedLanguages(item, input.includedLanguageCodes)
          )))
          : [];
        run = {
          ...run,
          status: "done",
          results: cachedResults.filter((item) => (
            !isKnownResult(knownHistoryIds, run.scraper.id, item.result)
          )),
          cacheResults: cachedResults,
          fromCache: true,
          loadedPages: cachedSource?.loadedPages ?? 0,
          hasNextPage: false,
          currentPageUrl: cachedSource?.currentPageUrl,
          nextPageUrl: cachedSource?.nextPageUrl,
        };
        state.sourceHasNextPage = false;
        runs[runIndex] = run;
        await emit(run.name);
        completeDiagnosticBatch();
        return;
      }

      const resultLimit = resultLimitOverride ?? resolveBackgroundListingResultLimit(
        source.resultLimit,
        input.resultLimit,
        kind === "latestAuthors",
      );
      if (backfillBlacklistedResults) {
        state.acceptedResultTarget = resolveBackgroundListingAcceptedTarget(
          state.rawQuotaResultKeys.size,
          resultLimit,
        );
      }
      const preloadCurrentListingPage = () => {
        if (state.sourceHasNextPage) {
          preloadSourceListingPage(runIndex, run.loadedPages, run.nextPageUrl);
        }
      };
      run = await consumeBufferedResults(
        run,
        state,
        backfillBlacklistedResults ? state.acceptedResultTarget : resultLimit,
        preloadCurrentListingPage,
      );
      runs[runIndex] = run;

      let shouldLoadAnotherPage = !run.languageRejectLimitReached
        && (resultLimit === 0 || run.results.length < resultLimit);
      while (run.loadedPages < executionPageLimits[runIndex] && shouldLoadAnotherPage) {
        throwIfSearchAborted(signal);
        if (state.deepScanCheckpointPending) {
          state.deepScanCheckpointPending = false;
          run = {
            ...run,
            checkpointUsed: true,
            deepScanCheckpointPending: false,
          };
          runs[runIndex] = run;
          appendScraperLatestDiagnosticEvent(diagnosticSession, "checkpoint.resumed", {
            loadedPages: run.loadedPages,
            remainingPageBudget: Math.max(0, executionPageLimits[runIndex] - run.loadedPages),
          }, source.id);
        }
        const pageIndex = run.loadedPages;
        const sourceMode = source.mode ?? (kind === "latestSources" ? "homepage" : "author");
        const requestedPageUrl = run.nextPageUrl;
        const pageStartedAt = performance.now();
        const page = await listingPagePrefetchCache.load(
          source.id,
          buildScraperListingPageRequestKey(pageIndex, requestedPageUrl),
          () => fetchSourceListingPage(runIndex, pageIndex, requestedPageUrl, "listing-demand"),
        );
        const listingLoadedAt = performance.now();
        const processedPage = await processScraperListingPage({
          scraper: run.scraper,
          page,
          pageIndex,
          searchTerm: run.name,
          contextualAuthorNames: sourceMode === "author"
            ? source.contextualAuthorNames ?? [run.name]
            : [],
          includedLanguageCodes: input.includedLanguageCodes,
          resultTag: source.resultTag,
        });
        const pageSources = processedPage.sources;
        const newPageSources = pageSources.filter((item) => {
          const key = normalizeResultUrl(item);
          if (state.seenCandidateResultKeys.has(key)) return false;
          state.seenCandidateResultKeys.add(key);
          return true;
        });
        const includedPageSourceKeys = new Set(processedPage.includedSources.map(normalizeResultUrl));
        const includedPageSources = newPageSources.filter((item) => (
          includedPageSourceKeys.has(normalizeResultUrl(item))
        ));
        const quickSeenProgress = resolveBackgroundQuickSeenProgress(
          includedPageSources.map((item) => isKnownResult(knownHistoryIds, run.scraper.id, item.result)),
          state.consecutiveSeenResultCount,
          input.quickConsecutiveSeenStopThreshold,
        );
        state.consecutiveSeenResultCount = quickSeenProgress.consecutiveSeenCount;
        const rawUnseenSources = includedPageSources
          .filter((item) => !filterHistory || !isKnownResult(knownHistoryIds, run.scraper.id, item.result));
        const sourceHasNextPage = sourceMode === "homepage"
          ? resolveHasNextHomepagePage(getHomepageConfig(run.scraper), page)
          : sourceMode === "search"
            ? resolveHasNextPage(getSearchConfig(run.scraper), page)
            : sourceMode === "tag"
              ? resolveHasNextTagPage(getTagConfig(run.scraper), page)
              : resolveHasNextAuthorPage(getAuthorConfig(run.scraper), page);
        const paginationStalled = isBackgroundListingPaginationStalled(requestedPageUrl, page.nextPageUrl);
        const duplicatePage = pageSources.length > 0 && newPageSources.length === 0;
        const quickHistoryBoundaryReached = usesBackgroundQuickSeenBoundary(kind)
          && (input.searchMode === "quick" || input.searchMode === "continuous")
          && quickSeenProgress.boundaryReached
          && !(pageIndex === 0 && rawUnseenSources.length > 0);
        const deepRecentHistoryBoundaryReached = usesBackgroundQuickSeenBoundary(kind)
          && input.searchMode === "deep"
          && !state.deepScanPhaseStarted
          && (
            rawUnseenSources.length === 0
            || (
              quickSeenProgress.boundaryReached
              && !(pageIndex === 0 && rawUnseenSources.length > 0)
            )
          );
        const canPreloadFollowingPage = sourceHasNextPage
          && !paginationStalled
          && !duplicatePage
          && !quickHistoryBoundaryReached
          && !deepRecentHistoryBoundaryReached
          && pageIndex + 1 < executionPageLimits[runIndex];
        const preloadFollowingPage = () => {
          if (canPreloadFollowingPage) {
            preloadSourceListingPage(runIndex, pageIndex + 1, page.nextPageUrl);
          }
        };
        if (backfillBlacklistedResults && pageIndex < executionPageLimits[runIndex]) {
          rawUnseenSources.forEach((item) => state.rawQuotaResultKeys.add(normalizeResultUrl(item)));
          state.acceptedResultTarget = resolveBackgroundListingAcceptedTarget(
            state.rawQuotaResultKeys.size,
            resultLimit,
          );
        }
        const storedResultLimit = backfillBlacklistedResults
          ? state.acceptedResultTarget
          : resultLimit;
        const remainingResultSlots = storedResultLimit <= 0
          ? rawUnseenSources.length
          : Math.max(0, storedResultLimit - run.results.length);
        let enrichedLanguageExcludedCount = 0;
        let excludedByBlacklistedTagCount = 0;
        let newEligibleSources: MultiSearchSourceResult[];
        if (input.scrapeDetailsWithCards === true && rawUnseenSources.length > 0) {
          const enrichment = await enrichCandidatesForTarget({
            candidates: rawUnseenSources,
            targetCount: remainingResultSlots,
            enrichBatch: (candidateBatch) => enrichRequiredCandidateMetadata(
              run,
              candidateBatch,
              "card-details",
              pageIndex,
            ),
            isAccepted: (item) => {
              if (!doesMultiSearchSourceMatchIncludedLanguages(item, input.includedLanguageCodes)) {
                enrichedLanguageExcludedCount += 1;
                return false;
              }
              if (filterHistory && isKnownResult(knownHistoryIds, run.scraper.id, item.result)) {
                return false;
              }
              if (kind === "latestSources") {
                const blacklistFilter = filterBackgroundListingSourcesByBlacklist([item], input);
                if (blacklistFilter.excludedCount > 0) {
                  excludedByBlacklistedTagCount += blacklistFilter.excludedCount;
                  return false;
                }
              }
              return true;
            },
            maxBatchSize: concurrency,
            onProgress: ({ acceptedCandidateCount, remainingCandidateCount, targetCount }) => {
              if (acceptedCandidateCount + remainingCandidateCount < targetCount) {
                preloadFollowingPage();
              }
            },
          });
          newEligibleSources = enrichment.acceptedCandidates;
          state.pendingCandidates.push(...enrichment.remainingCandidates);
        } else {
          const blacklistFilter = kind === "latestSources"
            ? filterBackgroundListingSourcesByBlacklist(rawUnseenSources, input)
            : { accepted: rawUnseenSources, excludedCount: 0 };
          newEligibleSources = blacklistFilter.accepted;
          excludedByBlacklistedTagCount = blacklistFilter.excludedCount;
        }
        if (newEligibleSources.length < remainingResultSlots) {
          preloadFollowingPage();
        }
        const languageProgress = resolveBackgroundLanguageProgress(
          run.excludedByLanguageCount ?? 0,
          run.includedByLanguageCount ?? 0,
          newPageSources.length,
          includedPageSources.length,
          enrichedLanguageExcludedCount,
          input.languageRejectLimit,
        );
        run = storeAvailableResults(
          run,
          state,
          newEligibleSources,
          storedResultLimit,
        );
        const nextCacheResults = kind === "latestAuthors"
          ? appendUniqueResults(run.cacheResults ?? [], includedPageSources)
          : undefined;
        const isBackfillPage = isBackgroundListingBackfillPage({
          pageIndex,
          executionStartPageIndex: executionStartPageIndexes[runIndex],
          configuredMaxPages,
        });
        state.consecutiveStagnantBackfillPages = backfillBlacklistedResults
          && isBackfillPage
          && newEligibleSources.length === 0
          ? state.consecutiveStagnantBackfillPages + 1
          : 0;
        const backfillStalled = backfillBlacklistedResults
          && isBackfillPage
          && state.consecutiveStagnantBackfillPages >= BACKGROUND_LISTING_MAX_STAGNANT_BACKFILL_PAGES;
        const deepRecentBoundaryReached = usesBackgroundQuickSeenBoundary(kind)
          && input.searchMode === "deep"
          && !state.deepScanPhaseStarted
          && (
            deepRecentHistoryBoundaryReached
            || (
              newEligibleSources.length === 0
              && state.pendingResults.length === 0
              && state.pendingCandidates.length === 0
            )
          );
        state.sourceHasNextPage = sourceHasNextPage
          && !paginationStalled
          && !duplicatePage
          && !quickHistoryBoundaryReached
          && !languageProgress.boundaryReached
          && !backfillStalled;
        state.sourceExhausted = state.sourceExhausted
          || !sourceHasNextPage
          || paginationStalled
          || duplicatePage;
        run = {
          ...run,
          cacheResults: nextCacheResults,
          loadedPages: pageIndex + 1,
          checkedPages: (run.checkedPages ?? 0) + 1,
          hasNextPage: shouldLoadAnotherPage,
          currentPageUrl: page.currentPageUrl,
          nextPageUrl: page.nextPageUrl,
          excludedByLanguageCount: languageProgress.excludedCount,
          includedByLanguageCount: languageProgress.includedCount,
          languageRejectLimitReached: languageProgress.boundaryReached,
          excludedByBlacklistedTagCount: (run.excludedByBlacklistedTagCount ?? 0)
            + excludedByBlacklistedTagCount,
          pendingResults: state.pendingResults,
          pendingCandidates: state.pendingCandidates,
          quickConsecutiveSeenResultCount: state.consecutiveSeenResultCount,
          deepScanPhaseStarted: state.deepScanPhaseStarted,
          deepScanCheckpointPending: state.deepScanCheckpointPending,
          sourceExhausted: state.sourceExhausted,
        };
        lastProcessedPage = { pageIndex, page };
        if (deepRecentBoundaryReached) {
          state.deepScanPhaseStarted = true;
          state.consecutiveSeenResultCount = 0;
          const checkpointUnavailableReason = resolveScraperLatestCheckpointQuotaUnavailableReason(
            run.checkpoint,
          );
          const checkpointCursor = checkpointUnavailableReason === null
            ? resolveScraperLatestCheckpointCursor(run.checkpoint)
            : null;
          const canResumeCheckpoint = checkpointCursor !== null
            && checkpointCursor.loadedPages > run.loadedPages;

          run = {
            ...run,
            deepScanPhaseStarted: true,
            quickConsecutiveSeenResultCount: 0,
          };
          if (languageProgress.boundaryReached) {
            state.sourceHasNextPage = false;
            run = { ...run, hasNextPage: false };
          } else if (checkpointUnavailableReason !== null) {
            state.sourceHasNextPage = false;
            run = {
              ...run,
              hasNextPage: false,
              safetyLimitReached: checkpointUnavailableReason === "pageLimitWithoutResults",
              languageRejectLimitReached: checkpointUnavailableReason === "languageRejectLimit",
            };
          } else if (canResumeCheckpoint) {
            const remainingPageBudget = Math.max(
              0,
              configuredMaxPages - (run.checkedPages ?? 0),
            );
            executionPageLimits[runIndex] = checkpointCursor.loadedPages + remainingPageBudget;
            executionStartPageIndexes[runIndex] = checkpointCursor.loadedPages;
            state.sourceHasNextPage = true;
            state.sourceExhausted = false;
            state.deepScanCheckpointPending = true;
            listingPagePrefetchCache.clear(source.id);
            run = {
              ...run,
              loadedPages: checkpointCursor.loadedPages,
              currentPageUrl: checkpointCursor.currentPageUrl,
              nextPageUrl: checkpointCursor.nextPageUrl,
              hasNextPage: true,
              deepScanCheckpointPending: true,
              sourceExhausted: false,
            };
          }
        }
        shouldLoadAnotherPage = backfillBlacklistedResults
          ? shouldContinueBackgroundBlacklistBackfill({
            sourceHasNextPage: state.sourceHasNextPage,
            nextPageIndex: run.loadedPages,
            configuredMaxPages: executionPageLimits[runIndex],
            resultLimit,
            acceptedResultTarget: state.acceptedResultTarget,
            storedResultCount: run.results.length,
          })
          : state.sourceHasNextPage && (resultLimit === 0 || run.results.length < resultLimit);
        runs[runIndex] = run;
        if (keepOpenForSharedQuota) {
          run = { ...run, hasNextPage: canSourceProduceMoreResults(runIndex) };
          runs[runIndex] = run;
        }
        appendScraperLatestDiagnosticEvent(diagnosticSession, "page.processing-completed", {
          pageIndex,
          totalMs: Math.round(performance.now() - pageStartedAt),
          listingLoadMs: Math.round(listingLoadedAt - pageStartedAt),
          postListingMs: Math.round(performance.now() - listingLoadedAt),
          pageResultCount: pageSources.length,
          uniqueResultCount: newPageSources.length,
          unseenResultCount: rawUnseenSources.length,
          acceptedResultCount: newEligibleSources.length,
          excludedByLanguageCount: newPageSources.length - includedPageSources.length
            + enrichedLanguageExcludedCount,
          excludedByBlacklistedTagCount,
        }, source.id);
        await emit(run.name);
      }
      const targetReached = resultLimit > 0 && run.results.length >= resultLimit;
      const pageLimitReachedBeforeTarget = (
        !targetReached
        && run.loadedPages >= executionPageLimits[runIndex]
        && state.sourceHasNextPage
      );
      if (pageLimitReachedBeforeTarget) {
        if (kind === "latestSources") {
          run = { ...run, safetyLimitReached: true };
        } else if (input.maxPages === null) {
          throw new Error("Limite de sécurité atteinte pendant le chargement complet.");
        }
      }
      if (kind === "latestSources" && input.searchMode === "deep" && lastProcessedPage) {
        const checkpointModule = source.mode === "tag"
          ? "tag"
          : source.mode === "search"
            ? "search"
            : "homepage";
        try {
          const savedCheckpoint = await saveScraperLatestCheckpoint(
            buildScraperLatestCursorCheckpointRequest({
              scraper: run.scraper,
              module: checkpointModule,
              query: run.query,
              includedLanguageCodes: input.includedLanguageCodes,
              pageIndex: lastProcessedPage.pageIndex,
              page: lastProcessedPage.page,
              quotaUnavailableReason: run.results.length === 0
                ? run.languageRejectLimitReached
                  ? "languageRejectLimit"
                  : run.safetyLimitReached
                    ? "pageLimitWithoutResults"
                    : null
                : null,
            }),
          );
          run = { ...run, checkpoint: savedCheckpoint ?? run.checkpoint };
        } catch (checkpointError) {
          console.warn("Failed to save scraper latest cursor checkpoint", checkpointError);
        }
      }
      const canContinue = canSourceProduceMoreResults(runIndex);
      run = {
        ...run,
        status: keepOpenForSharedQuota && canContinue ? "waiting" : "done",
        hasNextPage: kind === "latestSources"
          ? state.sourceHasNextPage && !run.languageRejectLimitReached
          : keepOpenForSharedQuota
            ? canContinue
            : run.hasNextPage,
        pendingResults: state.pendingResults,
        pendingCandidates: state.pendingCandidates,
        quickConsecutiveSeenResultCount: state.consecutiveSeenResultCount,
        sourceExhausted: state.sourceExhausted,
      };
    } catch (error) {
      if (signal.aborted) {
        run = { ...run, status: "cancelled" };
      } else if (
        isScraperListingPaginationEndError(error)
        && (
          kind === "latestSources"
          || run.results.length > 0
          || (run.cacheResults?.length ?? 0) > 0
        )
      ) {
        state.sourceHasNextPage = false;
        state.sourceExhausted = true;
        run = { ...run, status: "done", hasNextPage: false, sourceExhausted: true };
      } else {
        state.sourceHasNextPage = false;
        run = {
          ...run,
          status: "error",
          hasNextPage: false,
          error: error instanceof Error ? error.message : "Echec du chargement.",
        };
      }
    }
    runs[runIndex] = run;
    await emit(run.name);
    completeDiagnosticBatch();
  };

  await emit();
  const totalMode = kind === "latestSources"
    && input.resultLimitMode === "total"
    && input.searchMode !== "continuous";
  if (!totalMode) {
    await runWithConcurrency(runs.map((_run, runIndex) => () => {
      const baseResultLimit = resolveBackgroundListingResultLimit(
        input.sources[runIndex].resultLimit,
        input.resultLimit,
        kind === "latestAuthors",
      );
      const targetResultLimit = executionOptions.appendToExistingResults && baseResultLimit > 0
        ? runs[runIndex].results.length + baseResultLimit
        : undefined;
      return executeSource(runIndex, targetResultLimit);
    }), concurrency);
  } else {
    const runWithSharedConcurrency = createBackgroundConcurrencyRunner(concurrency);
    const sourceIndexesByGroup = new Map<string, number[]>();
    input.sources.forEach((source, sourceIndex) => {
      const groupKey = resolveBackgroundListingTotalGroupKey(source);
      const sourceIndexes = sourceIndexesByGroup.get(groupKey) ?? [];
      sourceIndexes.push(sourceIndex);
      sourceIndexesByGroup.set(groupKey, sourceIndexes);
    });
    await Promise.all(Array.from(sourceIndexesByGroup.entries()).map(async ([groupKey, sourceIndexes]) => {
      const groupResultLimit = Math.max(0, Math.floor(Number(
        groupKey === "scraper" ? input.resultLimit : input.tagResultLimit,
      ) || 0));
      appendScraperLatestDiagnosticEvent(diagnosticSession, "quota.group-started", {
        groupKey,
        sourceCount: sourceIndexes.length,
        initialResultCount: sourceIndexes.reduce((count, sourceIndex) => (
          count + runs[sourceIndex].results.length
        ), 0),
        targetResultCount: executionOptions.appendToExistingResults
          ? groupResultLimit + sourceIndexes.reduce((count, sourceIndex) => (
            count + runs[sourceIndex].results.length
          ), 0)
          : groupResultLimit,
      });
      if (groupResultLimit === 0) {
        await Promise.all(sourceIndexes.map((sourceIndex) => (
          runWithSharedConcurrency(() => executeSource(sourceIndex))
        )));
      } else {
        await runBackgroundListingTotalGroup({
          sourceIndexes,
          resultLimit: groupResultLimit,
          getResultCount: (sourceIndex) => runs[sourceIndex].results.length,
          canContinue: canSourceProduceMoreResults,
          isUnavailable: (sourceIndex) => isBackgroundListingSourceUnavailableForQuota({
            resultCount: runs[sourceIndex].results.length,
            sourceExhausted: executionStates[sourceIndex].sourceExhausted,
            languageRejectLimitReached: runs[sourceIndex].languageRejectLimitReached,
            safetyLimitReached: runs[sourceIndex].safetyLimitReached,
          }),
          appendToExistingResults: executionOptions.appendToExistingResults,
          onRoundStart: (batches, roundNumber) => {
            appendScraperLatestDiagnosticEvent(diagnosticSession, "quota.round-started", {
              groupKey,
              roundNumber,
              resultCount: sourceIndexes.reduce((count, sourceIndex) => (
                count + runs[sourceIndex].results.length
              ), 0),
              targetResultCount: groupResultLimit,
              batches: batches.map((batch) => ({
                sourceKey: input.sources[batch.sourceIndex].id,
                requestedResultCount: batch.requestedResultCount,
                targetResultCount: batch.targetResultCount,
              })),
            });
          },
          onRoundComplete: (_batches, roundNumber, durationMs) => {
            appendScraperLatestDiagnosticEvent(diagnosticSession, "quota.round-completed", {
              groupKey,
              roundNumber,
              durationMs: Math.round(durationMs),
            });
          },
          beforeExecute: (batches) => {
            batches.forEach(({ sourceIndex, requestedResultCount }) => {
              const run = runs[sourceIndex];
              const state = executionStates[sourceIndex];
              const bufferedResultCount = state.pendingResults.length + state.pendingCandidates.length;
              if (
                state.sourceHasNextPage
                && run.loadedPages < executionPageLimits[sourceIndex]
                && requestedResultCount > bufferedResultCount
              ) {
                preloadSourceListingPage(sourceIndex, run.loadedPages, run.nextPageUrl);
              }
            });
          },
          execute: (sourceIndex, targetResultCount) => {
            const queuedAt = performance.now();
            return runWithSharedConcurrency(async () => {
              appendScraperLatestDiagnosticEvent(diagnosticSession, "scheduler.slot-acquired", {
                groupKey,
                waitMs: Math.round(performance.now() - queuedAt),
                targetResultCount,
              }, input.sources[sourceIndex].id);
              await executeSource(sourceIndex, targetResultCount, true);
            });
          },
        });
      }

      const groupResultCount = sourceIndexes.reduce((count, sourceIndex) => (
        count + runs[sourceIndex].results.length
      ), 0);
      appendScraperLatestDiagnosticEvent(diagnosticSession, "quota.group-completed", {
        groupKey,
        resultCount: groupResultCount,
        targetResultCount: groupResultLimit,
        quotaReached: groupResultLimit > 0 && groupResultCount >= groupResultLimit,
      });

      sourceIndexes.forEach((sourceIndex) => {
        const run = runs[sourceIndex];
        if (run.status !== "error" && run.status !== "cancelled") {
          runs[sourceIndex] = {
            ...run,
            status: "done",
            hasNextPage: executionStates[sourceIndex].sourceHasNextPage
              && !run.languageRejectLimitReached,
          };
        }
      });
      await emit();
    }));
  }

  throwIfSearchAborted(signal);
  return { runs, executionFingerprint };
};

export type ScraperLatestSearchExecutionOptions = ListingSearchExecutionOptions & {
  mode: "foreground" | "background";
  backgroundJobId?: string;
};

type ScraperLatestSnapshotCallback = ListingSearchSnapshotCallback;

export const runScraperLatestSearch = async (
  input: ListingBackgroundInput,
  signal: AbortSignal,
  onSnapshot: ScraperLatestSnapshotCallback,
  options: ScraperLatestSearchExecutionOptions,
): Promise<ListingBackgroundResult> => {
  const pace = getPaceConfig(input.paceMode);
  const concurrency = resolveBackgroundListingConcurrency(input.concurrency, pace.concurrency);
  const diagnosticSession = shouldGenerateScraperLatestPerformanceReport(input.performanceReportsEnabled)
    ? await startScraperLatestDiagnosticSession({
      mode: options.mode,
      searchKind: "latestSources",
      searchMode: input.searchMode ?? "quick",
      resultLimitMode: input.resultLimitMode ?? "total",
      resultLimit: Math.max(0, Math.floor(Number(input.resultLimit) || 0)),
      tagResultLimit: Math.max(0, Math.floor(Number(input.tagResultLimit) || 0)),
      concurrency,
      sourceCount: input.sources.length,
      backgroundJobId: options.backgroundJobId,
    })
    : null;
  let status: "completed" | "cancelled" | "error" = "completed";
  let diagnosticError: string | undefined;
  let finalResultCount = 0;
  try {
    const result = await runListingSearchEngine(
      "latestSources",
      input,
      signal,
      (result, progress) => onSnapshot(result as ListingBackgroundResult, progress),
      diagnosticSession,
      options,
    );
    finalResultCount = countListingResults(result.runs);
    return result;
  } catch (error) {
    status = signal.aborted ? "cancelled" : "error";
    diagnosticError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await finishScraperLatestDiagnosticSession(diagnosticSession, status, {
      error: diagnosticError,
      finalResultCount,
    });
  }
};

const runListingEngineWithOptionalDiagnostics = async (
  kind: Exclude<ListingSearchEngineKind, "latestSources">,
  input: ListingBackgroundInput,
  signal: AbortSignal,
  onSnapshot: ScraperLatestSnapshotCallback,
  options: ListingSearchExecutionOptions,
): Promise<ListingBackgroundResult> => {
  const inheritedProfileId = options.executionContext?.diagnostics?.profileId;
  const settings = inheritedProfileId ? null : await window.api?.getSettings?.().catch(() => null);
  const enabled = settings?.scraperPerformanceReportsEnabled === true
    || settings?.scraperLatestPerformanceReportsEnabled === true;
  const ownedSession = !inheritedProfileId && enabled
    ? await startScraperLatestDiagnosticSession({
      mode: "foreground",
      searchKind: kind,
      concurrency: resolveBackgroundListingConcurrency(input.concurrency, getPaceConfig(input.paceMode).concurrency),
      sourceCount: input.sources.length,
    })
    : null;
  const session = ownedSession ?? (inheritedProfileId ? {
    profileId: inheritedProfileId,
    filePath: "",
    startedAt: "",
  } : null);
  const executionContext = options.executionContext ?? createSearchExecutionContext({
    kind,
    mode: "foreground",
    diagnostics: session ? { profileId: session.profileId, purpose: `engine.${kind}` } : undefined,
  });
  let status: "completed" | "cancelled" | "error" = "completed";
  try {
    return await runListingSearchEngine(
      kind,
      input,
      signal,
      onSnapshot,
      session,
      { ...options, executionContext },
    );
  } catch (error) {
    status = signal.aborted ? "cancelled" : "error";
    throw error;
  } finally {
    await finishScraperLatestDiagnosticSession(ownedSession, status, { searchKind: kind });
  }
};

export const runScraperAuthorSearchEngine = (
  input: ListingBackgroundInput,
  signal: AbortSignal,
  onSnapshot: ScraperLatestSnapshotCallback,
  options: ListingSearchExecutionOptions = {},
): Promise<ListingBackgroundResult> => runListingEngineWithOptionalDiagnostics(
  "scraperAuthor", input, signal, onSnapshot, options,
);

export const runLatestAuthorsSearchEngine = (
  input: ListingBackgroundInput,
  signal: AbortSignal,
  onSnapshot: ScraperLatestSnapshotCallback,
  options: ListingSearchExecutionOptions = {},
): Promise<ListingBackgroundResult> => runListingEngineWithOptionalDiagnostics(
  "latestAuthors", input, signal, onSnapshot, options,
);

export const runAuthorFavoriteRefreshSearchEngine = (
  input: ListingBackgroundInput,
  signal: AbortSignal,
  onSnapshot: ScraperLatestSnapshotCallback,
  options: ListingSearchExecutionOptions = {},
): Promise<ListingBackgroundResult> => runListingEngineWithOptionalDiagnostics(
  "authorFavoriteRefresh", input, signal, onSnapshot, options,
);
