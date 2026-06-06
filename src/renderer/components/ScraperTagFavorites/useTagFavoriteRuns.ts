import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ScraperRecord,
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
} from "@/shared/scraper";
import {
  buildSourceResults,
  fetchTagPageWithRetry,
  getPaceConfig,
  getTagConfig,
  resolveHasNextTagPage,
  runWithConcurrency,
  type PaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { enrichSourceResultsWithJapaneseRomanization } from "@/renderer/components/MultiSearch/multiSearchSourceRomanization";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { isScraperListingPaginationEndError } from "@/renderer/utils/scraperRuntime";

export type TagFavoriteSourceRunStatus = "waiting" | "loading" | "done" | "error";

export type TagFavoriteSourceRun = {
  key: string;
  favoriteSource: ScraperTagFavoriteSource;
  scraper: ScraperRecord;
  status: TagFavoriteSourceRunStatus;
  results: MultiSearchSourceResult[];
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  error?: string;
};

type TagFavoriteRunsOptions = {
  scrapeDetailsWithCards?: boolean;
};

const buildSourceKey = (source: ScraperTagFavoriteSource): string => (
  `${source.scraperId}::${source.tagUrl}`
);

const buildInitialRun = (
  source: ScraperTagFavoriteSource,
  scraper: ScraperRecord,
): TagFavoriteSourceRun => ({
  key: buildSourceKey(source),
  favoriteSource: source,
  scraper,
  status: "waiting",
  results: [],
  loadedPages: 0,
  hasNextPage: true,
});

const normalizeResultUrl = (source: MultiSearchSourceResult): string => {
  const value = source.result.detailUrl?.trim();
  if (!value) {
    return "";
  }

  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
};

const keepNewSourceResults = (
  existingResults: MultiSearchSourceResult[],
  pageResults: MultiSearchSourceResult[],
): MultiSearchSourceResult[] => {
  const seenUrls = new Set(existingResults.map(normalizeResultUrl).filter(Boolean));

  return pageResults.filter((source) => {
    const url = normalizeResultUrl(source);
    if (!url) {
      return true;
    }

    if (seenUrls.has(url)) {
      return false;
    }

    seenUrls.add(url);
    return true;
  });
};

export default function useTagFavoriteRuns(
  favorite: ScraperTagFavoriteRecord | null,
  scrapersById: Map<string, ScraperRecord>,
  options: TagFavoriteRunsOptions = {},
) {
  const scrapeDetailsWithCards = options.scrapeDetailsWithCards === true;
  const [runs, setRuns] = useState<TagFavoriteSourceRun[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  const paceConfigRef = useRef<PaceConfig>(getPaceConfig("careful"));
  const runsRef = useRef<TagFavoriteSourceRun[]>([]);
  const visibleSources = useMemo(
    () => runs.flatMap((run) => run.results.filter((result) => result.pageIndex === pageIndex)),
    [pageIndex, runs],
  );
  const canGoPrevious = pageIndex > 0;
  const canGoNext = useMemo(
    () => runs.some((run) => run.hasNextPage && run.status !== "loading"),
    [runs],
  );

  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  const patchRun = useCallback((
    token: number,
    key: string,
    updater: (run: TagFavoriteSourceRun) => TagFavoriteSourceRun,
  ) => {
    if (token !== tokenRef.current) {
      return;
    }

    setRuns((currentRuns) => currentRuns.map((run) => (
      run.key === key ? updater(run) : run
    )));
  }, []);

  const loadNextPageForRun = useCallback(async (
    run: TagFavoriteSourceRun,
    token: number,
    updateState = true,
  ): Promise<TagFavoriteSourceRun | null> => {
    if (!run.hasNextPage || token !== tokenRef.current) {
      return run;
    }

    if (updateState) {
      patchRun(token, run.key, (currentRun) => ({
        ...currentRun,
        status: "loading",
        error: undefined,
      }));
    }

    try {
      const tagConfig = getTagConfig(run.scraper);
      const nextPageIndex = run.loadedPages;
      const page = await fetchTagPageWithRetry(
        run.scraper,
        tagConfig,
        run.favoriteSource.tagUrl,
        nextPageIndex,
        run.nextPageUrl,
        paceConfigRef.current,
        {
          scrapeDetailsWithCards,
        },
      );
      const pageResults = await enrichSourceResultsWithJapaneseRomanization(
        buildSourceResults(run.scraper, page, nextPageIndex, run.favoriteSource.name),
      );
      const newPageResults = keepNewSourceResults(run.results, pageResults);
      const hasOnlyDuplicateUrls = pageResults.length > 0 && newPageResults.length === 0;
      const nextRun: TagFavoriteSourceRun = {
        ...run,
        status: "done",
        results: [...run.results, ...newPageResults],
        loadedPages: nextPageIndex + 1,
        hasNextPage: !hasOnlyDuplicateUrls && resolveHasNextTagPage(tagConfig, page),
        currentPageUrl: page.currentPageUrl,
        nextPageUrl: page.nextPageUrl,
        error: undefined,
      };

      if (updateState) {
        patchRun(token, run.key, () => nextRun);
      }
      return nextRun;
    } catch (loadError) {
      const isPaginationEnd = isScraperListingPaginationEndError(loadError);
      const failedRun: TagFavoriteSourceRun = {
        ...run,
        status: run.results.length || isPaginationEnd ? "done" : "error",
        hasNextPage: false,
        error: isPaginationEnd
          ? undefined
          : loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.",
      };

      if (updateState) {
        patchRun(token, run.key, () => failedRun);
      }
      return failedRun;
    }
  }, [patchRun, scrapeDetailsWithCards]);

  const loadPageForRun = useCallback(async (
    run: TagFavoriteSourceRun,
    targetPageIndex: number,
    token: number,
    updateState = true,
  ): Promise<TagFavoriteSourceRun | null> => {
    let currentRun: TagFavoriteSourceRun | null = run;

    while (
      currentRun
      && currentRun.loadedPages <= targetPageIndex
      && currentRun.hasNextPage
      && token === tokenRef.current
    ) {
      currentRun = await loadNextPageForRun(currentRun, token, updateState);
    }

    return currentRun;
  }, [loadNextPageForRun]);

  const loadPageForRuns = useCallback(async (
    sourceRuns: TagFavoriteSourceRun[],
    token: number,
    targetPageIndex: number,
    updateState = true,
  ): Promise<TagFavoriteSourceRun[]> => {
    const loadedRuns: Array<TagFavoriteSourceRun | null> = Array.from({ length: sourceRuns.length }, () => null);

    await runWithConcurrency(
      sourceRuns.map((run, index) => async () => {
        loadedRuns[index] = await loadPageForRun(run, targetPageIndex, token, updateState);
      }),
      paceConfigRef.current.concurrency,
    );

    return loadedRuns.filter((run): run is TagFavoriteSourceRun => Boolean(run));
  }, [loadPageForRun]);

  const loadPage = useCallback(async (targetPageIndex: number, forceReset = false) => {
    if (!favorite) {
      setRuns([]);
      setPageIndex(0);
      setMessage(null);
      setError(null);
      return;
    }

    const normalizedPageIndex = Math.max(0, Math.floor(targetPageIndex));
    const currentRuns = runsRef.current;
    const baseRuns = !forceReset && currentRuns.length
      ? currentRuns
      : favorite.sources.reduce<TagFavoriteSourceRun[]>((nextRuns, source) => {
        const scraper = scrapersById.get(source.scraperId);
        if (scraper) {
          nextRuns.push(buildInitialRun(source, scraper));
        }
        return nextRuns;
      }, []);
    const token = tokenRef.current + 1;
    tokenRef.current = token;

    setRuns(baseRuns);
    setPageIndex(normalizedPageIndex);
    setLoading(Boolean(baseRuns.length));
    setMessage(null);
    setError(baseRuns.length ? null : "Aucun scrapper disponible pour ce tag favori.");

    try {
      const loadedRuns = await loadPageForRuns(baseRuns, token, normalizedPageIndex);
      if (token !== tokenRef.current) {
        return;
      }

      setRuns(loadedRuns);
      setMessage(`Page ${normalizedPageIndex + 1} chargee pour les sources disponibles.`);
    } catch (loadError) {
      if (token === tokenRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.");
      }
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
      }
    }
  }, [favorite, loadPageForRuns, scrapersById]);

  const start = useCallback(async () => {
    await loadPage(0, true);
  }, [loadPage]);

  const goToNextPage = useCallback(async () => {
    if (!canGoNext || loading) {
      return;
    }

    await loadPage(pageIndex + 1);
  }, [canGoNext, loadPage, loading, pageIndex]);

  const goToPreviousPage = useCallback(async () => {
    if (!canGoPrevious || loading) {
      return;
    }

    setPageIndex((currentPageIndex) => Math.max(0, currentPageIndex - 1));
    setMessage(`Retour a la page ${pageIndex}.`);
  }, [canGoPrevious, loading, pageIndex]);

  return {
    runs,
    visibleSources,
    pageIndex,
    loading,
    message,
    error,
    canGoPrevious,
    canGoNext,
    start,
    reload: () => loadPage(pageIndex),
    goToPreviousPage,
    goToNextPage,
  };
}
