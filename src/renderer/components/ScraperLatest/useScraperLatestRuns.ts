import { useCallback, useMemo, useRef, useState } from "react";
import {
  buildScraperViewHistoryCardId,
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
import { isScraperListingPaginationEndError } from "@/renderer/utils/scraperRuntime";

export type ScraperLatestRunStatus = "waiting" | "loading" | "done" | "error";
export type ScraperLatestRunModule = "homepage" | "search";

export type ScraperLatestRun = {
  key: string;
  scraper: ScraperRecord;
  module: ScraperLatestRunModule;
  status: ScraperLatestRunStatus;
  results: MultiSearchSourceResult[];
  excludedByLanguageCount: number;
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  error?: string;
};

const getEnabledLatestScrapers = (scrapers: ScraperRecord[]): ScraperRecord[] => (
  scrapers.filter((scraper) => scraper.globalConfig.latest?.enabled)
);

const buildRun = (scraper: ScraperRecord): ScraperLatestRun => ({
  key: scraper.id,
  scraper,
  module: scraper.globalConfig.latest?.module === "search" ? "search" : "homepage",
  status: "waiting",
  results: [],
  excludedByLanguageCount: 0,
  loadedPages: 0,
  hasNextPage: true,
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

const fetchLatestPage = async (
  run: ScraperLatestRun,
  pageIndex: number,
  paceConfig: PaceConfig,
) => {
  if (run.module === "search") {
    const searchConfig = getSearchConfig(run.scraper);
    const query = run.scraper.globalConfig.homeSearch?.query ?? "";
    const page = await fetchSearchPageWithRetry(
      run.scraper,
      searchConfig,
      query,
      pageIndex,
      run.nextPageUrl,
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
    run.nextPageUrl,
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

  const loadRun = useCallback(async (
    initialRun: ScraperLatestRun,
    resultLimit: number,
    recordsById: Map<string, ScraperViewHistoryRecord>,
    includedLanguageCodes: string[],
    token: number,
  ): Promise<ScraperLatestRun> => {
    let run = initialRun;
    const loadedSourceKeys = new Set<string>();

    while (run.hasNextPage && run.results.length < resultLimit && token === tokenRef.current) {
      const pageIndex = run.loadedPages;
      patchRun(token, run.key, (currentRun) => ({
        ...currentRun,
        status: "loading",
        error: undefined,
      }));

      try {
        const latestPage = await fetchLatestPage(run, pageIndex, paceConfigRef.current);
        const pageResults = await enrichSourceResultsWithJapaneseRomanization(
          buildSourceResults(run.scraper, latestPage.page, pageIndex, latestPage.searchTerm),
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
        const unseenResults = includedPageResults.filter((source) => isUnseenSource(source, recordsById));
        const nextResults = [...run.results, ...unseenResults].slice(0, resultLimit);
        const hasOnlyDuplicateResults = pageResults.length > 0 && newPageResults.length === 0;

        run = {
          ...run,
          status: "done",
          results: nextResults,
          excludedByLanguageCount: run.excludedByLanguageCount + newPageResults.length - includedPageResults.length,
          loadedPages: pageIndex + 1,
          hasNextPage: !hasOnlyDuplicateResults && latestPage.hasNextPage && nextResults.length < resultLimit,
          currentPageUrl: latestPage.page.currentPageUrl,
          nextPageUrl: latestPage.page.nextPageUrl,
          error: undefined,
        };

        patchRun(token, run.key, () => run);
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
  }, [patchRun]);

  const start = useCallback(async (
    scrapers: ScraperRecord[],
    resultLimitValue: number,
    recordsById: Map<string, ScraperViewHistoryRecord>,
    includedLanguageCodeValues: string[] = [],
  ) => {
    const enabledScrapers = getEnabledLatestScrapers(scrapers);
    const initialRuns = enabledScrapers.map(buildRun);
    const resultLimit = normalizeResultLimit(resultLimitValue);
    const includedLanguageCodes = normalizeLanguageCodes(includedLanguageCodeValues);
    const token = tokenRef.current + 1;
    tokenRef.current = token;

    setRuns(initialRuns);
    setMessage(null);
    setError(initialRuns.length ? null : "Aucun scrapper n'est configure pour les nouveautes.");
    setLoading(Boolean(initialRuns.length));

    if (!initialRuns.length) {
      return;
    }

    try {
      await runWithConcurrency(
        initialRuns.map((run) => async () => {
          await loadRun(run, resultLimit, recordsById, includedLanguageCodes, token);
        }),
        paceConfigRef.current.concurrency,
      );

      if (token === tokenRef.current) {
        setMessage(
          includedLanguageCodes.length
            ? `${resultLimit} resultat(s) non vu(s) recherches par scrapper dans les langues incluses.`
            : `${resultLimit} resultat(s) non vu(s) recherches par scrapper.`,
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
