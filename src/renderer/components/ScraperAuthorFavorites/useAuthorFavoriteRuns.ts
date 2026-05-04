import { useCallback, useMemo, useRef, useState } from "react";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
  ScraperRecord,
} from "@/shared/scraper";
import {
  buildSourceResults,
  fetchAuthorPageWithRetry,
  getAuthorConfig,
  getPaceConfig,
  resolveHasNextAuthorPage,
  runWithConcurrency,
  type PaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";

export type AuthorFavoriteSourceRunStatus = "waiting" | "loading" | "done" | "error";

export type AuthorFavoriteSourceRun = {
  key: string;
  favoriteSource: ScraperAuthorFavoriteSource;
  scraper: ScraperRecord;
  status: AuthorFavoriteSourceRunStatus;
  results: MultiSearchSourceResult[];
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  error?: string;
};

const buildSourceKey = (source: ScraperAuthorFavoriteSource): string => (
  `${source.scraperId}::${source.authorUrl}`
);

const buildInitialRun = (
  source: ScraperAuthorFavoriteSource,
  scraper: ScraperRecord,
): AuthorFavoriteSourceRun => ({
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

export default function useAuthorFavoriteRuns(
  favorite: ScraperAuthorFavoriteRecord | null,
  scrapersById: Map<string, ScraperRecord>,
  initialPageCount: number,
) {
  const [runs, setRuns] = useState<AuthorFavoriteSourceRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  const paceConfigRef = useRef<PaceConfig>(getPaceConfig("careful"));
  const canLoadMore = useMemo(
    () => runs.some((run) => run.hasNextPage && run.status !== "loading"),
    [runs],
  );

  const patchRun = useCallback((
    token: number,
    key: string,
    updater: (run: AuthorFavoriteSourceRun) => AuthorFavoriteSourceRun,
  ) => {
    if (token !== tokenRef.current) {
      return;
    }

    setRuns((currentRuns) => currentRuns.map((run) => (
      run.key === key ? updater(run) : run
    )));
  }, []);

  const loadNextPageForRun = useCallback(async (
    run: AuthorFavoriteSourceRun,
    token: number,
  ): Promise<AuthorFavoriteSourceRun | null> => {
    if (!run.hasNextPage || token !== tokenRef.current) {
      return run;
    }

    patchRun(token, run.key, (currentRun) => ({
      ...currentRun,
      status: "loading",
      error: undefined,
    }));

    try {
      const authorConfig = getAuthorConfig(run.scraper);
      const pageIndex = run.loadedPages;
      const page = await fetchAuthorPageWithRetry(
        run.scraper,
        authorConfig,
        run.favoriteSource.authorUrl,
        pageIndex,
        run.nextPageUrl,
        paceConfigRef.current,
        run.favoriteSource.templateContext ?? null,
      );
      const pageResults = buildSourceResults(run.scraper, page, pageIndex, run.favoriteSource.name);
      const newPageResults = keepNewSourceResults(run.results, pageResults);
      const hasOnlyDuplicateUrls = pageResults.length > 0 && newPageResults.length === 0;
      const nextRun: AuthorFavoriteSourceRun = {
        ...run,
        status: "done",
        results: [...run.results, ...newPageResults],
        loadedPages: pageIndex + 1,
        hasNextPage: !hasOnlyDuplicateUrls && resolveHasNextAuthorPage(authorConfig, page),
        currentPageUrl: page.currentPageUrl,
        nextPageUrl: page.nextPageUrl,
        error: undefined,
      };

      patchRun(token, run.key, () => nextRun);
      return nextRun;
    } catch (loadError) {
      const failedRun: AuthorFavoriteSourceRun = {
        ...run,
        status: run.results.length ? "done" : "error",
        hasNextPage: false,
        error: loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.",
      };

      patchRun(token, run.key, () => failedRun);
      return failedRun;
    }
  }, [patchRun]);

  const loadPagesForRun = useCallback(async (
    run: AuthorFavoriteSourceRun,
    pageCount: number,
    token: number,
  ): Promise<AuthorFavoriteSourceRun | null> => {
    let currentRun: AuthorFavoriteSourceRun | null = run;

    for (let pageOffset = 0; pageOffset < pageCount; pageOffset += 1) {
      if (!currentRun || !currentRun.hasNextPage || token !== tokenRef.current) {
        return currentRun;
      }

      currentRun = await loadNextPageForRun(currentRun, token);
    }

    return currentRun;
  }, [loadNextPageForRun]);

  const start = useCallback(async () => {
    if (!favorite) {
      setRuns([]);
      setMessage(null);
      setError(null);
      return;
    }

    const initialRuns = favorite.sources.reduce<AuthorFavoriteSourceRun[]>((nextRuns, source) => {
      const scraper = scrapersById.get(source.scraperId);
      if (scraper) {
        nextRuns.push(buildInitialRun(source, scraper));
      }
      return nextRuns;
    }, []);

    const token = tokenRef.current + 1;
    tokenRef.current = token;
    setRuns(initialRuns);
    const pageLimit = Math.max(1, Math.floor(initialPageCount));

    setLoading(Boolean(initialRuns.length));
    setMessage(null);
    setError(initialRuns.length ? null : "Aucun scrapper disponible pour cet auteur favori.");

    try {
      await runWithConcurrency(
        initialRuns.map((run) => async () => {
          await loadPagesForRun(run, pageLimit, token);
        }),
        paceConfigRef.current.concurrency,
      );

      if (token === tokenRef.current) {
        setMessage(`${pageLimit} page(s) chargee(s) pour les sources disponibles.`);
      }
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
      }
    }
  }, [favorite, initialPageCount, loadPagesForRun, scrapersById]);

  const loadMoreForAll = useCallback(async () => {
    const loadableRuns = runs.filter((run) => run.hasNextPage && run.status !== "loading");
    if (!loadableRuns.length) {
      return;
    }

    const token = tokenRef.current;
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      await runWithConcurrency(
        loadableRuns.map((run) => async () => {
          await loadNextPageForRun(run, token);
        }),
        paceConfigRef.current.concurrency,
      );

      if (token === tokenRef.current) {
        setMessage("Pages supplementaires chargees.");
      }
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
      }
    }
  }, [loadNextPageForRun, runs]);

  const loadMoreForRun = useCallback(async (key: string) => {
    const run = runs.find((candidate) => candidate.key === key);
    if (!run || !run.hasNextPage || run.status === "loading") {
      return;
    }

    const token = tokenRef.current;
    setMessage(null);
    setError(null);
    await loadNextPageForRun(run, token);
  }, [loadNextPageForRun, runs]);

  return {
    runs,
    loading,
    message,
    error,
    canLoadMore,
    start,
    loadMoreForAll,
    loadMoreForRun,
  };
}
