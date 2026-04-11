import { ScraperFeatureDefinition, ScraperSearchResultItem } from '@/shared/scraper';
import {
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';

export type ScraperListingMode = 'search' | 'author';
export type ScraperBrowseMode = ScraperListingMode | 'manga';
export type ScraperBrowserHistorySourceKind = ScraperBrowseMode | 'bookmarks';

export type ScraperBrowserLocationState = {
  scraperBrowserHistorySource?: {
    kind: ScraperBrowserHistorySourceKind;
  };
};

export type ScraperBrowserInitialState = {
  query: string;
  detailsResult: ScraperRuntimeDetailsResult;
  chaptersResult?: ScraperRuntimeChapterResult[];
  listingReturnState?: ScraperListingReturnState | null;
};

export type ScraperBrowserReturnState = {
  scraperId: string;
} & ScraperBrowserInitialState;

export type ScraperListingReturnState = {
  mode: ScraperListingMode;
  hasExecutedListing: boolean;
  query: string;
  page: ScraperRuntimeSearchPageResult | null;
  visitedPageUrls: string[];
  pageIndex: number;
  results: ScraperSearchResultItem[];
  scrollTop: number | null;
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
