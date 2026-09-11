import type { ScraperBookmarkRecord, ScraperRecord } from "@/shared/scraper";
import { enrichMatchableMangasWithJapaneseRomanization } from "@/renderer/utils/mangaMatching/advancedRomanization";
import {
  findCompatibleMangaAuthorName,
  getMangaMergeMatchKind,
  getMangaTitleAlternatives,
  getMangaTitleMergeMatchKind,
  haveCompatibleMangaAuthors,
  normalizeMangaMergeOptions,
  type MangaMatchKind,
  type MangaMergeOptions,
  type MatchableManga,
} from "@/renderer/utils/mangaMatching/titleProfiles";
import {
  collectIndexedMangaMatchCandidates,
  createMangaMatchCandidateIndex,
} from "@/renderer/utils/mangaMatching/matchCandidateIndex";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";

type BookmarkMatchable = MatchableManga & {
  bookmark: ScraperBookmarkRecord;
  scraper: ScraperRecord | null;
};

export type ScraperBookmarkDuplicateGroup = {
  id: string;
  matchKinds: MangaMatchKind[];
  bookmarks: ScraperBookmarkRecord[];
};

export type ScraperBookmarkDuplicateDetectionProgress = {
  compared: number;
  total: number;
};

type FindScraperBookmarkDuplicateGroupsOptions = {
  bookmarks: ScraperBookmarkRecord[];
  scrapersById: Map<string, ScraperRecord>;
  mergeOptions?: Partial<MangaMergeOptions> | null;
  onProgress?: (progress: ScraperBookmarkDuplicateDetectionProgress) => void;
};

type BookmarkDuplicateMatch = {
  kind: MangaMatchKind;
  leftIndex: number;
  rightIndex: number;
};

const YIELD_EVERY_CANDIDATE_COMPARISONS = 5000;
const SPACED_ASCII_DASH_PATTERN = /\s+-\s+/gu;
const TRAILING_AUTHOR_SEPARATOR_PATTERN = /^(.*?)\s+[–—ー]\s+(.+?)\s*$/u;
const BOOKMARK_AUTHOR_ALIAS = "bookmark-compatible-author";

const normalizeText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const getBookmarkKey = (bookmark: ScraperBookmarkRecord): string => (
  `${bookmark.scraperId}::${bookmark.sourceUrl}`
);

const buildBookmarkMatchable = (
  bookmark: ScraperBookmarkRecord,
  scraper: ScraperRecord | null,
): BookmarkMatchable => ({
  bookmark,
  scraper,
  title: normalizeText(bookmark.title || bookmark.sourceUrl),
  sourceUrl: bookmark.sourceUrl,
  authorNames: bookmark.authors,
});

const getMatchPairKey = (leftIndex: number, rightIndex: number): string => (
  leftIndex < rightIndex ? `${leftIndex}:${rightIndex}` : `${rightIndex}:${leftIndex}`
);

const MATCH_KIND_PRIORITY: Record<MangaMatchKind, number> = {
  url: 5,
  base: 4,
  light: 3,
  heavy: 2,
  katakana: 1,
};

const buildCompleteLinkGroups = (matches: BookmarkDuplicateMatch[]): number[][] => {
  const matchKeys = new Set(matches.map((match) => (
    getMatchPairKey(match.leftIndex, match.rightIndex)
  )));
  const groups: number[][] = [];
  const groupByCandidateIndex = new Map<number, number[]>();
  const sortedMatches = [...matches].sort((left, right) => (
    MATCH_KIND_PRIORITY[right.kind] - MATCH_KIND_PRIORITY[left.kind]
  ));

  sortedMatches.forEach(({ leftIndex, rightIndex }) => {
    const leftGroup = groupByCandidateIndex.get(leftIndex);
    const rightGroup = groupByCandidateIndex.get(rightIndex);
    if (leftGroup === rightGroup && leftGroup) {
      return;
    }

    const leftMembers = leftGroup ?? [leftIndex];
    const rightMembers = rightGroup ?? [rightIndex];
    const canMerge = leftMembers.every((leftMember) => (
      rightMembers.every((rightMember) => matchKeys.has(getMatchPairKey(leftMember, rightMember)))
    ));
    if (!canMerge) {
      return;
    }

    const mergedGroup = [...leftMembers, ...rightMembers];
    if (leftGroup) groups.splice(groups.indexOf(leftGroup), 1);
    if (rightGroup) groups.splice(groups.indexOf(rightGroup), 1);
    groups.push(mergedGroup);
    mergedGroup.forEach((candidateIndex) => groupByCandidateIndex.set(candidateIndex, mergedGroup));
  });

  return groups;
};

const yieldToUi = (): Promise<void> => (
  new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  })
);

const stripTrailingAuthorAlternative = (matchable: BookmarkMatchable): BookmarkMatchable => {
  const match = matchable.title.match(TRAILING_AUTHOR_SEPARATOR_PATTERN);
  const title = match?.[1]?.trim() ?? "";
  const authorLabel = match?.[2]?.trim() ?? "";
  if (
    !title
    || !authorLabel
    || !findCompatibleMangaAuthorName(authorLabel, matchable.authorNames ?? [])
  ) {
    return matchable;
  }

  return {
    ...matchable,
    title,
  };
};

const buildAuthorAliasMatchable = (matchable: BookmarkMatchable): BookmarkMatchable => ({
  ...matchable,
  authorNames: [BOOKMARK_AUTHOR_ALIAS],
  contextualAuthorNames: [],
  advancedRomanizedAuthorNameVariants: [],
  advancedRomanizedContextualAuthorNameVariants: [],
});

const isAuthorAlternativeOnlyMatch = (
  left: BookmarkMatchable,
  right: BookmarkMatchable,
  options: MangaMergeOptions,
  useAuthorAlias = false,
): boolean => {
  const strippedLeft = stripTrailingAuthorAlternative(left);
  const strippedRight = stripTrailingAuthorAlternative(right);
  if (strippedLeft === left && strippedRight === right) {
    return false;
  }

  return !getMangaTitleMergeMatchKind(
    useAuthorAlias ? buildAuthorAliasMatchable(strippedLeft) : strippedLeft,
    useAuthorAlias ? buildAuthorAliasMatchable(strippedRight) : strippedRight,
    options,
  );
};

const getDashTitleAlternatives = (title: string): string[] => (
  getMangaTitleAlternatives(title.replace(SPACED_ASCII_DASH_PATTERN, " | "))
);

const doAllDashTitleAlternativesMatch = (
  left: BookmarkMatchable,
  right: BookmarkMatchable,
  options: MangaMergeOptions,
): boolean => {
  const leftAlternatives = getDashTitleAlternatives(left.title);
  const rightAlternatives = getDashTitleAlternatives(right.title);
  const allAlternativesMatch = (
    sourceAlternatives: string[],
    source: BookmarkMatchable,
    targetAlternatives: string[],
    target: BookmarkMatchable,
  ): boolean => sourceAlternatives.every((sourceTitle) => (
    targetAlternatives.some((targetTitle) => Boolean(getMangaTitleMergeMatchKind(
      { ...source, title: sourceTitle },
      { ...target, title: targetTitle },
      options,
    )))
  ));

  return allAlternativesMatch(leftAlternatives, left, rightAlternatives, right)
    && allAlternativesMatch(rightAlternatives, right, leftAlternatives, left);
};

const isSafeAuthorBackedDashMatch = (
  left: BookmarkMatchable,
  right: BookmarkMatchable,
  options: MangaMergeOptions,
): boolean => {
  if (
    analyzeMangaCorrespondenceTitle(left.title, undefined).sequenceMarkers.length
    || analyzeMangaCorrespondenceTitle(right.title, undefined).sequenceMarkers.length
  ) {
    return false;
  }

  const leftAlternatives = getDashTitleAlternatives(left.title);
  const rightAlternatives = getDashTitleAlternatives(right.title);
  if (leftAlternatives.length === 1 || rightAlternatives.length === 1) {
    return true;
  }

  return doAllDashTitleAlternativesMatch(left, right, options);
};

const collectAuthorAliasMatches = (
  matchables: BookmarkMatchable[],
  options: MangaMergeOptions,
  existingMatches: BookmarkDuplicateMatch[],
): BookmarkDuplicateMatch[] => {
  const authorAliasMatchables = matchables.map(buildAuthorAliasMatchable);
  const candidateIndex = createMangaMatchCandidateIndex(authorAliasMatchables, options);
  const matchedPairKeys = new Set(existingMatches.map((match) => (
    getMatchPairKey(match.leftIndex, match.rightIndex)
  )));
  const additionalMatches: BookmarkDuplicateMatch[] = [];

  authorAliasMatchables.forEach((left, leftIndex) => {
    collectIndexedMangaMatchCandidates(candidateIndex, left).forEach((right) => {
      const rightIndex = candidateIndex.candidateIndexes.get(right);
      if (rightIndex === undefined || rightIndex <= leftIndex) {
        return;
      }

      const pairKey = getMatchPairKey(leftIndex, rightIndex);
      if (
        matchedPairKeys.has(pairKey)
        || !haveCompatibleMangaAuthors(matchables[leftIndex], matchables[rightIndex], options)
        || isAuthorAlternativeOnlyMatch(matchables[leftIndex], matchables[rightIndex], options, true)
      ) {
        return;
      }

      const matchKind = getMangaTitleMergeMatchKind(left, right, options);
      if (!matchKind) {
        return;
      }

      matchedPairKeys.add(pairKey);
      additionalMatches.push({
        kind: matchKind,
        leftIndex,
        rightIndex,
      });
    });
  });

  return additionalMatches;
};

const collectAuthorBackedDashMatches = (
  matchables: BookmarkMatchable[],
  options: MangaMergeOptions,
  existingMatches: BookmarkDuplicateMatch[],
): BookmarkDuplicateMatch[] => {
  const authorAliasMatchables = matchables.map(buildAuthorAliasMatchable);
  const dashMatchables = authorAliasMatchables.map((matchable) => ({
    ...matchable,
    title: matchable.title.replace(SPACED_ASCII_DASH_PATTERN, " | "),
  }));
  const candidateIndex = createMangaMatchCandidateIndex(dashMatchables, options);
  const matchedPairKeys = new Set(existingMatches.map((match) => (
    getMatchPairKey(match.leftIndex, match.rightIndex)
  )));
  const additionalMatches: BookmarkDuplicateMatch[] = [];

  dashMatchables.forEach((left, leftIndex) => {
    collectIndexedMangaMatchCandidates(candidateIndex, left).forEach((right) => {
      const rightIndex = candidateIndex.candidateIndexes.get(right);
      if (rightIndex === undefined || rightIndex <= leftIndex) {
        return;
      }

      const pairKey = getMatchPairKey(leftIndex, rightIndex);
      if (
        matchedPairKeys.has(pairKey)
        || (left.title === matchables[leftIndex].title && right.title === matchables[rightIndex].title)
        || !haveCompatibleMangaAuthors(matchables[leftIndex], matchables[rightIndex], options)
        || isAuthorAlternativeOnlyMatch(matchables[leftIndex], matchables[rightIndex], options, true)
        || !isSafeAuthorBackedDashMatch(
          authorAliasMatchables[leftIndex],
          authorAliasMatchables[rightIndex],
          options,
        )
      ) {
        return;
      }

      const matchKind = getMangaTitleMergeMatchKind(left, right, options);
      if (!matchKind) {
        return;
      }

      matchedPairKeys.add(pairKey);
      additionalMatches.push({
        kind: matchKind,
        leftIndex,
        rightIndex,
      });
    });
  });

  return additionalMatches;
};

export const findScraperBookmarkDuplicateGroups = async ({
  bookmarks,
  scrapersById,
  mergeOptions,
  onProgress,
}: FindScraperBookmarkDuplicateGroupsOptions): Promise<ScraperBookmarkDuplicateGroup[]> => {
  const matchables = bookmarks
    .map((bookmark) => buildBookmarkMatchable(bookmark, scrapersById.get(bookmark.scraperId) ?? null))
    .filter((matchable) => matchable.title);
  const totalComparisons = Math.max(0, (matchables.length * (matchables.length - 1)) / 2);
  const options = normalizeMangaMergeOptions(mergeOptions);

  if (matchables.length < 2) {
    onProgress?.({ compared: 0, total: totalComparisons });
    return [];
  }

  const enrichedMatchables = await enrichMatchableMangasWithJapaneseRomanization(matchables);
  const candidateIndex = createMangaMatchCandidateIndex(enrichedMatchables, options);
  const matches: BookmarkDuplicateMatch[] = [];
  let comparedCandidates = 0;
  let reportedComparisons = 0;

  for (let leftIndex = 0; leftIndex < enrichedMatchables.length; leftIndex += 1) {
    const left = enrichedMatchables[leftIndex];
    const candidates = collectIndexedMangaMatchCandidates(candidateIndex, left)
      .filter((candidate) => (candidateIndex.candidateIndexes.get(candidate) ?? -1) > leftIndex);

    for (const right of candidates) {
      comparedCandidates += 1;
      const rightIndex = candidateIndex.candidateIndexes.get(right);
      if (rightIndex === undefined) {
        continue;
      }
      const matchKind = getMangaMergeMatchKind(left, right, options);

      if (matchKind && (
        matchKind === "url"
        || !isAuthorAlternativeOnlyMatch(left, right, options)
      )) {
        matches.push({
          kind: matchKind,
          leftIndex,
          rightIndex,
        });
      }

      if (comparedCandidates % YIELD_EVERY_CANDIDATE_COMPARISONS === 0) {
        reportedComparisons = totalComparisons - (
          ((enrichedMatchables.length - leftIndex - 1) * (enrichedMatchables.length - leftIndex - 2)) / 2
        );
        onProgress?.({ compared: reportedComparisons, total: totalComparisons });
        await yieldToUi();
      }
    }
  }

  matches.push(...collectAuthorAliasMatches(enrichedMatchables, options, matches));
  matches.push(...collectAuthorBackedDashMatches(enrichedMatchables, options, matches));
  onProgress?.({ compared: totalComparisons, total: totalComparisons });

  const matchKindByPair = new Map(matches.map((match) => [
    getMatchPairKey(match.leftIndex, match.rightIndex),
    match.kind,
  ]));

  return buildCompleteLinkGroups(matches)
    .map((indices) => ({
      id: indices.map((index) => getBookmarkKey(enrichedMatchables[index].bookmark)).join("|"),
      matchKinds: Array.from(new Set(indices.flatMap((leftIndex, groupIndex) => (
        indices.slice(groupIndex + 1)
          .map((rightIndex) => matchKindByPair.get(getMatchPairKey(leftIndex, rightIndex)))
          .filter((kind): kind is MangaMatchKind => Boolean(kind))
      )))),
      bookmarks: indices.map((index) => enrichedMatchables[index].bookmark),
    }));
};
