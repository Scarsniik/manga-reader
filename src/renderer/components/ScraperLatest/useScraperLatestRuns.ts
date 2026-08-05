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
import type { ListingBackgroundInput, ListingBackgroundSource } from "@/shared/backgroundSearch";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import type { BackgroundListingRun } from "@/renderer/backgroundSearch/types";
import { runScraperLatestSearch } from "@/renderer/backgroundSearch/backgroundSearchEngine";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";
import {
  splitIncludeFilterValues,
} from "@/renderer/components/IncludeFilterBar/includeFilterValues";

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

const buildScraperSource = (scraper: ScraperRecord): ListingBackgroundSource => {
  const module: "homepage" | "search" = scraper.globalConfig.latest?.module === "search"
    ? "search"
    : "homepage";
  return {
    id: `scraper:${scraper.id}`,
    name: scraper.name,
    scraper,
    query: module === "search" ? String(scraper.globalConfig.homeSearch?.query ?? "") : "",
    mode: module,
  };
};

const buildTagSource = (
  favorite: ScraperTagFavoriteRecord,
  favoriteSource: ScraperTagFavoriteSource,
  scraper: ScraperRecord,
): ListingBackgroundSource => ({
  id: `tag:${favorite.id}:${favoriteSource.scraperId}:${favoriteSource.tagUrl}`,
  name: `${favorite.name} · ${favoriteSource.name} · ${scraper.name}`,
  scraper,
  query: favoriteSource.tagUrl,
  favoriteId: favorite.id,
  mode: "tag",
  resultTag: {
    name: favoriteSource.name || favorite.name,
    url: favoriteSource.tagUrl,
  },
});

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
  run: ScraperLatestRun,
  preserveCurrentResults: boolean,
): BackgroundListingRun => ({
  key: run.key,
  name: run.sourceKind === "tagFavorite"
    ? `${run.favorite?.name ?? "Tag favori"} · ${run.favoriteSource?.name ?? run.scraper.name}`
    : run.scraper.name,
  scraper: run.scraper,
  query: run.query,
  status: "waiting",
  results: preserveCurrentResults ? run.results : [],
  pendingResults: run.pendingResults,
  pendingCandidates: run.pendingCandidates,
  loadedPages: run.loadedPages,
  checkedPages: 0,
  hasNextPage: run.hasNextPage || run.canContinue,
  currentPageUrl: run.currentPageUrl,
  nextPageUrl: run.nextPageUrl,
  checkpoint: run.checkpoint,
  checkpointUsed: false,
  sourceExhausted: run.sourceExhausted,
  quickConsecutiveSeenResultCount: run.quickConsecutiveSeenResultCount,
  excludedByLanguageCount: preserveCurrentResults ? run.excludedByLanguageCount : 0,
  includedByLanguageCount: preserveCurrentResults ? run.includedByLanguageCount : 0,
  excludedByBlacklistedTagCount: preserveCurrentResults ? run.excludedByBlacklistedTagCount : 0,
});

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

    const searchMode: ScraperLatestSearchMode = options.searchMode === "deep"
      ? "deep"
      : options.searchMode === "continuous"
        ? "continuous"
        : "quick";
    const resultLimit = normalizePositiveInteger(resultLimitValue, 20);
    const tagResultLimit = normalizePositiveInteger(options.tagResultLimit, resultLimit);
    const resultLimitMode: ScraperLatestResultLimitMode = options.resultLimitMode === "perSource"
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
    const sources: ListingBackgroundSource[] = [
      ...includedScrapers.map(buildScraperSource),
      ...tagSources.map(({ favorite, favoriteSource, scraper }) => (
        buildTagSource(favorite, favoriteSource, scraper)
      )),
    ];
    const metadataByKey = new Map<string, RunMetadata>([
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
    const shouldContinueCurrentRuns = preserveCurrentResults
      || (searchMode === "quick" && options.continueFromQuickScan === true);
    const currentRunsByKey = new Map(runsRef.current.map((run) => [run.key, run]));
    const initialRuns = shouldContinueCurrentRuns
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
    const input: ListingBackgroundInput = {
      sources: sources.map((source) => ({
        ...source,
        resultLimit: searchMode === "continuous"
          ? 0
          : source.mode === "tag"
            ? tagResultLimit
            : resultLimit,
      })),
      maxPages: searchMode === "quick"
        ? 1
        : searchMode === "continuous"
          ? continuousPageSafetyLimit
          : deepPageLimit,
      resultLimit: searchMode === "continuous" ? 0 : resultLimit,
      tagResultLimit: searchMode === "continuous" ? 0 : tagResultLimit,
      resultLimitMode,
      paceMode: "careful",
      concurrency,
      excludeBlacklistedTagCards: options.excludeBlacklistedTagCards === true,
      tagBlacklistByScraper: options.tagBlacklistByScraper,
      includedLanguageCodes: includedLanguageCodeValues,
      scrapeDetailsWithCards: options.scrapeDetailsWithCards === true,
      searchMode,
      quickConsecutiveSeenStopThreshold: normalizeNonNegativeInteger(
        options.quickConsecutiveSeenStopThreshold,
        2,
      ),
      languageRejectLimit: normalizeNonNegativeInteger(options.languageRejectLimit, 60),
      performanceReportsEnabled: options.performanceReportsEnabled === true,
    };

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
      setMessage(searchMode === "continuous"
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
