import type {
  GetScraperEntityListCacheRequest,
  ScraperEntityListCacheRecord,
  ScraperEntityListItem,
  ScraperRecord,
} from "@/shared/scraper";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import {
  getScraperFeature,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime";

type ScraperAuthorListCacheApi = {
  getScraperEntityListCache?: (
    request: GetScraperEntityListCacheRequest,
  ) => Promise<ScraperEntityListCacheRecord | null>;
};

const getApi = (): ScraperAuthorListCacheApi => (
  (window.api ?? {}) as ScraperAuthorListCacheApi
);

export const findCachedScraperAuthors = (
  items: ScraperEntityListItem[],
  names: Array<string | null | undefined>,
): ScraperEntityListItem[] => {
  const normalizedNames = new Set(names.map((name) => normalizeFuzzyText(name ?? "")).filter(Boolean));
  if (!normalizedNames.size) {
    return [];
  }

  return items.filter((item) => (
    Boolean(item.url?.trim())
    && normalizedNames.has(normalizeFuzzyText(item.name))
  ));
};

export const getCachedScraperAuthors = async (
  scraper: ScraperRecord,
  names: Array<string | null | undefined>,
): Promise<ScraperEntityListItem[]> => {
  if (!isScraperFeatureConfigured(getScraperFeature(scraper, "authorList"))) {
    return [];
  }

  const api = getApi();
  if (typeof api.getScraperEntityListCache !== "function") {
    return [];
  }

  const cache = await api.getScraperEntityListCache({
    scraperId: scraper.id,
    entityKind: "author",
  });
  return findCachedScraperAuthors(cache?.items ?? [], names);
};

export const resolveCachedScraperAuthorTarget = async (
  scraper: ScraperRecord,
  name: string,
): Promise<ScraperEntityListItem | null> => (
  (await getCachedScraperAuthors(scraper, [name]))[0] ?? null
);
