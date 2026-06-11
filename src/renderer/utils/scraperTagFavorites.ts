import type {
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
} from "@/shared/scraper";

export type ScraperFavoriteTagMatch = {
  tag: string;
  tagUrl?: string;
  favorite: ScraperTagFavoriteRecord;
  source: ScraperTagFavoriteSource;
};

export type ScraperTagFavoriteSourceTarget = {
  favorite: ScraperTagFavoriteRecord;
  source: ScraperTagFavoriteSource;
};

const normalizeText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

export const normalizeScraperTagFavoriteValue = (value: unknown): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).toString().toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
};

const getSourceMatchValues = (source: ScraperTagFavoriteSource): string[] => (
  [source.tagUrl, source.name]
    .map(normalizeScraperTagFavoriteValue)
    .filter(Boolean)
);

export const getScraperTagFavoriteSources = (
  favorites: readonly ScraperTagFavoriteRecord[] | null | undefined,
  scraperId: string,
): ScraperTagFavoriteSourceTarget[] => {
  if (!Array.isArray(favorites) || !scraperId) {
    return [];
  }

  return favorites.reduce<ScraperTagFavoriteSourceTarget[]>((sources, favorite) => {
    favorite.sources.forEach((source: ScraperTagFavoriteSource) => {
      if (source.scraperId === scraperId) {
        sources.push({ favorite, source });
      }
    });

    return sources;
  }, []);
};

export const findScraperTagFavoriteSource = (
  sources: ScraperTagFavoriteSourceTarget[],
  tag: string | null | undefined,
  tagUrl?: string | null,
): {
  favorite: ScraperTagFavoriteRecord;
  source: ScraperTagFavoriteSource;
} | null => {
  const tagValues = [tagUrl, tag]
    .map(normalizeScraperTagFavoriteValue)
    .filter(Boolean);

  if (!tagValues.length) {
    return null;
  }

  return sources.find(({ source }) => (
    getSourceMatchValues(source).some((sourceValue) => tagValues.includes(sourceValue))
  )) ?? null;
};

export const getFavoriteScraperTags = (
  sources: ScraperTagFavoriteSourceTarget[],
  tags: readonly string[] | null | undefined,
  tagUrls?: readonly string[] | null,
): ScraperFavoriteTagMatch[] => {
  const tagValues = Array.isArray(tags) ? tags : [];
  const tagUrlValues = Array.isArray(tagUrls) ? tagUrls : [];
  if ((!tagValues.length && !tagUrlValues.length) || !sources.length) {
    return [];
  }

  return Array.from({ length: Math.max(tagValues.length, tagUrlValues.length) })
    .reduce<ScraperFavoriteTagMatch[]>((matches, _item, index) => {
      const tagUrl = tagUrlValues[index];
      const tag = tagValues[index] || tagUrl || "";
      if (!tag && !tagUrl) {
        return matches;
      }

      const favoriteSource = findScraperTagFavoriteSource(sources, tag, tagUrl);
      if (!favoriteSource) {
        return matches;
      }

      matches.push({
        tag,
        tagUrl,
        favorite: favoriteSource.favorite,
        source: favoriteSource.source,
      });
      return matches;
    }, []);
};
