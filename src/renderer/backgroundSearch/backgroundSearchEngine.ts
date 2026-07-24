import type {
  AuthorCorrespondenceBackgroundInput,
  BackgroundSearchJob,
  BackgroundSearchKind,
  BackgroundSearchProgress,
  ListingBackgroundInput,
  MangaCorrespondenceBackgroundInput,
  MultiSearchBackgroundInput,
} from "@/shared/backgroundSearch";
import {
  buildScraperViewHistoryCardId,
  type ScraperSearchResultItem,
  type ScraperViewHistoryRecord,
} from "@/shared/scraper";
import {
  buildSourceResults,
  enrichSourceResultsWithCardDetails,
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
import { parseMultiSearchTerms } from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchScraperRun,
  MultiSearchSourceResult,
  MultiSearchTermRun,
} from "@/renderer/components/MultiSearch/types";
import { isScraperListingPaginationEndError } from "@/renderer/utils/scraperRuntime";
import { appendScraperSearchResultTagToItems } from "@/renderer/utils/scraperSearchResultTags";
import { buildSearchResultViewHistoryIdentity } from "@/renderer/utils/scraperViewHistory";
import type {
  BackgroundListingRun,
  BackgroundSearchExecutionResult,
  ListingBackgroundResult,
  MultiSearchBackgroundResult,
} from "@/renderer/backgroundSearch/types";
import { runMangaCorrespondenceSearch } from "@/renderer/backgroundSearch/mangaCorrespondenceEngine";
import { runAuthorCorrespondenceSearch } from "@/renderer/backgroundSearch/authorCorrespondenceEngine";
import {
  resolveBackgroundListingConcurrency,
  resolveBackgroundQuickSeenProgress,
} from "@/renderer/backgroundSearch/backgroundListingExecution";
import {
  BACKGROUND_LISTING_MAX_STAGNANT_BACKFILL_PAGES,
  filterBackgroundListingSourcesByBlacklist,
  isBackgroundListingPaginationStalled,
  resolveBackgroundListingAcceptedTarget,
  shouldContinueBackgroundBlacklistBackfill,
} from "@/renderer/backgroundSearch/backgroundListingBlacklist";

type SnapshotCallback = (
  result: BackgroundSearchExecutionResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new DOMException("Recherche annulee", "AbortError");
  }
};

const normalizeResultUrl = (source: MultiSearchSourceResult): string => (
  source.result.detailUrl?.trim() || `${source.scraper.id}:${source.result.title}`
);

const appendUniqueResults = (
  existing: MultiSearchSourceResult[],
  incoming: MultiSearchSourceResult[],
): MultiSearchSourceResult[] => {
  const seen = new Set(existing.map(normalizeResultUrl));
  return [...existing, ...incoming.filter((source) => {
    const key = normalizeResultUrl(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
};

const countMultiSearchResults = (runs: MultiSearchScraperRun[]): number => (
  runs.reduce((count, run) => count + run.results.length, 0)
);

const countListingResults = (runs: BackgroundListingRun[]): number => (
  runs.reduce((count, run) => count + run.results.length, 0)
);

const runMultiSearch = async (
  input: MultiSearchBackgroundInput,
  signal: AbortSignal,
  onSnapshot: SnapshotCallback,
): Promise<MultiSearchBackgroundResult> => {
  const terms = parseMultiSearchTerms(input.query);
  if (!terms.length) throw new Error("La recherche est vide.");
  if (!input.scrapers.length) throw new Error("Aucun scrapper compatible n'est selectionne.");

  const pace = getPaceConfig(input.paceMode);
  const maxPages = input.maxPages === null ? 250 : Math.max(1, input.maxPages);
  const runs: MultiSearchScraperRun[] = input.scrapers.map((scraper) => ({
    scraper,
    status: "waiting",
    results: [],
    searchTerms: terms.map((term): MultiSearchTermRun => ({ term, loadedPages: 0, hasNextPage: true })),
    loadedPages: 0,
    hasNextPage: true,
  }));

  const emit = async (label?: string): Promise<void> => onSnapshot({ runs: [...runs] }, {
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
      const config = getSearchConfig(run.scraper);
      for (let pageOffset = 0; pageOffset < maxPages; pageOffset += 1) {
        throwIfAborted(signal);
        let loadedAnyPage = false;
        const nextTerms: MultiSearchTermRun[] = [];
        for (const termRun of run.searchTerms) {
          if (!termRun.hasNextPage) {
            nextTerms.push(termRun);
            continue;
          }
          throwIfAborted(signal);
          try {
            const page = await fetchSearchPageWithRetry(
              run.scraper,
              config,
              termRun.term,
              termRun.loadedPages,
              termRun.nextPageUrl,
              pace,
              { scrapeDetailsWithCards: input.scrapeDetailsWithCards },
            );
            const sources = await enrichSourceResultsWithJapaneseRomanization(
              buildSourceResults(run.scraper, page, termRun.loadedPages, termRun.term)
                .filter((source) => doesMultiSearchSourceMatchIncludedLanguages(source, input.includedLanguageCodes)),
            );
            const nextResults = appendUniqueResults(run.results, sources);
            const onlyDuplicates = sources.length > 0 && nextResults.length === run.results.length;
            run = { ...run, results: nextResults };
            nextTerms.push({
              ...termRun,
              loadedPages: termRun.loadedPages + 1,
              hasNextPage: !onlyDuplicates && resolveHasNextPage(config, page),
              currentPageUrl: page.currentPageUrl,
              nextPageUrl: page.nextPageUrl,
            });
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
        runs[runIndex] = run;
        await emit(run.scraper.name);
        if (!loadedAnyPage || !run.hasNextPage) break;
      }
      if (input.maxPages === null && run.hasNextPage) {
        throw new Error("Limite de sécurité atteinte pendant le chargement complet.");
      }
      run = { ...run, status: "done" };
    } catch (error) {
      if (signal.aborted) {
        run = { ...run, status: "cancelled" };
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

  throwIfAborted(signal);
  return { runs };
};

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

const runListings = async (
  kind: BackgroundSearchKind,
  input: ListingBackgroundInput,
  signal: AbortSignal,
  onSnapshot: SnapshotCallback,
): Promise<ListingBackgroundResult> => {
  if (!input.sources.length) throw new Error("Aucune source n'est disponible.");
  const filterHistory = kind === "latestSources" || kind === "latestAuthors";
  const knownHistoryIds = filterHistory ? await getKnownHistoryIds() : new Set<string>();
  const pace = getPaceConfig(input.paceMode);
  const concurrency = resolveBackgroundListingConcurrency(input.concurrency, pace.concurrency);
  const configuredMaxPages = input.maxPages === null ? 250 : Math.max(1, input.maxPages);
  const runs: BackgroundListingRun[] = input.sources.map((source) => ({
    key: source.id,
    name: source.name,
    scraper: source.scraper,
    query: source.query,
    status: "waiting",
    results: [],
    loadedPages: 0,
    hasNextPage: true,
  }));
  const emit = async (label?: string): Promise<void> => onSnapshot({ runs: [...runs] }, {
    completedUnits: runs.filter((run) => run.status === "done" || run.status === "error").length,
    totalUnits: runs.length,
    resultCount: countListingResults(runs),
    excludedResultCount: runs.reduce(
      (count, run) => count + (run.excludedByBlacklistedTagCount ?? 0),
      0,
    ),
    currentLabel: label,
  });
  await emit();

  await runWithConcurrency(runs.map((initialRun, runIndex) => async () => {
    let run: BackgroundListingRun = { ...initialRun, status: "loading" };
    runs[runIndex] = run;
    await emit(run.name);
    try {
      const source = input.sources[runIndex];
      const resultLimit = Math.max(0, Math.floor(source.resultLimit ?? input.resultLimit ?? 0));
      const backfillBlacklistedResults = kind === "latestSources"
        && input.excludeBlacklistedTagCards === true;
      const executionPageLimit = backfillBlacklistedResults ? 250 : configuredMaxPages;
      const rawQuotaResultKeys = new Set<string>();
      const seenCandidateResultKeys = new Set<string>();
      let acceptedResultTarget = 0;
      let consecutiveStagnantBackfillPages = 0;
      let consecutiveSeenResultCount = 0;
      for (let pageIndex = 0; pageIndex < executionPageLimit; pageIndex += 1) {
        throwIfAborted(signal);
        const sourceMode = source.mode ?? (kind === "latestSources" ? "homepage" : "author");
        const requestedPageUrl = run.nextPageUrl;
        const page = sourceMode === "homepage"
          ? await fetchHomepagePageWithRetry(
            run.scraper,
            getHomepageConfig(run.scraper),
            pageIndex,
            run.nextPageUrl,
            pace,
            { scrapeDetailsWithCards: false },
          ) : sourceMode === "search"
          ? await fetchSearchPageWithRetry(
            run.scraper,
            getSearchConfig(run.scraper),
            run.query,
            pageIndex,
            run.nextPageUrl,
            pace,
            { scrapeDetailsWithCards: false },
          ) : sourceMode === "tag"
          ? await fetchTagPageWithRetry(
            run.scraper,
            getTagConfig(run.scraper),
            run.query,
            pageIndex,
            run.nextPageUrl,
            pace,
            { scrapeDetailsWithCards: false },
          ) : await fetchAuthorPageWithRetry(
            run.scraper,
            getAuthorConfig(run.scraper),
            run.query,
            pageIndex,
            run.nextPageUrl,
            pace,
            source.templateContext ?? null,
            { scrapeDetailsWithCards: false },
          );
        const pageWithResultTag = source.resultTag
          ? {
            ...page,
            items: appendScraperSearchResultTagToItems(
              page.items,
              source.resultTag.name,
              source.resultTag.url,
            ),
          }
          : page;
        const pageSources = buildSourceResults(run.scraper, pageWithResultTag, pageIndex, run.name)
          .filter((item) => doesMultiSearchSourceMatchIncludedLanguages(item, input.includedLanguageCodes));
        const newPageSources = pageSources.filter((item) => {
          const key = normalizeResultUrl(item);
          if (seenCandidateResultKeys.has(key)) return false;
          seenCandidateResultKeys.add(key);
          return true;
        });
        const quickSeenProgress = resolveBackgroundQuickSeenProgress(
          newPageSources.map((item) => isKnownResult(knownHistoryIds, run.scraper.id, item.result)),
          consecutiveSeenResultCount,
          input.quickConsecutiveSeenStopThreshold,
        );
        consecutiveSeenResultCount = quickSeenProgress.consecutiveSeenCount;
        const rawUnseenSources = newPageSources
          .filter((item) => !filterHistory || !isKnownResult(knownHistoryIds, run.scraper.id, item.result));
        const detailedSources = await enrichSourceResultsWithCardDetails(run.scraper, rawUnseenSources, {
          scrapeDetailsWithCards: input.scrapeDetailsWithCards,
        });
        const newEligibleSources = await enrichSourceResultsWithJapaneseRomanization(
          detailedSources
            .filter((item) => doesMultiSearchSourceMatchIncludedLanguages(item, input.includedLanguageCodes))
            .filter((item) => !filterHistory || !isKnownResult(knownHistoryIds, run.scraper.id, item.result)),
        );
        if (backfillBlacklistedResults && pageIndex < configuredMaxPages) {
          newEligibleSources.forEach((item) => rawQuotaResultKeys.add(normalizeResultUrl(item)));
          acceptedResultTarget = resolveBackgroundListingAcceptedTarget(
            rawQuotaResultKeys.size,
            resultLimit,
          );
        }
        const blacklistFilter = kind === "latestSources"
          ? filterBackgroundListingSourcesByBlacklist(newEligibleSources, input)
          : { accepted: newEligibleSources, excludedCount: 0 };
        let nextResults = appendUniqueResults(run.results, blacklistFilter.accepted);
        const storedResultLimit = backfillBlacklistedResults ? acceptedResultTarget : resultLimit;
        if (storedResultLimit > 0) nextResults = nextResults.slice(0, storedResultLimit);
        const sourceHasNextPage = sourceMode === "homepage"
          ? resolveHasNextHomepagePage(getHomepageConfig(run.scraper), page)
          : sourceMode === "search"
            ? resolveHasNextPage(getSearchConfig(run.scraper), page)
            : sourceMode === "tag"
              ? resolveHasNextTagPage(getTagConfig(run.scraper), page)
              : resolveHasNextAuthorPage(getAuthorConfig(run.scraper), page);
        const isBackfillPage = pageIndex >= configuredMaxPages;
        consecutiveStagnantBackfillPages = backfillBlacklistedResults
          && isBackfillPage
          && newEligibleSources.length === 0
          ? consecutiveStagnantBackfillPages + 1
          : 0;
        const paginationStalled = isBackgroundListingPaginationStalled(requestedPageUrl, page.nextPageUrl);
        const duplicatePage = pageSources.length > 0 && newPageSources.length === 0;
        const quickAuthorBoundaryReached = kind === "latestAuthors"
          && input.searchMode === "quick"
          && quickSeenProgress.boundaryReached
          && !(pageIndex === 0 && rawUnseenSources.length > 0);
        const backfillStalled = backfillBlacklistedResults
          && isBackfillPage
          && consecutiveStagnantBackfillPages >= BACKGROUND_LISTING_MAX_STAGNANT_BACKFILL_PAGES;
        const canLoadAnotherPage = sourceHasNextPage
          && !paginationStalled
          && !duplicatePage
          && !quickAuthorBoundaryReached
          && !backfillStalled;
        const hasNextPage = backfillBlacklistedResults
          ? shouldContinueBackgroundBlacklistBackfill({
            sourceHasNextPage: canLoadAnotherPage,
            nextPageIndex: pageIndex + 1,
            configuredMaxPages,
            resultLimit,
            acceptedResultTarget,
            storedResultCount: nextResults.length,
          })
          : canLoadAnotherPage && (resultLimit === 0 || nextResults.length < resultLimit);
        run = {
          ...run,
          results: nextResults,
          loadedPages: pageIndex + 1,
          hasNextPage,
          currentPageUrl: page.currentPageUrl,
          nextPageUrl: page.nextPageUrl,
          excludedByBlacklistedTagCount: (run.excludedByBlacklistedTagCount ?? 0)
            + blacklistFilter.excludedCount,
        };
        runs[runIndex] = run;
        await emit(run.name);
        if (!run.hasNextPage) break;
      }
      if ((input.maxPages === null || backfillBlacklistedResults) && run.hasNextPage) {
        throw new Error("Limite de sécurité atteinte pendant le chargement complet.");
      }
      run = { ...run, status: "done" };
    } catch (error) {
      if (signal.aborted) {
        run = { ...run, status: "cancelled" };
      } else if (isScraperListingPaginationEndError(error) && run.results.length > 0) {
        run = { ...run, status: "done", hasNextPage: false };
      } else {
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
  }), concurrency);

  throwIfAborted(signal);
  return { runs };
};

export const executeBackgroundSearch = async (
  job: BackgroundSearchJob,
  signal: AbortSignal,
  onSnapshot: SnapshotCallback,
): Promise<BackgroundSearchExecutionResult> => {
  const adapters: Record<BackgroundSearchKind, () => Promise<BackgroundSearchExecutionResult>> = {
    multiSearch: () => runMultiSearch(job.input as MultiSearchBackgroundInput, signal, onSnapshot),
    mangaCorrespondence: () => runMangaCorrespondenceSearch(
      job.input as MangaCorrespondenceBackgroundInput,
      signal,
      onSnapshot,
    ),
    authorCorrespondence: () => runAuthorCorrespondenceSearch(
      job.input as AuthorCorrespondenceBackgroundInput,
      signal,
      onSnapshot,
    ),
    scraperAuthor: () => runListings("scraperAuthor", job.input as ListingBackgroundInput, signal, onSnapshot),
    latestSources: () => runListings("latestSources", job.input as ListingBackgroundInput, signal, onSnapshot),
    latestAuthors: () => runListings("latestAuthors", job.input as ListingBackgroundInput, signal, onSnapshot),
    authorFavoriteRefresh: () => runListings(
      "authorFavoriteRefresh",
      job.input as ListingBackgroundInput,
      signal,
      onSnapshot,
    ),
  };

  return adapters[job.metadata.kind]();
};
