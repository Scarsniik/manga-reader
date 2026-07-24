import type { MultiSearchScraperRun, MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import type { ScraperRecord } from "@/shared/scraper";
import type {
  MangaCorrespondenceRequest,
  MangaCorrespondenceTraceStep,
} from "@/shared/backgroundSearch";

export type BackgroundListingRun = {
  key: string;
  name: string;
  scraper: ScraperRecord;
  query: string;
  status: "waiting" | "loading" | "done" | "error" | "cancelled";
  results: MultiSearchSourceResult[];
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  excludedByBlacklistedTagCount?: number;
  error?: string;
};

export type MultiSearchBackgroundResult = {
  runs: MultiSearchScraperRun[];
};

export type ListingBackgroundResult = {
  runs: BackgroundListingRun[];
};

export type MangaCorrespondenceMatch = {
  key: string;
  source: MultiSearchSourceResult;
  analyzedTitle: string;
  alternativeTitles: string[];
  authors: string[];
  chapter?: string;
  matchedTerm: string;
  discoveredByStepIds: string[];
};

export type MangaCorrespondenceBackgroundResult = {
  request: MangaCorrespondenceRequest;
  matches: MangaCorrespondenceMatch[];
  trace: MangaCorrespondenceTraceStep[];
  searchedTitles: string[];
  searchedAuthors: string[];
};

export type AuthorCorrespondenceMatch = {
  key: string;
  scraperId: string;
  scraperName: string;
  authorName: string;
  authorUrl: string;
  templateContext?: Record<string, string | undefined> | null;
  matchedName: string;
  discoveryMethods: Array<"reference" | "search" | "authorModule">;
  previewSources: MultiSearchSourceResult[];
};

export type AuthorCorrespondenceBackgroundResult = {
  referenceName: string;
  matches: AuthorCorrespondenceMatch[];
  searchedNames: string[];
};

export type BackgroundSearchExecutionResult =
  | MultiSearchBackgroundResult
  | ListingBackgroundResult
  | AuthorCorrespondenceBackgroundResult
  | MangaCorrespondenceBackgroundResult;
