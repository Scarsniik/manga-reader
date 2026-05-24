import { useCallback, useMemo, useRef, useState } from "react";
import {
  buildScraperLatestCheckpointId,
  buildScraperViewHistoryCardId,
  normalizeScraperLatestCheckpointQuery,
  type SaveScraperLatestCheckpointRequest,
  type ScraperLatestCheckpointRecord,
  type ScraperRecord,
  type ScraperViewHistoryRecord,
} from "@/shared/scraper";
import {
  buildSourceResults,
  fetchHomepagePageWithRetry,
  fetchSearchPageWithRetry,
  getHomepageConfig,
  getPaceConfig,
  getSearchConfig,
  resolveHasNextHomepagePage,
  resolveHasNextPage,
  runWithConcurrency,
  type PaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchConstants";
import { enrichSourceResultsWithJapaneseRomanization } from "@/renderer/components/MultiSearch/multiSearchSourceRomanization";
import type {
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { buildSearchResultViewHistoryIdentity } from "@/renderer/utils/scraperViewHistory";
import {
  hasSearchPagePlaceholder,
  isScraperListingPaginationEndError,
} from "@/renderer/utils/scraperRuntime";
import {
  buildScraperLatestCheckpointRequest,
  getScraperLatestCheckpointForKey,
  getScraperLatestCheckpoints,
  saveScraperLatestCheckpoint,
} from "@/renderer/utils/scraperLatestCheckpoints";

export type ScraperLatestRunStatus = "waiting" | "loading" | "done" | "error";
export type ScraperLatestRunModule = "homepage" | "search";
export type ScraperLatestSearchMode = "quick" | "deep";

export type ScraperLatestRun = {
  key: string;
  scraper: ScraperRecord;
  module: ScraperLatestRunModule;
  status: ScraperLatestRunStatus;
  results: MultiSearchSourceResult[];
  excludedByLanguageCount: number;
  loadedPages: number;
  checkedPages: number;
  hasNextPage: boolean;
  checkpoint?: ScraperLatestCheckpointRecord | null;
  checkpointUsed: boolean;
  deepSearch: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  error?: string;
};

type StartOptions = {
  searchMode?: ScraperLatestSearchMode;
  continueFromQuickScan?: boolean;
};

type ProcessedLatestPage = {
  run: ScraperLatestRun;
  pageResults: MultiSearchSourceResult[];
  newPageResults: MultiSearchSourceResult[];
  includedPageResults: MultiSearchSourceResult[];
  unseenResults: MultiSearchSourceResult[];
  hasOnlyDuplicateResults: boolean;
  firstIncludedPageResultIsSeen: boolean;
};

type ScraperLatestContinuationKey = {
  scraperId: string;
  scraperUpdatedAt: string;
  module: ScraperLatestRunModule;
  query: string;
  includedLanguageCodes: string[];
};

type ScraperLatestQuickContinuation = {
  id: string;
  run: ScraperLatestRun;
  pageIndex: number | null;
  pageUrl?: string;
};

const getEnabledLatestScrapers = (scrapers: ScraperRecord[]): ScraperRecord[] => (
  scrapers.filter((scraper) => scraper.globalConfig.latest?.enabled)
);

const buildRun = (
  scraper: ScraperRecord,
  checkpoint: ScraperLatestCheckpointRecord | null,
  searchMode: ScraperLatestSearchMode,
): ScraperLatestRun => ({
  key: scraper.id,
  scraper,
  module: scraper.globalConfig.latest?.module === "search" ? "search" : "homepage",
  status: "waiting",
  results: [],
  excludedByLanguageCount: 0,
  loadedPages: 0,
  checkedPages: 0,
  hasNextPage: true,
  checkpoint,
  checkpointUsed: false,
  deepSearch: searchMode === "deep",
});

const getSourceHistoryId = (source: MultiSearchSourceResult): string => (
  buildScraperViewHistoryCardId(
    buildSearchResultViewHistoryIdentity(source.scraper.id, source.result),
  )
);

const getSourceDeduplicationKey = (source: MultiSearchSourceResult): string => {
  const historyId = getSourceHistoryId(source);
  if (historyId) {
    return historyId;
  }

  const sourceUrl = source.result.detailUrl || source.result.authorUrl || "";
  const sourceIdentity = sourceUrl || source.result.title;
  return `${source.scraper.id}::${sourceIdentity.trim().toLowerCase()}`;
};

const isUnseenSource = (
  source: MultiSearchSourceResult,
  recordsById: Map<string, ScraperViewHistoryRecord>,
): boolean => {
  const historyId = getSourceHistoryId(source);
  return Boolean(historyId && !recordsById.has(historyId));
};

const isSeenSource = (
  source: MultiSearchSourceResult | undefined,
  recordsById: Map<string, ScraperViewHistoryRecord>,
): boolean => {
  if (!source) {
    return false;
  }

  const historyId = getSourceHistoryId(source);
  return Boolean(historyId && recordsById.has(historyId));
};

const normalizeResultLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
};

const normalizeLanguageCodes = (value: readonly string[] | undefined): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value.reduce<string[]>((result, entry) => {
    const normalized = String(entry ?? "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return result;
    }

    seen.add(normalized);
    result.push(normalized);
    return result;
  }, []);
};

const buildLocalCheckpointRecord = (
  request: SaveScraperLatestCheckpointRequest,
): ScraperLatestCheckpointRecord | null => {
  const id = buildScraperLatestCheckpointId(request);
  const anchorCardId = request.anchorCardId?.trim() ?? "";

  if (!id || !anchorCardId) {
    return null;
  }

  return {
    id,
    scraperId: request.scraperId,
    module: request.module,
    query: normalizeScraperLatestCheckpointQuery(request.query),
    includedLanguageCodes: normalizeLanguageCodes(request.includedLanguageCodes ?? []),
    scraperUpdatedAt: request.scraperUpdatedAt,
    pageIndex: Math.max(0, Math.floor(request.pageIndex)),
    currentPageUrl: request.currentPageUrl ?? undefined,
    nextPageUrl: request.nextPageUrl ?? undefined,
    anchorCardId,
    anchorIdentity: request.anchorIdentity,
    updatedAt: new Date().toISOString(),
  };
};

const shouldReplaceCheckpoint = (
  currentCheckpoint: ScraperLatestCheckpointRecord | null | undefined,
  nextCheckpoint: ScraperLatestCheckpointRecord,
): boolean => (
  !currentCheckpoint
  || currentCheckpoint.scraperUpdatedAt !== nextCheckpoint.scraperUpdatedAt
  || nextCheckpoint.pageIndex >= currentCheckpoint.pageIndex
);

const sourceMatchesIncludedLanguages = (
  source: MultiSearchSourceResult,
  includedLanguageCodes: string[],
): boolean => {
  if (!includedLanguageCodes.length) {
    return true;
  }

  const sourceLanguageCodes = source.sourceLanguageCodes.length
    ? source.sourceLanguageCodes
    : [UNKNOWN_MULTI_SEARCH_VALUE];

  return sourceLanguageCodes
    .map((languageCode) => languageCode.trim().toLowerCase())
    .some((languageCode) => includedLanguageCodes.includes(languageCode));
};

const QUICK_CHECKPOINT_PAGE_BUDGET = 6;
const CHECKPOINT_ANCHOR_OFFSETS = [0, 1, 2, 4, -1, -2];

const getRunQuery = (run: Pick<ScraperLatestRun, "module" | "scraper">): string => (
  run.module === "search"
    ? normalizeScraperLatestCheckpointQuery(run.scraper.globalConfig.homeSearch?.query ?? "")
    : ""
);

const getRunUsesTemplatePaging = (run: ScraperLatestRun): boolean => (
  run.module === "search"
    ? hasSearchPagePlaceholder(getSearchConfig(run.scraper))
    : hasSearchPagePlaceholder(getHomepageConfig(run.scraper))
);

const getCheckpointCandidatePageIndexes = (
  checkpoint: ScraperLatestCheckpointRecord,
): number[] => {
  const seen = new Set<number>();

  return CHECKPOINT_ANCHOR_OFFSETS
    .map((offset) => checkpoint.pageIndex + offset)
    .filter((pageIndex) => {
      if (pageIndex < 0 || seen.has(pageIndex)) {
        return false;
      }

      seen.add(pageIndex);
      return true;
    });
};

const buildQuickContinuationId = (key: ScraperLatestContinuationKey): string => (
  JSON.stringify({
    scraperId: key.scraperId,
    scraperUpdatedAt: key.scraperUpdatedAt,
    module: key.module,
    query: normalizeScraperLatestCheckpointQuery(key.query),
    includedLanguageCodes: [...normalizeLanguageCodes(key.includedLanguageCodes)].sort(),
  })
);

const buildContinuationKeyForRun = (
  run: Pick<ScraperLatestRun, "module" | "scraper">,
  includedLanguageCodes: string[],
): ScraperLatestContinuationKey => ({
  scraperId: run.scraper.id,
  scraperUpdatedAt: run.scraper.updatedAt,
  module: run.module,
  query: getRunQuery(run),
  includedLanguageCodes,
});

const buildQuickContinuation = (
  run: ScraperLatestRun,
  includedLanguageCodes: string[],
  pageIndex: number | null,
  pageUrl?: string,
): ScraperLatestQuickContinuation => ({
  id: buildQuickContinuationId(buildContinuationKeyForRun(run, includedLanguageCodes)),
  run,
  pageIndex,
  pageUrl,
});

const getQuickContinuationForKey = (
  continuations: ScraperLatestQuickContinuation[],
  key: ScraperLatestContinuationKey,
): ScraperLatestQuickContinuation | null => {
  const id = buildQuickContinuationId(key);
  return continuations.find((continuation) => continuation.id === id) ?? null;
};

const buildQuickContinuationRun = (
  scraper: ScraperRecord,
  continuation: ScraperLatestQuickContinuation,
  searchMode: ScraperLatestSearchMode,
): ScraperLatestRun => {
  const continuationPageIndex = continuation.pageIndex;
  const canContinue = continuationPageIndex !== null;
  return {
    ...continuation.run,
    key: scraper.id,
    scraper,
    status: canContinue ? "waiting" : "done",
    error: undefined,
    deepSearch: searchMode === "deep",
    checkpointUsed: false,
    hasNextPage: canContinue,
    loadedPages: canContinue ? continuationPageIndex : continuation.run.loadedPages,
    currentPageUrl: canContinue ? continuation.pageUrl : continuation.run.currentPageUrl,
    nextPageUrl: canContinue ? continuation.pageUrl : continuation.run.nextPageUrl,
  };
};

const pageContainsCheckpointAnchor = (
  pageResults: MultiSearchSourceResult[],
  checkpoint: ScraperLatestCheckpointRecord,
): boolean => (
  pageResults.some((source) => getSourceHistoryId(source) === checkpoint.anchorCardId)
);

const fetchLatestPage = async (
  run: ScraperLatestRun,
  pageIndex: number,
  paceConfig: PaceConfig,
  nextPageUrlOverride?: string,
) => {
  const nextPageUrl = nextPageUrlOverride ?? run.nextPageUrl;

  if (run.module === "search") {
    const searchConfig = getSearchConfig(run.scraper);
    const query = run.scraper.globalConfig.homeSearch?.query ?? "";
    const page = await fetchSearchPageWithRetry(
      run.scraper,
      searchConfig,
      query,
      pageIndex,
      nextPageUrl,
      paceConfig,
    );

    return {
      page,
      hasNextPage: resolveHasNextPage(searchConfig, page),
      searchTerm: query,
    };
  }

  const homepageConfig = getHomepageConfig(run.scraper);
  const page = await fetchHomepagePageWithRetry(
    run.scraper,
    homepageConfig,
    pageIndex,
    nextPageUrl,
    paceConfig,
  );

  return {
    page,
    hasNextPage: resolveHasNextHomepagePage(homepageConfig, page),
    searchTerm: "Homepage",
  };
};

export default function useScraperLatestRuns() {
  const [runs, setRuns] = useState<ScraperLatestRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  const paceConfigRef = useRef<PaceConfig>(getPaceConfig("careful"));
  const quickContinuationsRef = useRef<ScraperLatestQuickContinuation[]>([]);
  const enabledRunCount = useMemo(
    () => runs.filter((run) => run.status !== "error").length,
    [runs],
  );

  const patchRun = useCallback((
    token: number,
    key: string,
    updater: (run: ScraperLatestRun) => ScraperLatestRun,
  ) => {
    if (token !== tokenRef.current) {
      return;
    }

    setRuns((currentRuns) => currentRuns.map((run) => (
      run.key === key ? updater(run) : run
    )));
  }, []);

  const saveQuickContinuation = useCallback((continuation: ScraperLatestQuickContinuation) => {
    quickContinuationsRef.current = [
      ...quickContinuationsRef.current.filter((currentContinuation) => currentContinuation.id !== continuation.id),
      continuation,
    ];
  }, []);

  const applyLatestPage = useCallback(async (
    currentRun: ScraperLatestRun,
    pageIndex: number,
    resultLimit: number,
    recordsById: Map<string, ScraperViewHistoryRecord>,
    includedLanguageCodes: string[],
    loadedSourceKeys: Set<string>,
    token: number,
    stopAtSeenFirstResult: boolean,
    nextPageUrlOverride?: string,
  ): Promise<ProcessedLatestPage> => {
    patchRun(token, currentRun.key, (run) => ({
      ...run,
      status: "loading",
      error: undefined,
    }));

    const latestPage = await fetchLatestPage(
      currentRun,
      pageIndex,
      paceConfigRef.current,
      nextPageUrlOverride,
    );
    const pageResults = await enrichSourceResultsWithJapaneseRomanization(
      buildSourceResults(currentRun.scraper, latestPage.page, pageIndex, latestPage.searchTerm),
    );
    const newPageResults = pageResults.filter((source) => {
      const key = getSourceDeduplicationKey(source);
      if (!key || loadedSourceKeys.has(key)) {
        return false;
      }

      loadedSourceKeys.add(key);
      return true;
    });
    const includedPageResults = newPageResults.filter((source) => (
      sourceMatchesIncludedLanguages(source, includedLanguageCodes)
    ));
    const firstIncludedPageResult = pageResults.find((source) => (
      sourceMatchesIncludedLanguages(source, includedLanguageCodes)
    ));
    const firstIncludedPageResultIsSeen = isSeenSource(firstIncludedPageResult, recordsById);
    const shouldIgnorePageResults = stopAtSeenFirstResult && firstIncludedPageResultIsSeen;
    const unseenResults = shouldIgnorePageResults
      ? []
      : includedPageResults.filter((source) => isUnseenSource(source, recordsById));
    const nextResults = [...currentRun.results, ...unseenResults].slice(0, resultLimit);
    const hasOnlyDuplicateResults = pageResults.length > 0 && newPageResults.length === 0;
    const checkpointSource = unseenResults[unseenResults.length - 1];
    let nextCheckpoint = currentRun.checkpoint;

    if (checkpointSource) {
      const checkpointRequest = buildScraperLatestCheckpointRequest({
        scraper: currentRun.scraper,
        module: currentRun.module,
        query: getRunQuery(currentRun),
        includedLanguageCodes,
        pageIndex,
        page: latestPage.page,
        result: checkpointSource.result,
      });

      if (checkpointRequest) {
        const localCheckpoint = buildLocalCheckpointRecord(checkpointRequest);
        if (localCheckpoint && shouldReplaceCheckpoint(nextCheckpoint, localCheckpoint)) {
          nextCheckpoint = localCheckpoint;
        }

        void saveScraperLatestCheckpoint(checkpointRequest).catch((checkpointError) => {
          console.warn("Failed to save scraper latest checkpoint", checkpointError);
        });
      }
    }

    const run = {
      ...currentRun,
      status: "done" as const,
      results: nextResults,
      checkpoint: nextCheckpoint,
      excludedByLanguageCount: currentRun.excludedByLanguageCount + newPageResults.length - includedPageResults.length,
      loadedPages: Math.max(currentRun.loadedPages, pageIndex + 1),
      checkedPages: currentRun.checkedPages + 1,
      hasNextPage: !hasOnlyDuplicateResults && latestPage.hasNextPage,
      currentPageUrl: latestPage.page.currentPageUrl,
      nextPageUrl: latestPage.page.nextPageUrl,
      error: undefined,
    };

    patchRun(token, run.key, () => run);

    return {
      run,
      pageResults,
      newPageResults,
      includedPageResults,
      unseenResults,
      hasOnlyDuplicateResults,
      firstIncludedPageResultIsSeen,
    };
  }, [patchRun]);

  const loadRunFromCheckpoint = useCallback(async (
    currentRun: ScraperLatestRun,
    resultLimit: number,
    recordsById: Map<string, ScraperViewHistoryRecord>,
    includedLanguageCodes: string[],
    loadedSourceKeys: Set<string>,
    token: number,
  ): Promise<ScraperLatestRun> => {
    const checkpoint = currentRun.checkpoint;
    if (!checkpoint || token !== tokenRef.current) {
      return currentRun;
    }

    let run: ScraperLatestRun = {
      ...currentRun,
      checkpointUsed: true,
      status: "loading",
      error: undefined,
    };
    const usesTemplatePaging = getRunUsesTemplatePaging(run);
    const loadedCheckpointPageIndexes = new Set<number>();
    let anchorFound = false;
    let nextPageIndex = checkpoint.pageIndex;
    let nextPageUrl = checkpoint.currentPageUrl;
    let checkedCheckpointPages = 0;

    patchRun(token, run.key, () => run);

    const applyCheckpointPage = async (
      pageIndex: number,
      pageUrl?: string,
    ): Promise<ProcessedLatestPage> => {
      const processedPage = await applyLatestPage(
        run,
        pageIndex,
        resultLimit,
        recordsById,
        includedLanguageCodes,
        loadedSourceKeys,
        token,
        false,
        pageUrl,
      );

      run = {
        ...processedPage.run,
        checkpointUsed: true,
      };
      checkedCheckpointPages += 1;
      patchRun(token, run.key, () => run);

      if (pageContainsCheckpointAnchor(processedPage.pageResults, checkpoint)) {
        anchorFound = true;
        nextPageIndex = pageIndex + 1;
        nextPageUrl = processedPage.run.nextPageUrl;
      }

      return processedPage;
    };

    if (usesTemplatePaging) {
      for (const pageIndex of getCheckpointCandidatePageIndexes(checkpoint)) {
        if (token !== tokenRef.current || run.results.length >= resultLimit) {
          return run;
        }

        loadedCheckpointPageIndexes.add(pageIndex);
        await applyCheckpointPage(pageIndex);

        if (anchorFound) {
          break;
        }
      }

      if (!anchorFound && !run.deepSearch) {
        run = {
          ...run,
          hasNextPage: false,
        };
        patchRun(token, run.key, () => run);
        return run;
      }

      if (!anchorFound) {
        nextPageIndex = checkpoint.pageIndex + 1;
      }

      while (run.hasNextPage && run.results.length < resultLimit && token === tokenRef.current) {
        if (!run.deepSearch && checkedCheckpointPages >= QUICK_CHECKPOINT_PAGE_BUDGET) {
          break;
        }

        if (loadedCheckpointPageIndexes.has(nextPageIndex)) {
          nextPageIndex += 1;
          continue;
        }

        loadedCheckpointPageIndexes.add(nextPageIndex);
        await applyCheckpointPage(nextPageIndex);
        nextPageIndex += 1;
      }

      return run;
    }

    if (!nextPageUrl) {
      run = {
        ...run,
        hasNextPage: false,
      };
      patchRun(token, run.key, () => run);
      return run;
    }

    while (
      nextPageUrl
      && run.results.length < resultLimit
      && token === tokenRef.current
      && (run.deepSearch || checkedCheckpointPages < QUICK_CHECKPOINT_PAGE_BUDGET)
    ) {
      const processedPage = await applyCheckpointPage(nextPageIndex, nextPageUrl);
      nextPageIndex += 1;
      nextPageUrl = processedPage.run.nextPageUrl;

      if (!anchorFound && !run.deepSearch && checkedCheckpointPages >= QUICK_CHECKPOINT_PAGE_BUDGET) {
        break;
      }
    }

    return run;
  }, [applyLatestPage, patchRun]);

  const loadRun = useCallback(async (
    initialRun: ScraperLatestRun,
    resultLimit: number,
    recordsById: Map<string, ScraperViewHistoryRecord>,
    includedLanguageCodes: string[],
    token: number,
    continueFromQuickScan = false,
  ): Promise<ScraperLatestRun> => {
    let run = initialRun;
    const loadedSourceKeys = new Set(
      initialRun.results
        .map(getSourceDeduplicationKey)
        .filter(Boolean),
    );

    while (run.hasNextPage && run.results.length < resultLimit && token === tokenRef.current) {
      const pageIndex = run.loadedPages;

      try {
        const processedPage = await applyLatestPage(
          run,
          pageIndex,
          resultLimit,
          recordsById,
          includedLanguageCodes,
          loadedSourceKeys,
          token,
          !run.deepSearch && !run.checkpointUsed && !continueFromQuickScan,
        );
        run = processedPage.run;

        const pageHasNoNewIncludedResult = processedPage.hasOnlyDuplicateResults
          || (processedPage.includedPageResults.length > 0 && processedPage.unseenResults.length === 0);
        const quickBoundaryReached = !run.deepSearch
          && !run.checkpointUsed
          && !continueFromQuickScan
          && (
            processedPage.hasOnlyDuplicateResults
            || processedPage.firstIncludedPageResultIsSeen
          );

        if (quickBoundaryReached) {
          saveQuickContinuation(buildQuickContinuation(
            {
              ...run,
              hasNextPage: true,
              loadedPages: pageIndex,
              currentPageUrl: processedPage.run.currentPageUrl,
              nextPageUrl: processedPage.run.currentPageUrl,
            },
            includedLanguageCodes,
            pageIndex,
            processedPage.run.currentPageUrl,
          ));

          run = {
            ...run,
            hasNextPage: false,
          };
          patchRun(token, run.key, () => run);
          return run;
        }

        if (
          pageHasNoNewIncludedResult
          && run.results.length < resultLimit
          && !run.checkpointUsed
          && !continueFromQuickScan
        ) {
          if (run.deepSearch && run.checkpoint) {
            run = await loadRunFromCheckpoint(
              run,
              resultLimit,
              recordsById,
              includedLanguageCodes,
              loadedSourceKeys,
              token,
            );
            return run;
          }

          run = {
            ...run,
            hasNextPage: false,
          };
          patchRun(token, run.key, () => run);
          return run;
        }
      } catch (loadError) {
        const isPaginationEnd = isScraperListingPaginationEndError(loadError);
        run = {
          ...run,
          status: run.results.length || isPaginationEnd ? "done" : "error",
          hasNextPage: false,
          error: isPaginationEnd
            ? undefined
            : loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.",
        };

        patchRun(token, run.key, () => run);
        return run;
      }
    }

    return run;
  }, [applyLatestPage, loadRunFromCheckpoint, patchRun, saveQuickContinuation]);

  const start = useCallback(async (
    scrapers: ScraperRecord[],
    resultLimitValue: number,
    recordsById: Map<string, ScraperViewHistoryRecord>,
    includedLanguageCodeValues: string[] = [],
    options: StartOptions = {},
  ) => {
    const enabledScrapers = getEnabledLatestScrapers(scrapers);
    const resultLimit = normalizeResultLimit(resultLimitValue);
    const includedLanguageCodes = normalizeLanguageCodes(includedLanguageCodeValues);
    const searchMode: ScraperLatestSearchMode = options.searchMode === "deep" ? "deep" : "quick";
    const continueFromQuickScan = searchMode === "quick" && options.continueFromQuickScan === true;
    const token = tokenRef.current + 1;
    tokenRef.current = token;

    setRuns([]);
    setMessage(null);
    setError(enabledScrapers.length ? null : "Aucun scrapper n'est configure pour les nouveautes.");
    setLoading(Boolean(enabledScrapers.length));

    if (!enabledScrapers.length) {
      return;
    }

    try {
      let checkpoints: ScraperLatestCheckpointRecord[] = [];
      if (searchMode === "deep") {
        try {
          checkpoints = await getScraperLatestCheckpoints();
        } catch (checkpointError) {
          console.warn("Failed to load scraper latest checkpoints", checkpointError);
        }
      }

      if (token !== tokenRef.current) {
        return;
      }

      const continuationIdsToRefresh = new Set(enabledScrapers.map((scraper) => {
        const module: ScraperLatestRunModule = scraper.globalConfig.latest?.module === "search" ? "search" : "homepage";
        return buildQuickContinuationId({
          scraperId: scraper.id,
          scraperUpdatedAt: scraper.updatedAt,
          module,
          query: module === "search" ? scraper.globalConfig.homeSearch?.query ?? "" : "",
          includedLanguageCodes,
        });
      }));

      if (searchMode === "quick" && !continueFromQuickScan) {
        quickContinuationsRef.current = quickContinuationsRef.current.filter((continuation) => (
          !continuationIdsToRefresh.has(continuation.id)
        ));
      }

      const initialRuns = enabledScrapers.map((scraper) => {
        const module: ScraperLatestRunModule = scraper.globalConfig.latest?.module === "search" ? "search" : "homepage";
        const continuationKey = {
          scraperId: scraper.id,
          scraperUpdatedAt: scraper.updatedAt,
          module,
          query: module === "search" ? scraper.globalConfig.homeSearch?.query ?? "" : "",
          includedLanguageCodes,
        };
        const quickContinuation = continueFromQuickScan
          ? getQuickContinuationForKey(quickContinuationsRef.current, continuationKey)
          : null;

        if (quickContinuation) {
          return buildQuickContinuationRun(scraper, quickContinuation, searchMode);
        }

        const checkpoint = searchMode === "deep"
          ? getScraperLatestCheckpointForKey(checkpoints, continuationKey, scraper.updatedAt)
          : null;

        if (continueFromQuickScan) {
          return {
            ...buildRun(scraper, null, searchMode),
            status: "done" as const,
            hasNextPage: false,
          };
        }

        return buildRun(scraper, checkpoint, searchMode);
      });

      setRuns(initialRuns);

      await runWithConcurrency(
        initialRuns.map((run) => async () => {
          const runResultLimit = continueFromQuickScan
            ? run.results.length + resultLimit
            : resultLimit;
          const completedRun = await loadRun(
            run,
            runResultLimit,
            recordsById,
            includedLanguageCodes,
            token,
            continueFromQuickScan,
          );

          if (searchMode === "quick") {
            const existingContinuation = getQuickContinuationForKey(
              quickContinuationsRef.current,
              buildContinuationKeyForRun(completedRun, includedLanguageCodes),
            );

            if (continueFromQuickScan || !existingContinuation) {
              saveQuickContinuation(buildQuickContinuation(
                completedRun,
                includedLanguageCodes,
                completedRun.hasNextPage ? completedRun.loadedPages : null,
                completedRun.hasNextPage ? completedRun.nextPageUrl : undefined,
              ));
            }
          }
        }),
        paceConfigRef.current.concurrency,
      );

      if (token === tokenRef.current) {
        setMessage(
          includedLanguageCodes.length
            ? `${resultLimit} resultat(s) non vu(s) recherches par scrapper dans les langues incluses${searchMode === "deep" ? " en recherche profonde" : " en mode rapide"}.`
            : `${resultLimit} resultat(s) non vu(s) recherches par scrapper${searchMode === "deep" ? " en recherche profonde" : " en mode rapide"}.`,
        );
      }
    } catch (loadError) {
      if (token === tokenRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.");
      }
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
      }
    }
  }, [loadRun]);

  const reset = useCallback(() => {
    tokenRef.current += 1;
    quickContinuationsRef.current = [];
    setRuns([]);
    setLoading(false);
    setMessage(null);
    setError(null);
  }, []);

  return {
    runs,
    loading,
    message,
    error,
    enabledRunCount,
    start,
    reset,
  };
}
