import type { MultiSearchMergedResult } from "@/renderer/components/MultiSearch/types";
import {
  getBlacklistedScraperTags,
  getScraperTagBlacklistEntries,
  normalizeScraperTagBlacklistValue,
  type ScraperBlacklistedTagMatch,
  type ScraperTagBlacklistByScraper,
} from "@/renderer/utils/scraperTagBlacklist";

export type MultiSearchBlacklistedTagMatch = ScraperBlacklistedTagMatch & {
  scraperId: string;
  scraperName: string;
};

export const getMultiSearchBlacklistedTagMatchKey = (
  match: MultiSearchBlacklistedTagMatch,
): string => [
  match.scraperId,
  normalizeScraperTagBlacklistValue(match.tagUrl || match.tag),
  normalizeScraperTagBlacklistValue(match.entry.value),
].join("::");

export const getMultiSearchBlacklistedTagMatches = (
  result: MultiSearchMergedResult,
  blacklistByScraper: ScraperTagBlacklistByScraper | null | undefined,
): MultiSearchBlacklistedTagMatch[] => {
  const seenKeys = new Set<string>();

  return result.sources.reduce<MultiSearchBlacklistedTagMatch[]>((matches, source) => {
    const entries = getScraperTagBlacklistEntries(blacklistByScraper, source.scraper.id);
    const sourceMatches = getBlacklistedScraperTags(
      entries,
      source.result.tags,
      source.result.tagUrls,
    );

    sourceMatches.forEach((match) => {
      const nextMatch = {
        ...match,
        scraperId: source.scraper.id,
        scraperName: source.scraper.name,
      };
      const key = getMultiSearchBlacklistedTagMatchKey(nextMatch);
      if (seenKeys.has(key)) {
        return;
      }

      seenKeys.add(key);
      matches.push(nextMatch);
    });

    return matches;
  }, []);
};

export const hasMultiSearchBlacklistedTags = (
  result: MultiSearchMergedResult,
  blacklistByScraper: ScraperTagBlacklistByScraper | null | undefined,
): boolean => (
  getMultiSearchBlacklistedTagMatches(result, blacklistByScraper).length > 0
);

export const filterBlacklistedMultiSearchResults = (
  results: MultiSearchMergedResult[],
  blacklistByScraper: ScraperTagBlacklistByScraper | null | undefined,
  hideBlacklistedCards: boolean,
): MultiSearchMergedResult[] => {
  if (!hideBlacklistedCards) {
    return results;
  }

  return results.filter((result) => !hasMultiSearchBlacklistedTags(result, blacklistByScraper));
};
