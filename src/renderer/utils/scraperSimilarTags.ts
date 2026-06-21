import type {
  ScraperRecord,
  ScraperTagListCacheRecord,
  ScraperTagListItem,
} from "@/shared/scraper";
import { getFuzzyTextMatchScore, normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import {
  getScraperFeature,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime/featureConfig";

export type ScraperSimilarTagResult = {
  key: string;
  scraperId: string;
  scraperName: string;
  tagName: string;
  tagUrl: string;
  score: number;
};

export type ScraperSimilarTagSearchResult = {
  results: ScraperSimilarTagResult[];
  totalMatchCount: number;
  configuredScraperCount: number;
  cachedScraperCount: number;
  missingCacheCount: number;
  failedScraperCount: number;
};

type ScraperTagListCacheApi = {
  getScraperTagListCache?: (scraperId: string) => Promise<ScraperTagListCacheRecord | null>;
};

const MINIMUM_MATCH_SCORE = 250;
const MAXIMUM_RESULT_COUNT = 100;

const getTagTarget = (tag: ScraperTagListItem): string => (
  String(tag.url ?? "").trim() || String(tag.name ?? "").trim()
);

const getBestMatchScore = (searchTerms: string[], tagName: string): number => (
  searchTerms.reduce(
    (bestScore, searchTerm) => Math.max(bestScore, getFuzzyTextMatchScore(searchTerm, tagName)),
    0,
  )
);

const buildScraperResults = (
  scraper: ScraperRecord,
  cache: ScraperTagListCacheRecord,
  searchTerms: string[],
): ScraperSimilarTagResult[] => {
  const seenTargets = new Set<string>();

  return cache.tags.reduce<ScraperSimilarTagResult[]>((results, tag) => {
    const tagName = String(tag.name ?? "").trim();
    const tagUrl = getTagTarget(tag);
    const normalizedTarget = tagUrl.toLowerCase();
    if (!tagName || !tagUrl || !normalizedTarget || seenTargets.has(normalizedTarget)) {
      return results;
    }

    seenTargets.add(normalizedTarget);
    const score = getBestMatchScore(searchTerms, tagName);
    if (score < MINIMUM_MATCH_SCORE) {
      return results;
    }

    results.push({
      key: `${scraper.id}::${normalizedTarget}`,
      scraperId: scraper.id,
      scraperName: scraper.name,
      tagName,
      tagUrl,
      score,
    });
    return results;
  }, []);
};

const sortSimilarTagResults = (results: ScraperSimilarTagResult[]): ScraperSimilarTagResult[] => (
  [...results].sort((left, right) => (
    right.score - left.score
    || left.tagName.localeCompare(right.tagName, undefined, { sensitivity: "base" })
    || left.scraperName.localeCompare(right.scraperName, undefined, { sensitivity: "base" })
  ))
);

export const searchSimilarScraperTags = async (
  scrapers: ScraperRecord[],
  rawSearchTerms: string[],
): Promise<ScraperSimilarTagSearchResult> => {
  const searchTerms = Array.from(new Set(
    rawSearchTerms.map(normalizeFuzzyText).filter(Boolean),
  ));
  const configuredScrapers = scrapers.filter((scraper) => (
    isScraperFeatureConfigured(getScraperFeature(scraper, "tagList"))
  ));
  const api = (window.api ?? {}) as ScraperTagListCacheApi;

  if (typeof api.getScraperTagListCache !== "function") {
    throw new Error("La recherche dans les listes de tags n'est pas disponible dans cette version.");
  }

  const cacheReads = await Promise.all(configuredScrapers.map(async (scraper) => {
    try {
      return {
        scraper,
        cache: await api.getScraperTagListCache?.(scraper.id) ?? null,
        failed: false,
      };
    } catch {
      return {
        scraper,
        cache: null,
        failed: true,
      };
    }
  }));
  const results = cacheReads.flatMap(({ scraper, cache }) => (
    cache ? buildScraperResults(scraper, cache, searchTerms) : []
  ));

  const sortedResults = sortSimilarTagResults(results);

  return {
    results: sortedResults.slice(0, MAXIMUM_RESULT_COUNT),
    totalMatchCount: sortedResults.length,
    configuredScraperCount: configuredScrapers.length,
    cachedScraperCount: cacheReads.filter(({ cache }) => Boolean(cache)).length,
    missingCacheCount: cacheReads.filter(({ cache, failed }) => !cache && !failed).length,
    failedScraperCount: cacheReads.filter(({ failed }) => failed).length,
  };
};
