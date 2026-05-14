import type { ScraperRecord } from "@/shared/scraper";
import type {
  MultiSearchScraperRun,
  MultiSearchSourceResult,
  MultiSearchTermRun,
} from "@/renderer/components/MultiSearch/types";

const buildInitialTermRun = (term: string): MultiSearchTermRun => ({
  term,
  loadedPages: 0,
  hasNextPage: true,
});

export const summarizeTermRuns = (
  searchTerms: MultiSearchTermRun[],
): Pick<MultiSearchScraperRun, "loadedPages" | "hasNextPage" | "currentPageUrl" | "nextPageUrl"> => {
  const activeNextTerm = searchTerms.find((termRun) => termRun.hasNextPage);
  const lastLoadedTerm = [...searchTerms].reverse().find((termRun) => termRun.currentPageUrl);

  return {
    loadedPages: searchTerms.reduce((total, termRun) => total + termRun.loadedPages, 0),
    hasNextPage: Boolean(activeNextTerm),
    currentPageUrl: lastLoadedTerm?.currentPageUrl,
    nextPageUrl: activeNextTerm?.nextPageUrl,
  };
};

export const buildInitialRun = (
  scraper: ScraperRecord,
  searchTerms: string[],
): MultiSearchScraperRun => ({
  scraper,
  status: "waiting",
  results: [],
  searchTerms: searchTerms.map(buildInitialTermRun),
  loadedPages: 0,
  hasNextPage: searchTerms.length > 0,
});

export const isMultiSearchRunActive = (run: MultiSearchScraperRun): boolean => (
  run.status === "waiting" || run.status === "loading"
);

export const cancelMultiSearchRun = (run: MultiSearchScraperRun): MultiSearchScraperRun => ({
  ...run,
  status: "cancelled",
  searchTerms: run.searchTerms.map((termRun) => ({
    ...termRun,
    hasNextPage: false,
    nextPageUrl: undefined,
  })),
  hasNextPage: false,
  nextPageUrl: undefined,
  error: undefined,
});

export const ensureRunSearchTerms = (
  run: MultiSearchScraperRun,
  fallbackTerms: string[],
): MultiSearchTermRun[] => {
  if (run.searchTerms.length) {
    return run.searchTerms;
  }

  return fallbackTerms.map((term, index) => ({
    term,
    loadedPages: index === 0 ? run.loadedPages : 0,
    hasNextPage: index === 0 ? run.hasNextPage : false,
    currentPageUrl: index === 0 ? run.currentPageUrl : undefined,
    nextPageUrl: index === 0 ? run.nextPageUrl : undefined,
  }));
};

export const upsertTermRun = (
  searchTerms: MultiSearchTermRun[],
  nextTermRun: MultiSearchTermRun,
): MultiSearchTermRun[] => {
  const existingIndex = searchTerms.findIndex((termRun) => termRun.term === nextTermRun.term);
  if (existingIndex === -1) {
    return [...searchTerms, nextTermRun];
  }

  return searchTerms.map((termRun, index) => (
    index === existingIndex ? nextTermRun : termRun
  ));
};

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

export const keepNewSourceResults = (
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
