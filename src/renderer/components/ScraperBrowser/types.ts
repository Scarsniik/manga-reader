import { ScraperFeatureDefinition, ScraperSearchResultItem } from '@/shared/scraper';
import {
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';

export type ScraperBrowseMode = 'search' | 'manga';

export type ScraperBrowserInitialState = {
  query: string;
  detailsResult: ScraperRuntimeDetailsResult;
  chaptersResult?: ScraperRuntimeChapterResult[];
  searchReturnState?: ScraperSearchReturnState | null;
};

export type ScraperBrowserReturnState = {
  scraperId: string;
} & ScraperBrowserInitialState;

export type ScraperSearchReturnState = {
  hasExecutedSearch: boolean;
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

export type ScraperDetailsPanelState = ScraperRuntimeDetailsResult | null;
