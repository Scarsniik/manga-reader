import type {
  ScraperBookmarkRecord,
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
} from "@/shared/scraper";
import { normalizeScraperTagFavoriteValue } from "@/renderer/utils/scraperTagFavorites";

export type BookmarkTagStatsFuzzyLevel = "strict" | "balanced" | "loose";
export type BookmarkTagStatsFuzzyMode = "off" | BookmarkTagStatsFuzzyLevel;

export type BookmarkTagVariantStat = {
  tag: string;
  count: number;
  scraperIds: string[];
};

export type BookmarkTagStat = {
  tag: string;
  count: number;
  favoriteName?: string;
  scraperIds: string[];
  variants: BookmarkTagVariantStat[];
};

type RawTagStat = {
  tag: string;
  count: number;
  exactKey: string;
  favoriteKeys: Set<string>;
  strictKey: string;
  scraperIds: Set<string>;
};

type TagStatGroup = {
  count: number;
  favoriteKeys: Set<string>;
  favoriteNamesByKey: Map<string, string>;
  scraperIds: Set<string>;
  strictKey: string;
  variants: RawTagStat[];
};

export const DEFAULT_BOOKMARK_TAG_STATS_MIN_OCCURRENCES = 2;
export const DEFAULT_BOOKMARK_TAG_STATS_FUZZY_LEVEL: BookmarkTagStatsFuzzyLevel = "strict";

const normalizeTagBase = (value: unknown): string => (
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
);

const normalizeExactTagKey = (value: unknown): string => (
  normalizeTagBase(value)
    .replace(/\s+/g, " ")
    .trim()
);

const buildFavoriteKey = (favorite: ScraperTagFavoriteRecord): string => (
  String(favorite.id ?? "").trim() || normalizeExactTagKey(favorite.name)
);

const normalizeStrictToken = (token: string): string => {
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
};

const getStrictTagTokens = (value: unknown): string[] => (
  normalizeTagBase(value)
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map(normalizeStrictToken)
    .filter(Boolean)
);

const normalizeStrictTagKey = (value: unknown): string => (
  getStrictTagTokens(value).join(" ")
);

const getUniqueTokens = (value: string): string[] => (
  Array.from(new Set(value.split(" ").filter(Boolean)))
);

const getDiceCoefficient = (left: string, right: string): number => {
  if (left === right) {
    return 1;
  }

  if (left.length < 2 || right.length < 2) {
    return 0;
  }

  const leftPairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    leftPairs.set(pair, (leftPairs.get(pair) ?? 0) + 1);
  }

  let intersection = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = leftPairs.get(pair) ?? 0;
    if (count <= 0) {
      continue;
    }

    leftPairs.set(pair, count - 1);
    intersection += 1;
  }

  return (2 * intersection) / (left.length + right.length - 2);
};

const getTokenJaccard = (left: string, right: string): number => {
  const leftTokens = new Set(getUniqueTokens(left));
  const rightTokens = new Set(getUniqueTokens(right));
  const union = new Set([...leftTokens, ...rightTokens]);

  if (union.size === 0) {
    return 0;
  }

  const intersectionSize = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return intersectionSize / union.size;
};

const getSimilarityThresholds = (level: BookmarkTagStatsFuzzyLevel) => {
  if (level === "loose") {
    return {
      dice: 0.82,
      token: 0.72,
    };
  }

  if (level === "balanced") {
    return {
      dice: 0.9,
      token: 0.84,
    };
  }

  return {
    dice: 1,
    token: 1,
  };
};

const areSimilarTagKeys = (
  left: string,
  right: string,
  level: BookmarkTagStatsFuzzyLevel,
): boolean => {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  if (level === "strict") {
    return false;
  }

  const thresholds = getSimilarityThresholds(level);
  return (
    getTokenJaccard(left, right) >= thresholds.token
    || getDiceCoefficient(left, right) >= thresholds.dice
  );
};

const buildTagFavoriteIndex = (
  favorites: readonly ScraperTagFavoriteRecord[] | null | undefined,
): Map<string, { favoriteKey: string; favoriteName: string }> => {
  const index = new Map<string, { favoriteKey: string; favoriteName: string }>();

  if (!Array.isArray(favorites)) {
    return index;
  }

  favorites.forEach((favorite) => {
    const favoriteKey = buildFavoriteKey(favorite);
    const favoriteName = String(favorite.name ?? "").trim();
    if (!favoriteKey || !favoriteName) {
      return;
    }

    favorite.sources.forEach((source: ScraperTagFavoriteSource) => {
      const scraperId = String(source.scraperId ?? "").trim();
      const sourceName = normalizeScraperTagFavoriteValue(source.name);
      if (!scraperId || !sourceName) {
        return;
      }

      index.set(`${scraperId}::${sourceName}`, {
        favoriteKey,
        favoriteName,
      });
    });
  });

  return index;
};

const getTagFavoriteMatch = (
  favoriteIndex: Map<string, { favoriteKey: string; favoriteName: string }>,
  scraperId: string,
  tag: string,
): { favoriteKey: string; favoriteName: string } | null => {
  const normalizedScraperId = String(scraperId ?? "").trim();
  const normalizedTag = normalizeScraperTagFavoriteValue(tag);

  if (!normalizedScraperId || !normalizedTag) {
    return null;
  }

  return favoriteIndex.get(`${normalizedScraperId}::${normalizedTag}`) ?? null;
};

const createRawTagStats = (
  bookmarks: ScraperBookmarkRecord[],
  favorites: readonly ScraperTagFavoriteRecord[] | null | undefined,
): RawTagStat[] => {
  const statsByExactKey = new Map<string, RawTagStat>();
  const favoriteIndex = buildTagFavoriteIndex(favorites);

  bookmarks.forEach((bookmark) => {
    const seenKeys = new Set<string>();

    bookmark.tags.forEach((tag) => {
      const exactKey = normalizeExactTagKey(tag);
      if (!exactKey || seenKeys.has(exactKey)) {
        return;
      }

      seenKeys.add(exactKey);
      const existing = statsByExactKey.get(exactKey);
      if (existing) {
        existing.count += 1;
        existing.scraperIds.add(bookmark.scraperId);
        const favoriteMatch = getTagFavoriteMatch(favoriteIndex, bookmark.scraperId, tag);
        if (favoriteMatch) {
          existing.favoriteKeys.add(favoriteMatch.favoriteKey);
        }
        return;
      }

      const favoriteMatch = getTagFavoriteMatch(favoriteIndex, bookmark.scraperId, tag);
      statsByExactKey.set(exactKey, {
        tag: String(tag ?? "").trim(),
        count: 1,
        exactKey,
        favoriteKeys: favoriteMatch ? new Set([favoriteMatch.favoriteKey]) : new Set(),
        strictKey: normalizeStrictTagKey(tag),
        scraperIds: new Set([bookmark.scraperId]),
      });
    });
  });

  return Array.from(statsByExactKey.values());
};

const hasSharedFavoriteKey = (
  left: Set<string>,
  right: Set<string>,
): boolean => (
  left.size > 0 && Array.from(left).some((favoriteKey) => right.has(favoriteKey))
);

const shouldMergeTagStats = (
  left: RawTagStat,
  right: RawTagStat,
  fuzzyMode: BookmarkTagStatsFuzzyMode,
): boolean => (
  hasSharedFavoriteKey(left.favoriteKeys, right.favoriteKeys)
  || (fuzzyMode === "off"
    ? left.exactKey === right.exactKey
    : areSimilarTagKeys(left.strictKey, right.strictKey, fuzzyMode))
);

const createParentIndex = (length: number): number[] => (
  Array.from({ length }, (_value, index) => index)
);

const findParentIndex = (parents: number[], index: number): number => {
  const parent = parents[index];
  if (parent === index) {
    return index;
  }

  const rootParent = findParentIndex(parents, parent);
  parents[index] = rootParent;
  return rootParent;
};

const unionParentIndexes = (
  parents: number[],
  leftIndex: number,
  rightIndex: number,
) => {
  const leftParent = findParentIndex(parents, leftIndex);
  const rightParent = findParentIndex(parents, rightIndex);

  if (leftParent !== rightParent) {
    parents[rightParent] = leftParent;
  }
};

const mergeTagStatIntoGroup = (group: TagStatGroup, stat: RawTagStat) => {
  group.count += stat.count;
  group.variants.push(stat);
  stat.favoriteKeys.forEach((favoriteKey) => group.favoriteKeys.add(favoriteKey));
  stat.scraperIds.forEach((scraperId) => group.scraperIds.add(scraperId));
};

const createTagStatGroup = (
  stat: RawTagStat,
  favoriteNamesByKey: Map<string, string>,
): TagStatGroup => ({
  count: 0,
  favoriteKeys: new Set(),
  favoriteNamesByKey,
  scraperIds: new Set(),
  strictKey: stat.strictKey,
  variants: [],
});

const createTagStatGroups = (
  rawStats: RawTagStat[],
  fuzzyMode: BookmarkTagStatsFuzzyMode,
  favoriteNamesByKey: Map<string, string>,
): TagStatGroup[] => {
  const sortedStats = [...rawStats].sort((left, right) => (
    right.count - left.count
    || left.tag.localeCompare(right.tag)
  ));
  const parents = createParentIndex(sortedStats.length);

  for (let leftIndex = 0; leftIndex < sortedStats.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sortedStats.length; rightIndex += 1) {
      if (shouldMergeTagStats(sortedStats[leftIndex], sortedStats[rightIndex], fuzzyMode)) {
        unionParentIndexes(parents, leftIndex, rightIndex);
      }
    }
  }

  const groupsByRoot = new Map<number, TagStatGroup>();
  sortedStats.forEach((stat, index) => {
    const rootIndex = findParentIndex(parents, index);
    const group = groupsByRoot.get(rootIndex) ?? createTagStatGroup(
      sortedStats[rootIndex],
      favoriteNamesByKey,
    );

    mergeTagStatIntoGroup(group, stat);
    groupsByRoot.set(rootIndex, group);
  });

  return Array.from(groupsByRoot.values());
};

const getRepresentativeVariant = (variants: RawTagStat[]): RawTagStat => (
  [...variants].sort((left, right) => (
    right.count - left.count
    || left.tag.length - right.tag.length
    || left.tag.localeCompare(right.tag)
  ))[0]
);

const toBookmarkTagStat = (group: TagStatGroup): BookmarkTagStat => {
  const representative = getRepresentativeVariant(group.variants);
  const favoriteName = Array.from(group.favoriteKeys)
    .map((favoriteKey) => group.favoriteNamesByKey.get(favoriteKey) ?? "")
    .find(Boolean);
  const variants = [...group.variants]
    .sort((left, right) => (
      right.count - left.count
      || left.tag.localeCompare(right.tag)
    ))
    .map((variant) => ({
      tag: variant.tag,
      count: variant.count,
      scraperIds: Array.from(variant.scraperIds).sort((left, right) => left.localeCompare(right)),
    }));

  return {
    tag: representative.tag,
    count: group.count,
    favoriteName,
    scraperIds: Array.from(group.scraperIds).sort((left, right) => left.localeCompare(right)),
    variants,
  };
};

export const buildBookmarkTagStats = (
  bookmarks: ScraperBookmarkRecord[],
  options: {
    fuzzyMode: BookmarkTagStatsFuzzyMode;
    minOccurrences: number;
    tagFavorites?: readonly ScraperTagFavoriteRecord[] | null;
  },
): BookmarkTagStat[] => {
  const minOccurrences = Math.max(1, Math.floor(options.minOccurrences));
  const favoriteNamesByKey = new Map<string, string>();

  options.tagFavorites?.forEach((favorite) => {
    const favoriteKey = buildFavoriteKey(favorite);
    const favoriteName = String(favorite.name ?? "").trim();
    if (favoriteKey && favoriteName) {
      favoriteNamesByKey.set(favoriteKey, favoriteName);
    }
  });

  return createTagStatGroups(
    createRawTagStats(bookmarks, options.tagFavorites),
    options.fuzzyMode,
    favoriteNamesByKey,
  )
    .map(toBookmarkTagStat)
    .filter((stat) => stat.count >= minOccurrences)
    .sort((left, right) => (
      right.count - left.count
      || left.tag.localeCompare(right.tag)
    ));
};
