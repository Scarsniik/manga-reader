import { ScraperFeatureDefinition, ScraperSearchResultItem } from '@/shared/scraper';
import {
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';

export type ScraperBrowseMode = 'search' | 'manga';

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
