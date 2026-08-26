import type {
  ScraperAuthorFavoriteRecord,
  ScraperBookmarkRecord,
} from "@/shared/scraper";
import type { AuthorCorrespondenceReferenceSource } from "@/shared/backgroundSearch";
import type { ScraperTitleAnalysisConfigs } from "@/renderer/utils/scraperTitleAnalysisConfigs";
import { analyzeMangaCorrespondenceSourceIdentity } from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";
import { extractTentativeAuthorNamesFromTitle } from "@/renderer/utils/mangaMatching/tentativeAuthors";
import { findCompatibleMangaAuthorName } from "@/renderer/utils/mangaMatching/titleProfiles";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";

export type BookmarkAuthorOrigin = "metadata" | "titleParser" | "titleFallback";

export type BookmarkAuthorCandidate = {
  name: string;
  origin: BookmarkAuthorOrigin;
};

export type BookmarkAuthorCandidateSource = {
  authorNames?: string[];
  authorUrls?: string[];
  bookmarkKey: string;
  candidates: BookmarkAuthorCandidate[];
  cover?: string;
  coverRefererUrl?: string;
  coverTitle?: string;
  scraperId: string;
};

export type BookmarkAuthorCompatibilityCache = Map<string, boolean>;

export type BookmarkAuthorVariantStat = {
  author: string;
  count: number;
  extractedCount: number;
  scraperIds: string[];
};

export type BookmarkAuthorStat = {
  author: string;
  count: number;
  cover?: string;
  coverRefererUrl?: string;
  coverTitle?: string;
  favoriteName?: string;
  filterValue: string;
  scraperIds: string[];
  referenceSources: AuthorCorrespondenceReferenceSource[];
  variants: BookmarkAuthorVariantStat[];
};

type RawAuthorStat = {
  author: string;
  bookmarkKeys: Set<string>;
  coversByBookmarkKey: Map<string, {
    cover: string;
    refererUrl?: string;
    title?: string;
  }>;
  extractedBookmarkKeys: Set<string>;
  favoriteKeys: Set<string>;
  referenceSourcesByKey: Map<string, AuthorCorrespondenceReferenceSource>;
  scraperIds: Set<string>;
};

type AuthorStatGroup = {
  bookmarkKeys: Set<string>;
  coversByBookmarkKey: RawAuthorStat["coversByBookmarkKey"];
  favoriteKeys: Set<string>;
  referenceSourcesByKey: RawAuthorStat["referenceSourcesByKey"];
  scraperIds: Set<string>;
  variants: RawAuthorStat[];
};

type AuthorFavoriteMatch = {
  favoriteKey: string;
  favoriteName: string;
};

export const getBookmarkAuthorStatsKey = (
  bookmark: Pick<ScraperBookmarkRecord, "scraperId" | "sourceUrl">,
): string => `${bookmark.scraperId}::${bookmark.sourceUrl}`;

const normalizeAuthorValues = (values: readonly string[]): string[] => {
  const namesByKey = new Map<string, string>();
  values.forEach((value) => {
    const name = String(value ?? "").trim().replace(/\s+/g, " ");
    const key = normalizeFuzzyText(name);
    if (key && !namesByKey.has(key)) {
      namesByKey.set(key, name);
    }
  });
  return Array.from(namesByKey.values());
};

export const getBookmarkAuthorCandidates = (
  bookmark: ScraperBookmarkRecord,
  configsByScraperId: ScraperTitleAnalysisConfigs,
): BookmarkAuthorCandidate[] => {
  const metadataAuthors = normalizeAuthorValues(bookmark.authors ?? []);
  const parsedAuthors = normalizeAuthorValues(analyzeMangaCorrespondenceSourceIdentity({
    rawTitle: bookmark.title,
    titleAnalysisConfig: configsByScraperId.get(bookmark.scraperId),
  }).authors);
  const fallbackAuthors = metadataAuthors.length || parsedAuthors.length
    ? []
    : normalizeAuthorValues(extractTentativeAuthorNamesFromTitle(bookmark.title));
  const candidatesByKey = new Map<string, BookmarkAuthorCandidate>();

  [
    ...metadataAuthors.map((name) => ({ name, origin: "metadata" as const })),
    ...parsedAuthors.map((name) => ({ name, origin: "titleParser" as const })),
    ...fallbackAuthors.map((name) => ({ name, origin: "titleFallback" as const })),
  ].forEach((candidate) => {
    const key = normalizeFuzzyText(candidate.name);
    const current = candidatesByKey.get(key);
    if (!current || current.origin !== "metadata") {
      candidatesByKey.set(key, candidate);
    }
  });

  return Array.from(candidatesByKey.values());
};

const buildFavoriteKey = (favorite: ScraperAuthorFavoriteRecord): string => (
  String(favorite.id ?? "").trim() || normalizeFuzzyText(favorite.name)
);

const buildAuthorFavoriteIndex = (
  favorites: readonly ScraperAuthorFavoriteRecord[] | null | undefined,
): {
  favoritesByKey: Map<string, ScraperAuthorFavoriteRecord>;
  matchesBySourceName: Map<string, AuthorFavoriteMatch>;
  namesByKey: Map<string, string>;
} => {
  const favoritesByKey = new Map<string, ScraperAuthorFavoriteRecord>();
  const matchesBySourceName = new Map<string, AuthorFavoriteMatch>();
  const namesByKey = new Map<string, string>();

  (favorites ?? []).forEach((favorite) => {
    const favoriteKey = buildFavoriteKey(favorite);
    const favoriteName = String(favorite.name ?? "").trim();
    if (!favoriteKey || !favoriteName) {
      return;
    }

    namesByKey.set(favoriteKey, favoriteName);
    favoritesByKey.set(favoriteKey, favorite);
    favorite.sources.forEach((source) => {
      const scraperId = String(source.scraperId ?? "").trim();
      const sourceName = normalizeFuzzyText(source.name);
      if (scraperId && sourceName) {
        matchesBySourceName.set(`${scraperId}::${sourceName}`, {
          favoriteKey,
          favoriteName,
        });
      }
    });
  });

  return { favoritesByKey, matchesBySourceName, namesByKey };
};

const createRawAuthorStats = (
  sources: Iterable<BookmarkAuthorCandidateSource>,
  favoriteMatches: Map<string, AuthorFavoriteMatch>,
): RawAuthorStat[] => {
  const statsByAuthorKey = new Map<string, RawAuthorStat>();

  for (const source of sources) {
    source.candidates.forEach((candidate) => {
      const normalizedAuthor = normalizeFuzzyText(candidate.name);
      if (!normalizedAuthor) {
        return;
      }

      const favoriteMatch = favoriteMatches.get(`${source.scraperId}::${normalizedAuthor}`);
      const metadataAuthorIndex = candidate.origin === "metadata"
        ? (source.authorNames ?? []).findIndex((authorName) => (
          normalizeFuzzyText(authorName) === normalizedAuthor
        ))
        : -1;
      const directAuthorUrl = metadataAuthorIndex >= 0
        ? String(source.authorUrls?.[metadataAuthorIndex] ?? "").trim()
        : "";
      const stat = statsByAuthorKey.get(normalizedAuthor) ?? {
        author: candidate.name,
        bookmarkKeys: new Set<string>(),
        coversByBookmarkKey: new Map(),
        extractedBookmarkKeys: new Set<string>(),
        favoriteKeys: new Set<string>(),
        referenceSourcesByKey: new Map(),
        scraperIds: new Set<string>(),
      };

      stat.bookmarkKeys.add(source.bookmarkKey);
      if (source.cover) {
        stat.coversByBookmarkKey.set(source.bookmarkKey, {
          cover: source.cover,
          refererUrl: source.coverRefererUrl,
          title: source.coverTitle,
        });
      }
      stat.scraperIds.add(source.scraperId);
      if (candidate.origin !== "metadata") {
        stat.extractedBookmarkKeys.add(source.bookmarkKey);
      }
      if (favoriteMatch) {
        stat.favoriteKeys.add(favoriteMatch.favoriteKey);
      }
      if (directAuthorUrl) {
        stat.referenceSourcesByKey.set(`${source.scraperId}::${directAuthorUrl}`, {
          scraperId: source.scraperId,
          authorUrl: directAuthorUrl,
          name: candidate.name,
        });
      }
      statsByAuthorKey.set(normalizedAuthor, stat);
    });
  }

  return Array.from(statsByAuthorKey.values());
};

const createParentIndex = (length: number): number[] => (
  Array.from({ length }, (_value, index) => index)
);

const findParentIndex = (parents: number[], index: number): number => {
  if (parents[index] === index) {
    return index;
  }

  parents[index] = findParentIndex(parents, parents[index]);
  return parents[index];
};

const unionParentIndexes = (parents: number[], leftIndex: number, rightIndex: number) => {
  const leftParent = findParentIndex(parents, leftIndex);
  const rightParent = findParentIndex(parents, rightIndex);
  if (leftParent !== rightParent) {
    parents[rightParent] = leftParent;
  }
};

const haveSharedFavorite = (left: RawAuthorStat, right: RawAuthorStat): boolean => (
  left.favoriteKeys.size > 0
  && Array.from(left.favoriteKeys).some((favoriteKey) => right.favoriteKeys.has(favoriteKey))
);

const areCompatibleAuthors = (left: RawAuthorStat, right: RawAuthorStat): boolean => (
  haveSharedFavorite(left, right)
  || Boolean(findCompatibleMangaAuthorName(left.author, [right.author]))
  || Boolean(findCompatibleMangaAuthorName(right.author, [left.author]))
);

const areCompatibleAuthorsCached = (
  left: RawAuthorStat,
  right: RawAuthorStat,
  compatibilityCache?: BookmarkAuthorCompatibilityCache,
): boolean => {
  if (haveSharedFavorite(left, right)) {
    return true;
  }
  if (!compatibilityCache) {
    return areCompatibleAuthors(left, right);
  }

  const cacheKey = [normalizeFuzzyText(left.author), normalizeFuzzyText(right.author)]
    .sort((leftKey, rightKey) => leftKey.localeCompare(rightKey))
    .join("::");
  const cached = compatibilityCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const compatible = Boolean(findCompatibleMangaAuthorName(left.author, [right.author]))
    || Boolean(findCompatibleMangaAuthorName(right.author, [left.author]));
  compatibilityCache.set(cacheKey, compatible);
  return compatible;
};

const createAuthorStatGroups = (
  rawStats: RawAuthorStat[],
  compatibilityCache?: BookmarkAuthorCompatibilityCache,
): AuthorStatGroup[] => {
  const sortedStats = [...rawStats].sort((left, right) => (
    right.bookmarkKeys.size - left.bookmarkKeys.size
    || left.author.localeCompare(right.author)
  ));
  const parents = createParentIndex(sortedStats.length);

  for (let leftIndex = 0; leftIndex < sortedStats.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sortedStats.length; rightIndex += 1) {
      if (areCompatibleAuthorsCached(
        sortedStats[leftIndex],
        sortedStats[rightIndex],
        compatibilityCache,
      )) {
        unionParentIndexes(parents, leftIndex, rightIndex);
      }
    }
  }

  const groupsByRoot = new Map<number, AuthorStatGroup>();
  sortedStats.forEach((stat, index) => {
    const rootIndex = findParentIndex(parents, index);
    const group: AuthorStatGroup = groupsByRoot.get(rootIndex) ?? {
      bookmarkKeys: new Set<string>(),
      coversByBookmarkKey: new Map(),
      favoriteKeys: new Set<string>(),
      referenceSourcesByKey: new Map(),
      scraperIds: new Set<string>(),
      variants: [],
    };
    stat.bookmarkKeys.forEach((bookmarkKey) => group.bookmarkKeys.add(bookmarkKey));
    stat.coversByBookmarkKey.forEach((cover, bookmarkKey) => {
      if (!group.coversByBookmarkKey.has(bookmarkKey)) {
        group.coversByBookmarkKey.set(bookmarkKey, cover);
      }
    });
    stat.favoriteKeys.forEach((favoriteKey) => group.favoriteKeys.add(favoriteKey));
    stat.referenceSourcesByKey.forEach((source, sourceKey) => {
      if (!group.referenceSourcesByKey.has(sourceKey)) {
        group.referenceSourcesByKey.set(sourceKey, source);
      }
    });
    stat.scraperIds.forEach((scraperId) => group.scraperIds.add(scraperId));
    group.variants.push(stat);
    groupsByRoot.set(rootIndex, group);
  });

  return Array.from(groupsByRoot.values());
};

const getRepresentativeAuthor = (group: AuthorStatGroup): RawAuthorStat => (
  [...group.variants].sort((left, right) => (
    right.bookmarkKeys.size - left.bookmarkKeys.size
    || left.extractedBookmarkKeys.size - right.extractedBookmarkKeys.size
    || left.author.length - right.author.length
    || left.author.localeCompare(right.author)
  ))[0]
);

const toBookmarkAuthorStat = (
  group: AuthorStatGroup,
  favoritesByKey: Map<string, ScraperAuthorFavoriteRecord>,
  favoriteNamesByKey: Map<string, string>,
): BookmarkAuthorStat => {
  const representative = getRepresentativeAuthor(group);
  const favoriteName = Array.from(group.favoriteKeys)
    .map((favoriteKey) => favoriteNamesByKey.get(favoriteKey) ?? "")
    .find(Boolean);
  const representativeCover = Array.from(representative.coversByBookmarkKey.values())[0]
    ?? Array.from(group.coversByBookmarkKey.values())[0];
  const referenceSourcesByKey = new Map(group.referenceSourcesByKey);
  Array.from(group.favoriteKeys)
    .flatMap((favoriteKey) => favoritesByKey.get(favoriteKey)?.sources ?? [])
    .forEach((source) => {
      const sourceKey = `${source.scraperId}::${source.authorUrl}`;
      if (!referenceSourcesByKey.has(sourceKey)) {
        referenceSourcesByKey.set(sourceKey, {
          scraperId: source.scraperId,
          authorUrl: source.authorUrl,
          name: source.name,
          templateContext: source.templateContext ?? undefined,
        });
      }
    });

  return {
    author: favoriteName || representative.author,
    count: group.bookmarkKeys.size,
    cover: representativeCover?.cover,
    coverRefererUrl: representativeCover?.refererUrl,
    coverTitle: representativeCover?.title,
    favoriteName,
    filterValue: representative.author,
    scraperIds: Array.from(group.scraperIds).sort((left, right) => left.localeCompare(right)),
    referenceSources: Array.from(referenceSourcesByKey.values()),
    variants: [...group.variants]
      .sort((left, right) => (
        right.bookmarkKeys.size - left.bookmarkKeys.size
        || left.author.localeCompare(right.author)
      ))
      .map((variant) => ({
        author: variant.author,
        count: variant.bookmarkKeys.size,
        extractedCount: variant.extractedBookmarkKeys.size,
        scraperIds: Array.from(variant.scraperIds).sort((left, right) => left.localeCompare(right)),
      })),
  };
};

export const buildBookmarkAuthorStats = (
  bookmarks: ScraperBookmarkRecord[],
  options: {
    minOccurrences: number;
    configsByScraperId: ScraperTitleAnalysisConfigs;
    authorFavorites?: readonly ScraperAuthorFavoriteRecord[] | null;
    compatibilityCache?: BookmarkAuthorCompatibilityCache;
  },
): BookmarkAuthorStat[] => {
  const candidateSources = bookmarks.map((bookmark) => ({
    authorNames: bookmark.authors,
    authorUrls: bookmark.authorUrls,
    bookmarkKey: getBookmarkAuthorStatsKey(bookmark),
    candidates: getBookmarkAuthorCandidates(bookmark, options.configsByScraperId),
    cover: bookmark.cover,
    coverRefererUrl: bookmark.sourceUrl,
    coverTitle: bookmark.title,
    scraperId: bookmark.scraperId,
  }));

  return buildBookmarkAuthorStatsFromCandidates(candidateSources, options);
};

export const buildBookmarkAuthorStatsFromCandidates = (
  candidateSources: Iterable<BookmarkAuthorCandidateSource>,
  options: {
    minOccurrences: number;
    authorFavorites?: readonly ScraperAuthorFavoriteRecord[] | null;
    compatibilityCache?: BookmarkAuthorCompatibilityCache;
  },
): BookmarkAuthorStat[] => {
  const minOccurrences = Math.max(1, Math.floor(options.minOccurrences));
  const favoriteIndex = buildAuthorFavoriteIndex(options.authorFavorites);

  return createAuthorStatGroups(createRawAuthorStats(
    candidateSources,
    favoriteIndex.matchesBySourceName,
  ), options.compatibilityCache)
    .map((group) => toBookmarkAuthorStat(
      group,
      favoriteIndex.favoritesByKey,
      favoriteIndex.namesByKey,
    ))
    .filter((stat) => stat.count >= minOccurrences)
    .sort((left, right) => (
      right.count - left.count
      || left.author.localeCompare(right.author)
    ));
};
