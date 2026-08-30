import type {
  ListingBackgroundInput,
  ListingBackgroundSource,
} from "@/shared/backgroundSearch";
import type {
  ScraperLatestResultLimitMode,
  ScraperRecord,
  ScraperTagFavoriteRecord,
} from "@/shared/scraper";
import type { ScraperTagBlacklistByScraper } from "@/renderer/utils/scraperTagBlacklist";

export type LatestSourceSearchMode = "quick" | "continuous" | "deep";

export type LatestSourceListingSettings = {
  searchMode: LatestSourceSearchMode;
  resultLimit: number;
  tagResultLimit: number;
};

export type LatestSourceSearchSettings = LatestSourceListingSettings & {
  maxPages: number;
  resultLimitMode: ScraperLatestResultLimitMode;
  concurrency: number;
  includedLanguageCodes: string[];
  scrapeDetailsWithCards: boolean;
  originalOnly?: boolean;
  excludeBlacklistedTagCards: boolean;
  tagBlacklistByScraper?: ScraperTagBlacklistByScraper;
  quickConsecutiveSeenStopThreshold: number;
  languageRejectLimit: number;
  performanceReportsEnabled: boolean;
  selectedScraperIds?: string[];
  selectedTagFavoriteIds?: string[];
};

export const buildLatestSourceListingSources = (
  scrapers: ScraperRecord[],
  tagFavorites: ScraperTagFavoriteRecord[],
  scrapersById: Map<string, ScraperRecord>,
  settings: LatestSourceListingSettings,
): ListingBackgroundSource[] => [
  ...scrapers.map((scraper): ListingBackgroundSource => ({
    id: `scraper:${scraper.id}`,
    name: scraper.name,
    scraper,
    query: scraper.globalConfig.latest?.module === "search"
      ? String(scraper.globalConfig.homeSearch?.query ?? "")
      : "",
    mode: scraper.globalConfig.latest?.module === "search" ? "search" : "homepage",
    resultLimit: settings.searchMode === "continuous" ? 0 : settings.resultLimit,
  })),
  ...tagFavorites.flatMap((favorite) => favorite.sources.flatMap((favoriteSource) => {
    const scraper = scrapersById.get(favoriteSource.scraperId);
    return scraper ? [{
      id: `tag:${favorite.id}:${favoriteSource.scraperId}:${favoriteSource.tagUrl}`,
      name: `${favorite.name} · ${favoriteSource.name} · ${scraper.name}`,
      scraper,
      query: favoriteSource.tagUrl,
      favoriteId: favorite.id,
      mode: "tag" as const,
      resultLimit: settings.searchMode === "continuous" ? 0 : settings.tagResultLimit,
      resultTag: {
        name: favoriteSource.name || favorite.name,
        url: favoriteSource.tagUrl,
      },
    }] : [];
  })),
];

export const buildLatestSourceSearchInput = (
  sources: ListingBackgroundSource[],
  settings: LatestSourceSearchSettings,
): ListingBackgroundInput => ({
  sources,
  maxPages: settings.maxPages,
  resultLimit: settings.searchMode === "continuous" ? 0 : settings.resultLimit,
  tagResultLimit: settings.searchMode === "continuous" ? 0 : settings.tagResultLimit,
  resultLimitMode: settings.resultLimitMode,
  paceMode: "careful",
  concurrency: Math.max(1, Math.floor(settings.concurrency)),
  excludeBlacklistedTagCards: settings.excludeBlacklistedTagCards,
  tagBlacklistByScraper: settings.tagBlacklistByScraper,
  includedLanguageCodes: settings.includedLanguageCodes,
  scrapeDetailsWithCards: settings.scrapeDetailsWithCards,
  originalOnly: settings.originalOnly === true,
  selectedScraperIds: settings.selectedScraperIds,
  selectedTagFavoriteIds: settings.selectedTagFavoriteIds,
  searchMode: settings.searchMode,
  quickConsecutiveSeenStopThreshold: settings.quickConsecutiveSeenStopThreshold,
  languageRejectLimit: settings.languageRejectLimit,
  performanceReportsEnabled: settings.performanceReportsEnabled,
});
