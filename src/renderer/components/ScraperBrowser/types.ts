import { ScraperFeatureDefinition, ScraperSearchResultItem } from '@/shared/scraper';
import {
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import type { ScraperTemplateContext } from '@/renderer/utils/scraperTemplateContext';

export type ScraperListingMode = 'search' | 'author';
export type ScraperBrowseMode = ScraperListingMode | 'manga';
export type ScraperBrowserHistorySourceKind = ScraperBrowseMode | 'bookmarks';

export type ScraperBrowserLocationState = {
  scraperBrowserHistorySource?: {
    kind: ScraperBrowserHistorySourceKind;
  };
  scraperBrowserListingReturnState?: ScraperListingReturnState | null;
};

export type ScraperBrowserInitialState = {
  query: string;
  detailsResult?: ScraperRuntimeDetailsResult | null;
  chaptersResult?: ScraperRuntimeChapterResult[];
  listingReturnState?: ScraperListingReturnState | null;
  listingMode?: ScraperListingMode;
  listingPage?: ScraperRuntimeSearchPageResult | null;
  listingVisitedPageUrls?: string[];
  listingPageIndex?: number;
  listingResults?: ScraperSearchResultItem[];
  hasExecutedListing?: boolean;
  authorTemplateContext?: ScraperTemplateContext | null;
};

export type ScraperBrowserReturnState = {
  scraperId: string;
  query: string;
  detailsResult: ScraperRuntimeDetailsResult;
  chaptersResult?: ScraperRuntimeChapterResult[];
  listingReturnState?: ScraperListingReturnState | null;
};

export type ScraperListingReturnState = {
  mode: ScraperListingMode;
  hasExecutedListing: boolean;
  query: string;
  page: ScraperRuntimeSearchPageResult | null;
  visitedPageUrls: string[];
  pageIndex: number;
  results: ScraperSearchResultItem[];
  scrollTop: number | null;
  newResultIds?: string[];
};

export type ScraperCapability = {
  label: string;
  feature: ScraperFeatureDefinition | null;
  enabled: boolean;
};

export type ScraperOpenReaderOptions = {
  chapter?: ScraperRuntimeChapterResult;
  page?: number;
};

export type ScraperDetailsPanelState = ScraperRuntimeDetailsResult | null;
