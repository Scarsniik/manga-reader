import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ScraperLatestCheckpointModule,
  ScraperLatestCheckpointRecord,
  ScraperLatestResultLimitMode,
  ScraperRecord,
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import {
  DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT,
} from "@/shared/scraperLatestSettings";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import type { BackgroundListingRun } from "@/renderer/backgroundSearch/types";
import type { ListingBackgroundInput } from "@/shared/backgroundSearch";
import { runScraperLatestSearch } from "@/renderer/searchEngines/listingSearchEngine";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";
import {
  splitIncludeFilterValues,
} from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import {
  buildLatestSourceListingSources,
  buildLatestSourceSearchInput,
} from "@/renderer/searchEngines/latestSourceSearchInput";
import { buildStoredScraperLatestContinuationRuns } from "@/renderer/components/ScraperLatest/scraperLatestContinuation";

export type ScraperLatestRunStatus = "waiting" | "loading" | "done" | "error";
export type ScraperLatestRunModule = ScraperLatestCheckpointModule;
export type ScraperLatestSearchMode = "quick" | "continuous" | "deep";
export type ScraperLatestRunSourceKind = "scraper" | "tagFavorite";
export const DEFAULT_SCRAPER_LATEST_CONTINUOUS_PAGE_SAFETY_LIMIT = 100;
export { DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT } from "@/shared/scraperLatestSettings";

export type ScraperLatestRun = {
  key: string;
  sourceKind: ScraperLatestRunSourceKind;
  scraper: ScraperRecord;
  module: ScraperLatestRunModule;
  query: string;
  favorite?: ScraperTagFavoriteRecord;
  favoriteSource?: ScraperTagFavoriteSource;
  status: ScraperLatestRunStatus;
  results: MultiSearchSourceResult[];
  pendingResults: MultiSearchSourceResult[];
  pendingCandidates: MultiSearchSourceResult[];
  quickConsecutiveSeenResultCount: number;
  excludedByLanguageCount: number;
  excludedByBlacklistedTagCount: number;
  includedByLanguageCount: number;
  loadedPages: number;
  checkedPages: number;
  hasNextPage: boolean;
  canContinue: boolean;
  checkpoint?: ScraperLatestCheckpointRecord | null;
  checkpointUsed: boolean;
  deepScanPhaseStarted: boolean;
  deepScanCheckpointPending: boolean;
  deepSearch: boolean;
  continuousScan: boolean;
  sourceExhausted?: boolean;
  safetyLimitReached?: boolean;
  languageRejectLimitReached?: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  error?: string;
};

type StartOptions = {
  searchMode?: ScraperLatestSearchMode;
  continueFromQuickScan?: boolean;
  preserveCurrentResults?: boolean;
  quickConsecutiveSeenStopThreshold?: number;
  deepPageLimit?: number;
  continuousPageSafetyLimit?: number;
  concurrency?: number;
  tagResultLimit?: number;
  resultLimitMode?: ScraperLatestResultLimitMode;
  languageRejectLimit?: number;
  includedScraperIds?: string[];
  tagFavorites?: ScraperTagFavoriteRecord[];
  scrapeDetailsWithCards?: boolean;
  excludeBlacklistedTagCards?: boolean;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  performanceReportsEnabled?: boolean;
  storedContinuation?: {
    input: ListingBackgroundInput;
    runs?: BackgroundListingRun[];
  };
};

const normalizePositiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeNonNegativeInteger = (value: unknown, fallback = 0): number => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const getIncludedLatestScrapers = (
  scrapers: ScraperRecord[],
  filterValues: string[],
): ScraperRecord[] => {
  const enabledScrapers = scrapers.filter((scraper) => scraper.globalConfig.latest?.enabled);
  const { includedValues, excludedValues } = splitIncludeFilterValues(filterValues);
  const excludedIds = new Set(excludedValues);
  const includedIds = new Set(includedValues);
  return enabledScrapers.filter((scraper) => (
    !excludedIds.has(scraper.id)
    && (!includedIds.size || includedIds.has(scraper.id))
  ));
};

type RunMetadata = {
  sourceKind: ScraperLatestRunSourceKind;
  module: ScraperLatestRunModule;
  favorite?: ScraperTagFavoriteRecord;
  favoriteSource?: ScraperTagFavoriteSource;
};

const toForegroundRun = (
  run: BackgroundListingRun,
  metadata: RunMetadata,
  searchMode: ScraperLatestSearchMode,
): ScraperLatestRun => ({
  key: run.key,
  sourceKind: metadata.sourceKind,
  scraper: run.scraper,
  module: metadata.module,
  query: run.query,
  favorite: metadata.favorite,
  favoriteSource: metadata.favoriteSource,
  status: run.status === "cancelled" ? "done" : run.status,
  results: run.results,
  pendingResults: run.pendingResults ?? [],
  pendingCandidates: run.pendingCandidates ?? [],
  quickConsecutiveSeenResultCount: run.quickConsecutiveSeenResultCount ?? 0,
  excludedByLanguageCount: run.excludedByLanguageCount ?? 0,
  excludedByBlacklistedTagCount: run.excludedByBlacklistedTagCount ?? 0,
  includedByLanguageCount: run.includedByLanguageCount ?? 0,
  loadedPages: run.loadedPages,
  checkedPages: run.checkedPages ?? 0,
  hasNextPage: run.hasNextPage,
  canContinue: run.hasNextPage,
  checkpoint: run.checkpoint,
  checkpointUsed: run.checkpointUsed === true,
  deepScanPhaseStarted: run.deepScanPhaseStarted === true
    || (searchMode === "deep" && run.checkpointUsed === true),
  deepScanCheckpointPending: run.deepScanCheckpointPending === true,
  deepSearch: searchMode === "deep",
  continuousScan: searchMode === "continuous",
  sourceExhausted: run.sourceExhausted,
  safetyLimitReached: run.safetyLimitReached,
  languageRejectLimitReached: run.languageRejectLimitReached,
  currentPageUrl: run.currentPageUrl,
  nextPageUrl: run.nextPageUrl,
  error: run.error,
});

const toInitialBackgroundRun = (
  run: ScraperLatestRun | BackgroundListingRun,
  preserveCurrentResults: boolean,
): BackgroundListingRun => ({
  key: run.key,
  name: "name" in run
    ? run.name
    : run.sourceKind === "tagFavorite"
      ? `${run.favorite?.name ?? "Tag favori"} · ${run.favoriteSource?.name ?? run.scraper.name}`
      : run.scraper.name,
  scraper: run.scraper,
  query: run.query,
  status: "waiting",
  results: preserveCurrentResults ? run.results : [],
  pendingResults: run.pendingResults ?? [],
  pendingCandidates: run.pendingCandidates ?? [],
  loadedPages: run.loadedPages,
  checkedPages: 0,
  hasNextPage: run.hasNextPage || ("canContinue" in run && run.canContinue),
  currentPageUrl: run.currentPageUrl,
  nextPageUrl: run.nextPageUrl,
  checkpoint: run.checkpoint,
  checkpointUsed: false,
  deepScanPhaseStarted: run.deepScanPhaseStarted === true
    || ("deepSearch" in run && run.deepSearch && run.checkpointUsed === true),
  deepScanCheckpointPending: run.deepScanCheckpointPending === true,
  sourceExhausted: run.sourceExhausted,
  quickConsecutiveSeenResultCount: run.quickConsecutiveSeenResultCount ?? 0,
  excludedByLanguageCount: preserveCurrentResults ? run.excludedByLanguageCount ?? 0 : 0,
  includedByLanguageCount: preserveCurrentResults ? run.includedByLanguageCount ?? 0 : 0,
  excludedByBlacklistedTagCount: preserveCurrentResults
    ? run.excludedByBlacklistedTagCount ?? 0
    : 0,
});

const buildStoredRunMetadata = (
  input: ListingBackgroundInput,
): Map<string, RunMetadata> => new Map(input.sources.map((source) => [
  source.id,
  {
    sourceKind: source.mode === "tag" ? "tagFavorite" : "scraper",
    module: source.mode === "tag"
      ? "tag"
      : source.mode === "search" ? "search" : "homepage",
  },
]));

export default function useScraperLatestRuns() {
  const [runs, setRuns] = useState<ScraperLatestRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runsRef = useRef<ScraperLatestRun[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const executionTokenRef = useRef(0);

  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const start = useCallback(async (
    scrapers: ScraperRecord[],
    resultLimitValue: number,
    _recordsById: Map<string, ScraperViewHistoryRecord>,
    includedLanguageCodeValues: string[] = [],
    options: StartOptions = {},
  ) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const executionToken = executionTokenRef.current + 1;
    executionTokenRef.current = executionToken;

    const storedContinuation = options.storedContinuation;
    const requestedSearchMode = storedContinuation?.input.searchMode ?? options.searchMode;
    const searchMode: ScraperLatestSearchMode = requestedSearchMode === "deep"
      ? "deep"
      : requestedSearchMode === "continuous"
        ? "continuous"
        : "quick";
    const resultLimit = normalizePositiveInteger(
      storedContinuation?.input.resultLimit ?? resultLimitValue,
      20,
    );
    const tagResultLimit = normalizePositiveInteger(
      storedContinuation?.input.tagResultLimit ?? options.tagResultLimit,
      resultLimit,
    );
    const requestedResultLimitMode = storedContinuation?.input.resultLimitMode
      ?? options.resultLimitMode;
    const resultLimitMode: ScraperLatestResultLimitMode = requestedResultLimitMode === "perSource"
      ? "perSource"
      : "total";
    const includedScrapers = getIncludedLatestScrapers(scrapers, options.includedScraperIds ?? []);
    const scrapersById = new Map(scrapers.map((scraper) => [scraper.id, scraper]));
    const tagSources = (options.tagFavorites ?? []).flatMap((favorite) => (
      favorite.sources.flatMap((favoriteSource) => {
        const scraper = scrapersById.get(favoriteSource.scraperId);
        return scraper ? [{ favorite, favoriteSource, scraper }] : [];
      })
    ));
    const sources = storedContinuation?.input.sources ?? buildLatestSourceListingSources(
      includedScrapers,
      options.tagFavorites ?? [],
      scrapersById,
      { searchMode, resultLimit, tagResultLimit },
    );
    const metadataByKey = storedContinuation
      ? buildStoredRunMetadata(storedContinuation.input)
      : new Map<string, RunMetadata>([
        ...includedScrapers.map((scraper): [string, RunMetadata] => [
          `scraper:${scraper.id}`,
          {
            sourceKind: "scraper",
            module: scraper.globalConfig.latest?.module === "search" ? "search" : "homepage",
          },
        ]),
        ...tagSources.map(({ favorite, favoriteSource }): [string, RunMetadata] => [
          `tag:${favorite.id}:${favoriteSource.scraperId}:${favoriteSource.tagUrl}`,
          { sourceKind: "tagFavorite", module: "tag", favorite, favoriteSource },
        ]),
      ]);

    if (!sources.length) {
      setRuns([]);
      setLoading(false);
      setMessage(null);
      setError("Aucune source n'est incluse dans le scan des nouveautés.");
      return;
    }

    const preserveCurrentResults = options.preserveCurrentResults === true;
    const shouldContinueCurrentRuns = Boolean(storedContinuation)
      || preserveCurrentResults
      || (searchMode === "quick" && options.continueFromQuickScan === true);
    const currentRunsByKey = new Map(runsRef.current.map((run) => [run.key, run]));
    const initialRuns = storedContinuation?.runs
      ? buildStoredScraperLatestContinuationRuns(
        storedContinuation.input,
        storedContinuation.runs,
      )
      : shouldContinueCurrentRuns
        ? sources.flatMap((source) => {
          const currentRun = currentRunsByKey.get(source.id);
          return currentRun ? [toInitialBackgroundRun(currentRun, preserveCurrentResults)] : [];
        })
        : undefined;
    const deepPageLimit = normalizePositiveInteger(
      options.deepPageLimit,
      DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT,
    );
    const continuousPageSafetyLimit = normalizePositiveInteger(
      options.continuousPageSafetyLimit,
      DEFAULT_SCRAPER_LATEST_CONTINUOUS_PAGE_SAFETY_LIMIT,
    );
    const concurrency = normalizePositiveInteger(options.concurrency, 2);
    const input = storedContinuation?.input ?? buildLatestSourceSearchInput(sources, {
      maxPages: searchMode === "quick"
        ? 1
        : searchMode === "continuous"
          ? continuousPageSafetyLimit
          : deepPageLimit,
      resultLimit,
      tagResultLimit,
      resultLimitMode,
      concurrency,
      includedLanguageCodes: includedLanguageCodeValues,
      scrapeDetailsWithCards: options.scrapeDetailsWithCards === true,
      excludeBlacklistedTagCards: options.excludeBlacklistedTagCards === true,
      tagBlacklistByScraper: options.tagBlacklistByScraper,
      searchMode,
      quickConsecutiveSeenStopThreshold: normalizeNonNegativeInteger(
        options.quickConsecutiveSeenStopThreshold,
        2,
      ),
      languageRejectLimit: normalizeNonNegativeInteger(options.languageRejectLimit, 60),
      performanceReportsEnabled: options.performanceReportsEnabled === true,
      selectedScraperIds: options.includedScraperIds,
      selectedTagFavoriteIds: options.tagFavorites?.map((favorite) => favorite.id),
    });

    if (!preserveCurrentResults) setRuns([]);
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const result = await runScraperLatestSearch(
        input,
        controller.signal,
        async (snapshot) => {
          if (executionToken !== executionTokenRef.current) return;
          setRuns(snapshot.runs.map((run) => toForegroundRun(
            run,
            metadataByKey.get(run.key) ?? { sourceKind: "scraper", module: "homepage" },
            searchMode,
          )));
        },
        {
          mode: "foreground",
          initialRuns,
          appendToExistingResults: preserveCurrentResults,
        },
      );
      if (executionToken !== executionTokenRef.current) return;
      setRuns(result.runs.map((run) => toForegroundRun(
        run,
        metadataByKey.get(run.key) ?? { sourceKind: "scraper", module: "homepage" },
        searchMode,
      )));
      setMessage(storedContinuation
        ? "La même recherche a été poursuivie dans cette vue."
        : searchMode === "continuous"
        ? `Toutes les nouveautés ont été recherchées avec un garde-fou de ${continuousPageSafetyLimit} pages par source.`
        : resultLimitMode === "total"
          ? `${resultLimit} résultat(s) demandés au total pour les scrappers et ${tagResultLimit} par tag favori.`
          : `${resultLimit} résultat(s) demandés par scrapper et ${tagResultLimit} par source de tag favori.`);
    } catch (runError) {
      if (controller.signal.aborted || executionToken !== executionTokenRef.current) return;
      setError(runError instanceof Error ? runError.message : "Échec de la recherche des nouveautés.");
    } finally {
      if (executionToken === executionTokenRef.current) setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    executionTokenRef.current += 1;
    setRuns([]);
    setLoading(false);
    setMessage(null);
    setError(null);
  }, []);

  const enabledRunCount = useMemo(() => runs.filter((run) => run.status !== "error").length, [runs]);

  return { runs, loading, message, error, enabledRunCount, start, reset };
}
