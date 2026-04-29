import type { ScraperRecord, ScraperSearchResultItem } from "@/shared/scraper";
import type {
  MultiSearchDepthMode,
  MultiSearchPaceMode,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
  MultiSearchTermRun,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";

const STORAGE_KEY = "manga-helper.multi-search.last-state.v1";

export type MultiSearchPersistentFormState = {
  query: string;
  selectedScraperIds: string[];
  selectedLanguageCodes: string[];
  selectedContentTypes: string[];
  depthMode: MultiSearchDepthMode;
  advancedPages: number;
  paceMode: MultiSearchPaceMode;
  viewMode: MultiSearchViewMode;
};

type StoredSourceResult = {
  scraperId: string;
  result: ScraperSearchResultItem;
  searchTerm?: string;
  pageIndex: number;
  sourceLanguageCodes: string[];
  detectedLanguageCodes: string[];
  tentativeAuthorNames?: string[];
  contentTypes: string[];
  canOpenDetails: boolean;
};

type StoredTermRun = {
  term: string;
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
};

type StoredScraperRun = {
  scraperId: string;
  status: MultiSearchScraperRun["status"];
  results: StoredSourceResult[];
  searchTerms?: StoredTermRun[];
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  error?: string;
};

type StoredMultiSearchState = MultiSearchPersistentFormState & {
  version: 1;
  updatedAt: string;
  runs: StoredScraperRun[];
};

export type RestoredMultiSearchState = MultiSearchPersistentFormState & {
  runs: MultiSearchScraperRun[];
};

const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
);

const isDepthMode = (value: unknown): value is MultiSearchDepthMode => (
  value === "quick" || value === "extended" || value === "advanced"
);

const isPaceMode = (value: unknown): value is MultiSearchPaceMode => (
  value === "fast" || value === "careful"
);

const isViewMode = (value: unknown): value is MultiSearchViewMode => (
  value === "merged" || value === "byScraper"
);

const serializeSource = (source: MultiSearchSourceResult): StoredSourceResult => ({
  scraperId: source.scraper.id,
  result: source.result,
  searchTerm: source.searchTerm,
  pageIndex: source.pageIndex,
  sourceLanguageCodes: source.sourceLanguageCodes,
  detectedLanguageCodes: source.detectedLanguageCodes,
  tentativeAuthorNames: source.tentativeAuthorNames,
  contentTypes: source.contentTypes,
  canOpenDetails: source.canOpenDetails,
});

const serializeTermRun = (termRun: MultiSearchTermRun): StoredTermRun => ({
  term: termRun.term,
  loadedPages: termRun.loadedPages,
  hasNextPage: termRun.hasNextPage,
  currentPageUrl: termRun.currentPageUrl,
  nextPageUrl: termRun.nextPageUrl,
});

const serializeRun = (run: MultiSearchScraperRun): StoredScraperRun => ({
  scraperId: run.scraper.id,
  status: run.status,
  results: run.results.map(serializeSource),
  searchTerms: run.searchTerms.map(serializeTermRun),
  loadedPages: run.loadedPages,
  hasNextPage: run.hasNextPage,
  currentPageUrl: run.currentPageUrl,
  nextPageUrl: run.nextPageUrl,
  error: run.error,
});

const restoreSource = (
  source: StoredSourceResult,
  scraperById: Map<string, ScraperRecord>,
): MultiSearchSourceResult | null => {
  const scraper = scraperById.get(source.scraperId);
  if (!scraper) {
    return null;
  }

  return {
    scraper,
    result: source.result,
    searchTerm: typeof source.searchTerm === "string" ? source.searchTerm : "",
    pageIndex: source.pageIndex,
    sourceLanguageCodes: isStringArray(source.sourceLanguageCodes) ? source.sourceLanguageCodes : [],
    detectedLanguageCodes: isStringArray(source.detectedLanguageCodes) ? source.detectedLanguageCodes : [],
    tentativeAuthorNames: isStringArray(source.tentativeAuthorNames) ? source.tentativeAuthorNames : [],
    contentTypes: isStringArray(source.contentTypes) ? source.contentTypes : [],
    canOpenDetails: Boolean(source.canOpenDetails),
  };
};

const restoreTermRun = (termRun: StoredTermRun): MultiSearchTermRun | null => {
  if (typeof termRun.term !== "string" || !termRun.term.trim()) {
    return null;
  }

  return {
    term: termRun.term,
    loadedPages: Number.isFinite(termRun.loadedPages) ? Math.max(0, termRun.loadedPages) : 0,
    hasNextPage: Boolean(termRun.hasNextPage),
    currentPageUrl: typeof termRun.currentPageUrl === "string" ? termRun.currentPageUrl : undefined,
    nextPageUrl: typeof termRun.nextPageUrl === "string" ? termRun.nextPageUrl : undefined,
  };
};

const restoreRun = (
  run: StoredScraperRun,
  scraperById: Map<string, ScraperRecord>,
): MultiSearchScraperRun | null => {
  const scraper = scraperById.get(run.scraperId);
  if (!scraper) {
    return null;
  }

  return {
    scraper,
    status: run.status,
    results: Array.isArray(run.results)
      ? run.results
        .map((source) => restoreSource(source, scraperById))
        .filter((source): source is MultiSearchSourceResult => Boolean(source))
      : [],
    searchTerms: Array.isArray(run.searchTerms)
      ? run.searchTerms
        .map(restoreTermRun)
        .filter((termRun): termRun is MultiSearchTermRun => Boolean(termRun))
      : [],
    loadedPages: Number.isFinite(run.loadedPages) ? Math.max(0, run.loadedPages) : 0,
    hasNextPage: Boolean(run.hasNextPage),
    currentPageUrl: typeof run.currentPageUrl === "string" ? run.currentPageUrl : undefined,
    nextPageUrl: typeof run.nextPageUrl === "string" ? run.nextPageUrl : undefined,
    error: typeof run.error === "string" ? run.error : undefined,
  };
};

export const saveMultiSearchState = (
  formState: MultiSearchPersistentFormState,
  runs: MultiSearchScraperRun[],
): void => {
  if (typeof window === "undefined") {
    return;
  }

  const state: StoredMultiSearchState = {
    ...formState,
    version: 1,
    updatedAt: new Date().toISOString(),
    runs: runs.map(serializeRun),
  };

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const readMultiSearchState = (
  scrapers: ScraperRecord[],
): RestoredMultiSearchState | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawState = window.sessionStorage.getItem(STORAGE_KEY);
  if (!rawState) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawState) as StoredMultiSearchState;
    if (parsed.version !== 1) {
      return null;
    }

    const scraperById = new Map(scrapers.map((scraper) => [scraper.id, scraper]));

    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      selectedScraperIds: isStringArray(parsed.selectedScraperIds) ? parsed.selectedScraperIds : [],
      selectedLanguageCodes: isStringArray(parsed.selectedLanguageCodes) ? parsed.selectedLanguageCodes : [],
      selectedContentTypes: isStringArray(parsed.selectedContentTypes) ? parsed.selectedContentTypes : [],
      depthMode: isDepthMode(parsed.depthMode) ? parsed.depthMode : "quick",
      advancedPages: Number.isFinite(parsed.advancedPages) ? parsed.advancedPages : 3,
      paceMode: isPaceMode(parsed.paceMode) ? parsed.paceMode : "fast",
      viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : "merged",
      runs: Array.isArray(parsed.runs)
        ? parsed.runs
          .map((run) => restoreRun(run, scraperById))
          .filter((run): run is MultiSearchScraperRun => Boolean(run))
        : [],
    };
  } catch {
    return null;
  }
};
