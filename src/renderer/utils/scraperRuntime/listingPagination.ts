import type { FetchScraperDocumentResult } from "@/shared/scraper";
import type { ScraperRuntimeSearchPageResult } from "@/renderer/utils/scraperRuntime/types";

const TERMINAL_LISTING_STATUS = 404;

export class ScraperListingPaginationEndError extends Error {
  readonly pageIndex: number;
  readonly status: number;
  readonly currentPageUrl: string;

  constructor(pageIndex: number, status: number, currentPageUrl: string) {
    super("No more scraper listing pages are available.");
    this.name = "ScraperListingPaginationEndError";
    this.pageIndex = pageIndex;
    this.status = status;
    this.currentPageUrl = currentPageUrl;
  }
}

export const isScraperListingPaginationEndError = (
  error: unknown,
): error is ScraperListingPaginationEndError => error instanceof ScraperListingPaginationEndError;

export const isTerminalScraperListingPaginationResponse = (
  result: FetchScraperDocumentResult | null | undefined,
  pageIndex: number,
  usesTemplatePaging: boolean,
): boolean => usesTemplatePaging && pageIndex > 0 && result?.status === TERMINAL_LISTING_STATUS;

export const getScraperListingPaginationUrl = (
  result: FetchScraperDocumentResult | null | undefined,
  targetUrl: string,
): string => result?.finalUrl || result?.requestedUrl || targetUrl;

export const throwIfScraperListingPaginationEnded = (
  result: FetchScraperDocumentResult | null | undefined,
  options: {
    pageIndex: number;
    targetUrl: string;
    usesTemplatePaging: boolean;
  },
): void => {
  if (!isTerminalScraperListingPaginationResponse(result, options.pageIndex, options.usesTemplatePaging)) {
    return;
  }

  throw new ScraperListingPaginationEndError(
    options.pageIndex,
    TERMINAL_LISTING_STATUS,
    getScraperListingPaginationUrl(result, options.targetUrl),
  );
};

export const buildScraperListingPaginationEndPage = (
  error: ScraperListingPaginationEndError,
): ScraperRuntimeSearchPageResult => ({
  currentPageUrl: error.currentPageUrl,
  items: [],
});
