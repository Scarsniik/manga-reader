import type {
  FetchScraperDocumentResult,
  ScraperChapterItem,
  ScraperFeatureValidationCheckKey,
  ScraperSearchResultItem,
} from "@/shared/scraper";

export type DetailsFieldKey = Extract<
  ScraperFeatureValidationCheckKey,
  "title" | "cover" | "description" | "authors" | "tags" | "status" | "pageCount"
>;

export type ScraperRuntimeChapterResult = ScraperChapterItem;

export type ScraperRuntimeDetailsResult = {
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  title?: string;
  cover?: string;
  description?: string;
  authors: string[];
  authorUrls: string[];
  tags: string[];
  tagUrls: string[];
  thumbnails?: string[];
  thumbnailsNextPageUrl?: string;
  mangaStatus?: string;
  pageCount?: string;
  languageCodes: string[];
  derivedValues: Record<string, string>;
};

export type ScraperReaderSession = {
  id: string;
  scraperId: string;
  title: string;
  sourceUrl: string;
  cover?: string;
  pageUrls: string[];
};

export type ScraperRuntimeSearchPageResult = {
  currentPageUrl: string;
  nextPageUrl?: string;
  authorNames?: string[];
  listingNames?: string[];
  items: ScraperSearchResultItem[];
};

export type ScraperDocumentFetcher = (request: {
  baseUrl: string;
  targetUrl: string;
  validateImage?: boolean;
}) => Promise<FetchScraperDocumentResult>;

export type ScraperResolvedChaptersResult = {
  sourceResult: FetchScraperDocumentResult;
  chapters: ScraperRuntimeChapterResult[];
  pagesVisited: number;
};

export const DETAILS_FIELD_KEYS: DetailsFieldKey[] = [
  "title",
  "cover",
  "description",
  "authors",
  "tags",
  "status",
  "pageCount",
];
