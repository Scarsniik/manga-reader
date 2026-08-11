import type { ScraperBookmarkRecord, ScraperRecord } from "@/shared/scraper";
import { enrichMatchableMangasWithJapaneseRomanization } from "@/renderer/utils/mangaMatching/advancedRomanization";
import {
  getMangaMergeMatchKind,
  normalizeMangaMergeOptions,
  type MangaMatchKind,
  type MangaMergeOptions,
  type MatchableManga,
} from "@/renderer/utils/mangaMatching/titleProfiles";
import {
  collectIndexedMangaMatchCandidates,
  createMangaMatchCandidateIndex,
} from "@/renderer/utils/mangaMatching/matchCandidateIndex";

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

const YIELD_EVERY_CANDIDATE_COMPARISONS = 5000;

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

const createParentIndex = (length: number): number[] => (
  Array.from({ length }, (_, index) => index)
);

const findParent = (parents: number[], index: number): number => {
  let current = index;
  while (parents[current] !== current) {
    parents[current] = parents[parents[current]];
    current = parents[current];
  }

  return current;
};

const unionParents = (parents: number[], left: number, right: number): void => {
  const leftParent = findParent(parents, left);
  const rightParent = findParent(parents, right);
  if (leftParent !== rightParent) {
    parents[rightParent] = leftParent;
  }
};

const yieldToUi = (): Promise<void> => (
  new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  })
);

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
  const parents = createParentIndex(enrichedMatchables.length);
  const matchKindsByRoot = new Map<number, Set<MangaMatchKind>>();
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

      if (matchKind) {
        unionParents(parents, leftIndex, rightIndex);
        const root = findParent(parents, leftIndex);
        const kinds = matchKindsByRoot.get(root) ?? new Set<MangaMatchKind>();
        kinds.add(matchKind);
        matchKindsByRoot.set(root, kinds);
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

  onProgress?.({ compared: totalComparisons, total: totalComparisons });

  const groupedIndices = new Map<number, number[]>();
  enrichedMatchables.forEach((_matchable, index) => {
    const root = findParent(parents, index);
    const indices = groupedIndices.get(root) ?? [];
    indices.push(index);
    groupedIndices.set(root, indices);
  });

  return Array.from(groupedIndices.entries())
    .filter(([, indices]) => indices.length > 1)
    .map(([root, indices]) => ({
      id: indices.map((index) => getBookmarkKey(enrichedMatchables[index].bookmark)).join("|"),
      matchKinds: Array.from(matchKindsByRoot.get(root) ?? []),
      bookmarks: indices.map((index) => enrichedMatchables[index].bookmark),
    }));
};
