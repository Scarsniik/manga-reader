import type { ScraperRecord, ScraperSearchResultItem } from "@/shared/scraper";

export type MultiSearchDepthMode = "quick" | "extended" | "advanced";
export type MultiSearchPaceMode = "fast" | "careful";
export type MultiSearchViewMode = "merged" | "byScraper";

export type MultiSearchScraperStatus =
  | "idle"
  | "waiting"
  | "loading"
  | "success"
  | "done"
  | "error";

export type MultiSearchSourceResult = {
  scraper: ScraperRecord;
  result: ScraperSearchResultItem;
  searchTerm: string;
  pageIndex: number;
  sourceLanguageCodes: string[];
  detectedLanguageCodes: string[];
  tentativeAuthorNames: string[];
  contentTypes: string[];
  canOpenDetails: boolean;
};

export type MultiSearchTermRun = {
  term: string;
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
};

export type MultiSearchScraperRun = {
  scraper: ScraperRecord;
  status: MultiSearchScraperStatus;
  results: MultiSearchSourceResult[];
  searchTerms: MultiSearchTermRun[];
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  error?: string;
};

export type MultiSearchMergedResult = {
  id: string;
  title: string;
  coverUrl?: string;
  summary?: string;
  pageCount?: string;
  sources: MultiSearchSourceResult[];
  sourceLanguageCodes: string[];
  tentativeAuthorNames: string[];
  contentTypes: string[];
};
