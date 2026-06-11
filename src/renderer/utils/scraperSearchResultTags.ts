import type { ScraperSearchResultItem } from "@/shared/scraper";

const normalizeTagText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const normalizeTagMatchValue = (value: unknown): string => {
  const normalized = normalizeTagText(value);
  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).toString().toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
};

const hasTagMatchValue = (
  result: ScraperSearchResultItem,
  matchValues: Set<string>,
): boolean => {
  const tagValues = Array.isArray(result.tags) ? result.tags : [];
  const tagUrlValues = Array.isArray(result.tagUrls) ? result.tagUrls : [];

  return [...tagValues, ...tagUrlValues].some((value) => (
    matchValues.has(normalizeTagMatchValue(value))
  ));
};

export const appendScraperSearchResultTag = (
  result: ScraperSearchResultItem,
  tag: string | null | undefined,
  tagUrl?: string | null,
): ScraperSearchResultItem => {
  const normalizedTag = normalizeTagText(tag);
  const normalizedTagUrl = normalizeTagText(tagUrl);
  const displayTag = normalizedTag || normalizedTagUrl;
  if (!displayTag) {
    return result;
  }

  const matchValues = new Set(
    [normalizedTag, normalizedTagUrl]
      .map(normalizeTagMatchValue)
      .filter(Boolean),
  );
  if (hasTagMatchValue(result, matchValues)) {
    return result;
  }

  const currentTags = Array.isArray(result.tags) ? result.tags : [];
  const currentTagUrls = Array.isArray(result.tagUrls) ? result.tagUrls : [];

  return {
    ...result,
    tags: [...currentTags, displayTag],
    tagUrls: [
      ...currentTags.map((_currentTag, index) => currentTagUrls[index] ?? ""),
      normalizedTagUrl,
    ],
  };
};

export const appendScraperSearchResultTagToItems = (
  items: ScraperSearchResultItem[],
  tag: string | null | undefined,
  tagUrl?: string | null,
): ScraperSearchResultItem[] => (
  items.map((item) => appendScraperSearchResultTag(item, tag, tagUrl))
);
