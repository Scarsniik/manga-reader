import type {
  BackgroundSearchProgress,
  MultiSearchBackgroundInput,
} from "@/shared/backgroundSearch";
import {
  getPaceConfig,
  runWithConcurrency,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { executeMultiSearchTermPage } from "@/renderer/components/MultiSearch/multiSearchPageExecution";
import {
  keepNewSourceResults,
  buildInitialRun as buildInitialMultiSearchRun,
  cancelMultiSearchRun,
  ensureRunSearchTerms,
} from "@/renderer/components/MultiSearch/multiSearchRunState";
import { parseMultiSearchTerms } from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchScraperRun,
  MultiSearchTermRun,
} from "@/renderer/components/MultiSearch/types";
import type { MultiSearchBackgroundResult } from "@/renderer/backgroundSearch/types";
import {
  createScraperCardDetailsCache,
  isScraperListingPaginationEndError,
} from "@/renderer/utils/scraperRuntime";
import { throwIfSearchAborted } from "@/renderer/searchEngines/searchEngineCancellation";
import {
  createSearchExecutionContext,
  getOrCreateSearchExecutionContext,
  type SearchExecutionContext,
} from "@/renderer/searchEngines/searchExecutionContext";
import {
  finishScraperLatestDiagnosticSession,
  startScraperLatestDiagnosticSession,
} from "@/renderer/utils/scraperLatestDiagnostics";
import { buildScraperListingPageRequestKey } from "@/renderer/utils/scraperLatestExecutionPlanning";
import type { ExecuteMultiSearchTermPageResult } from "@/renderer/components/MultiSearch/multiSearchPageExecution";

export type MultiSearchEngineOptions = {
  initialRuns?: MultiSearchScraperRun[];
  pageCount?: number | null;
  detailsCache?: ReturnType<typeof createScraperCardDetailsCache>;
  executionContext?: SearchExecutionContext;
  shouldContinueScraper?: (scraperId: string) => boolean;
};

export type MultiSearchSnapshotCallback = (
  result: MultiSearchBackgroundResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

const countMultiSearchResults = (runs: MultiSearchScraperRun[]): number => (
  runs.reduce((count, run) => count + run.results.length, 0)
);

const runMultiSearchEngineCore = async (
  input: MultiSearchBackgroundInput,
  signal: AbortSignal,
  onSnapshot: MultiSearchSnapshotCallback,
  options: MultiSearchEngineOptions = {},
): Promise<MultiSearchBackgroundResult> => {
  const terms = parseMultiSearchTerms(input.query);
  if (!terms.length) throw new Error("La recherche est vide.");
  if (!input.scrapers.length) throw new Error("Aucun scrapper compatible n'est selectionne.");

  const pace = getPaceConfig(input.paceMode);
  const executionContext = getOrCreateSearchExecutionContext(options.executionContext, {
    kind: "multiSearch",
  });
  const detailsCache = options.detailsCache ?? executionContext.detailsCache;
  const pagePrefetch = executionContext.getPagePrefetchCache<ExecuteMultiSearchTermPageResult>(
    "multi-search-pages",
  );
  const requestedPageCount = options.pageCount === undefined ? input.maxPages : options.pageCount;
  const maxPages = requestedPageCount === null ? 250 : Math.max(1, requestedPageCount);
  const executionFingerprint = executionContext.checkpointAdapter.fingerprint(input);
  const initialRunsByScraperId = new Map(
    (options.initialRuns ?? []).map((run) => [run.scraper.id, run]),
  );
  const runs: MultiSearchScraperRun[] = input.scrapers.map((scraper) => {
    const initialRun = initialRunsByScraperId.get(scraper.id);
    if (!initialRun) return buildInitialMultiSearchRun(scraper, terms);
    return {
      ...initialRun,
      scraper,
      status: "waiting",
      searchTerms: ensureRunSearchTerms(initialRun, terms),
      error: undefined,
    };
  });

  const emit = async (label?: string): Promise<void> => onSnapshot({
    runs: [...runs],
    executionFingerprint,
  }, {
    completedUnits: runs.filter((run) => run.status === "done" || run.status === "error").length,
    totalUnits: runs.length,
    resultCount: countMultiSearchResults(runs),
    currentLabel: label,
  });
  await emit();

  await runWithConcurrency(runs.map((initialRun, runIndex) => async () => {
    let run: MultiSearchScraperRun = { ...initialRun, status: "loading" };
    runs[runIndex] = run;
    await emit(run.scraper.name);
    try {
      for (let pageOffset = 0; pageOffset < maxPages; pageOffset += 1) {
        throwIfSearchAborted(signal);
        if (options.shouldContinueScraper?.(run.scraper.id) === false) {
          run = cancelMultiSearchRun(run);
          break;
        }
        let loadedAnyPage = false;
        const nextTerms: MultiSearchTermRun[] = [];
        for (const termRun of run.searchTerms) {
          if (!termRun.hasNextPage) {
            nextTerms.push(termRun);
            continue;
          }
          throwIfSearchAborted(signal);
          if (options.shouldContinueScraper?.(run.scraper.id) === false) {
            run = cancelMultiSearchRun(run);
            break;
          }
          try {
            const executePage = () => executeMultiSearchTermPage({
              scraper: run.scraper,
              term: termRun.term,
              pageIndex: termRun.loadedPages,
              nextPageUrl: termRun.nextPageUrl,
              existingResults: run.results,
              paceConfig: pace,
              includedLanguageCodes: input.includedLanguageCodes,
              scrapeDetailsWithCards: input.scrapeDetailsWithCards,
              detailsCache,
              fetchDocument: executionContext.fetchDocument,
            });
            const pageSourceKey = `${run.scraper.id}:${termRun.term}`;
            const pageExecutionResult = await pagePrefetch.load(
              pageSourceKey,
              buildScraperListingPageRequestKey(termRun.loadedPages, termRun.nextPageUrl),
              executePage,
            );
            const pageExecution = {
              ...pageExecutionResult,
              newPageResults: keepNewSourceResults(run.results, pageExecutionResult.pageResults),
            };
            run = { ...run, results: [...run.results, ...pageExecution.newPageResults] };
            nextTerms.push({
              ...termRun,
              loadedPages: pageExecution.loadedPages,
              hasNextPage: pageExecution.hasNextPage,
              currentPageUrl: pageExecution.currentPageUrl,
              nextPageUrl: pageExecution.nextPageUrl,
            });
            if (pageExecution.hasNextPage && pageOffset + 1 < maxPages) {
              const followingPageIndex = pageExecution.loadedPages;
              const followingPageUrl = pageExecution.nextPageUrl;
              pagePrefetch.preload(
                pageSourceKey,
                buildScraperListingPageRequestKey(followingPageIndex, followingPageUrl),
                () => executeMultiSearchTermPage({
                  scraper: run.scraper,
                  term: termRun.term,
                  pageIndex: followingPageIndex,
                  nextPageUrl: followingPageUrl,
                  existingResults: run.results,
                  paceConfig: pace,
                  includedLanguageCodes: input.includedLanguageCodes,
                  scrapeDetailsWithCards: input.scrapeDetailsWithCards,
                  detailsCache,
                  fetchDocument: executionContext.fetchDocument,
                }),
              );
            }
            loadedAnyPage = true;
          } catch (error) {
            if (!isScraperListingPaginationEndError(error) && run.results.length === 0) throw error;
            nextTerms.push({ ...termRun, hasNextPage: false });
          }
        }
        run = {
          ...run,
          searchTerms: nextTerms,
          loadedPages: Math.max(0, ...nextTerms.map((term) => term.loadedPages)),
          hasNextPage: nextTerms.some((term) => term.hasNextPage),
        };
        if (options.shouldContinueScraper?.(run.scraper.id) === false) {
          run = cancelMultiSearchRun(run);
        }
        runs[runIndex] = run;
        await emit(run.scraper.name);
        if (run.status === "cancelled" || !loadedAnyPage || !run.hasNextPage) break;
      }
      if (requestedPageCount === null && run.hasNextPage) {
        throw new Error("Limite de sécurité atteinte pendant le chargement complet.");
      }
      if (run.status !== "cancelled") run = { ...run, status: "done" };
    } catch (error) {
      if (signal.aborted) {
        run = cancelMultiSearchRun(run);
      } else {
        run = {
          ...run,
          status: "error",
          hasNextPage: false,
          error: error instanceof Error ? error.message : "Echec de la recherche.",
        };
      }
    }
    runs[runIndex] = run;
    await emit(run.scraper.name);
  }), pace.concurrency);

  throwIfSearchAborted(signal);
  pagePrefetch.clear();
  return { runs, executionFingerprint };
};

export const runMultiSearchEngine = async (
  input: MultiSearchBackgroundInput,
  signal: AbortSignal,
  onSnapshot: MultiSearchSnapshotCallback,
  options: MultiSearchEngineOptions = {},
): Promise<MultiSearchBackgroundResult> => {
  const inheritedProfileId = options.executionContext?.diagnostics?.profileId;
  const settings = inheritedProfileId ? null : await window.api?.getSettings?.().catch(() => null);
  const enabled = settings?.scraperPerformanceReportsEnabled === true
    || settings?.scraperLatestPerformanceReportsEnabled === true;
  const ownedSession = !inheritedProfileId && enabled
    ? await startScraperLatestDiagnosticSession({
      mode: "foreground",
      searchKind: "multiSearch",
      concurrency: getPaceConfig(input.paceMode).concurrency,
      sourceCount: input.scrapers.length,
    })
    : null;
  const executionContext = options.executionContext ?? createSearchExecutionContext({
    kind: "multiSearch",
    mode: "foreground",
    diagnostics: ownedSession ? {
      profileId: ownedSession.profileId,
      purpose: "engine.multiSearch",
    } : undefined,
  });
  let status: "completed" | "cancelled" | "error" = "completed";
  try {
    return await runMultiSearchEngineCore(input, signal, onSnapshot, {
      ...options,
      executionContext,
    });
  } catch (error) {
    status = signal.aborted ? "cancelled" : "error";
    throw error;
  } finally {
    await finishScraperLatestDiagnosticSession(ownedSession, status, {
      searchKind: "multiSearch",
      memoryRequestCount: executionContext.requestCache.size,
    });
  }
};
