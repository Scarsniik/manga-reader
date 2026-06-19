import type {
  AddScraperTagListCacheItemsRequest,
  ScraperRecord,
  ScraperTagListCacheRecord,
  ScraperTagListItem,
} from "@/shared/scraper";
import {
  getScraperFeature,
  getScraperTagListFeatureConfig,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime/featureConfig";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime/types";

type ScraperTagListCacheApi = {
  addScraperTagListCacheItems?: (
    request: AddScraperTagListCacheItemsRequest,
  ) => Promise<ScraperTagListCacheRecord>;
};

const normalizeText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const uniqueTagListItems = (items: ScraperTagListItem[]): ScraperTagListItem[] => {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = normalizeText(item.url || item.name).toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const buildTagListItemsFromDetails = (
  details: ScraperRuntimeDetailsResult,
): ScraperTagListItem[] => (
  uniqueTagListItems(
    details.tags.reduce<ScraperTagListItem[]>((items, tagName, index) => {
      const name = normalizeText(tagName);
      if (!name) {
        return items;
      }

      const url = normalizeText(details.tagUrls[index]);
      items.push({
        name,
        url: url || undefined,
      });
      return items;
    }, []),
  )
);

export const collectScraperDetailsTagsForTagListCache = async (
  scraper: ScraperRecord,
  details: ScraperRuntimeDetailsResult,
): Promise<ScraperTagListCacheRecord | null> => {
  const tagListFeature = getScraperFeature(scraper, "tagList");
  if (!isScraperFeatureConfigured(tagListFeature)) {
    return null;
  }

  const tagListConfig = getScraperTagListFeatureConfig(tagListFeature);
  if (tagListConfig?.collectFromDetails !== true) {
    return null;
  }

  const tags = buildTagListItemsFromDetails(details);
  if (!tags.length) {
    return null;
  }

  const api = (window.api ?? {}) as ScraperTagListCacheApi;
  if (typeof api.addScraperTagListCacheItems !== "function") {
    return null;
  }

  return api.addScraperTagListCacheItems({
    scraperId: scraper.id,
    sourceUrl: details.finalUrl || details.requestedUrl,
    tags,
  });
};

export const collectScraperDetailsTagsForTagListCacheSafe = (
  scraper: ScraperRecord,
  details: ScraperRuntimeDetailsResult,
): void => {
  void collectScraperDetailsTagsForTagListCache(scraper, details).catch((error) => {
    console.warn("Scraper tag list cache collection failed", error);
  });
};
