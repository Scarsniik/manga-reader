import type { ScraperTagFavoriteRecord } from "@/shared/scraper";
import type { MultiSearchMergedResult } from "@/renderer/components/MultiSearch/types";
import {
  getFavoriteScraperTags,
  getScraperTagFavoriteSources,
  normalizeScraperTagFavoriteValue,
  type ScraperFavoriteTagMatch,
} from "@/renderer/utils/scraperTagFavorites";

export type MultiSearchFavoriteTagMatch = ScraperFavoriteTagMatch & {
  scraperId: string;
  scraperName: string;
};

export const getMultiSearchFavoriteTagMatchKey = (
  match: MultiSearchFavoriteTagMatch,
): string => [
  match.scraperId,
  normalizeScraperTagFavoriteValue(match.tagUrl || match.tag),
  normalizeScraperTagFavoriteValue(match.source.tagUrl || match.source.name),
].join("::");

export const getMultiSearchFavoriteTagMatches = (
  result: MultiSearchMergedResult,
  tagFavorites: readonly ScraperTagFavoriteRecord[] | null | undefined,
): MultiSearchFavoriteTagMatch[] => {
  const seenKeys = new Set<string>();

  return result.sources.reduce<MultiSearchFavoriteTagMatch[]>((matches, source) => {
    const favoriteSources = getScraperTagFavoriteSources(tagFavorites, source.scraper.id);
    const sourceMatches = getFavoriteScraperTags(
      favoriteSources,
      source.result.tags,
      source.result.tagUrls,
    );

    sourceMatches.forEach((match) => {
      const nextMatch = {
        ...match,
        scraperId: source.scraper.id,
        scraperName: source.scraper.name,
      };
      const key = getMultiSearchFavoriteTagMatchKey(nextMatch);
      if (seenKeys.has(key)) {
        return;
      }

      seenKeys.add(key);
      matches.push(nextMatch);
    });

    return matches;
  }, []);
};
