import type {
  MangaCorrespondenceBackgroundResult,
  MangaCorrespondenceMatch,
} from "@/renderer/backgroundSearch/types";
import { isClearlyDerivativeMangaCorrespondenceTitle } from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";
import { getInvalidatedMangaCorrespondenceResultKeys } from "@/renderer/backgroundSearch/mangaCorrespondenceResultDecisions";
import { buildMangaChapterCard } from "@/renderer/components/ChapterGroups/mangaChapterCard";
import { resolveMangaCorrespondenceChapterGroups } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceChapterGroups";
import { getEffectiveMangaCorrespondenceMatches } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceRejectedReview";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import type { MultiSearchMergeOptions, MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import type { MangaCorrespondenceBackgroundInput } from "@/shared/backgroundSearch";
import type { AuthorSeriesGroup } from "@/renderer/components/ScraperAuthorFavorites/authorSeriesGroups";
import {
  compareMangaCorrespondenceChapters,
  groupMangaCorrespondenceChapters,
} from "@/renderer/utils/mangaCorrespondenceChapter";

export type AuthorSeriesCorrespondenceSnapshot = {
  input: MangaCorrespondenceBackgroundInput;
  result: MangaCorrespondenceBackgroundResult;
};

export const buildAuthorSeriesPrefilledCorrespondenceResult = (
  group: AuthorSeriesGroup,
): MangaCorrespondenceBackgroundResult => {
  const matchesByKey = new Map<string, MangaCorrespondenceMatch>();
  group.chapters.forEach(({ chapter, result }) => {
    result.sources.forEach((source) => {
      const key = buildMultiSearchSourceIdentityKey(source);
      matchesByKey.set(key, {
        key,
        source,
        analyzedTitle: group.title,
        alternativeTitles: [],
        authors: Array.from(new Set([
          ...(source.result.authorNames ?? []),
          ...(source.contextualAuthorNames ?? []),
          ...source.tentativeAuthorNames,
        ])),
        chapter: chapter === "Non renseigné" ? undefined : chapter,
        matchedTerm: group.title,
        discoveredByStepIds: [],
        acceptedManually: true,
      });
    });
  });

  return {
    request: "otherChapters",
    matches: Array.from(matchesByKey.values()),
    rejectedCandidates: [],
    rejectedCandidateCount: 0,
    passNumber: 1,
    trace: [],
    searchedTitles: [],
    searchedAuthors: [],
  };
};

type ChapterSourceEntry = {
  chapter: string;
  source: MultiSearchSourceResult;
};

const collectCandidateSourcesByKey = (
  result: MangaCorrespondenceBackgroundResult,
): Map<string, MultiSearchSourceResult> => new Map([
  ...(result.matches ?? []).map((match) => [match.key, match.source] as const),
  ...(result.rejectedCandidates ?? []).map((candidate) => [candidate.key, candidate.source] as const),
]);

const getActiveMatches = (
  snapshot: AuthorSeriesCorrespondenceSnapshot,
): MangaCorrespondenceMatch[] => {
  const invalidatedKeys = getInvalidatedMangaCorrespondenceResultKeys(snapshot.result);
  return getEffectiveMangaCorrespondenceMatches(
    snapshot.result,
    snapshot.input.reference.title,
  ).filter((match) => (
    !invalidatedKeys.has(match.key)
    && !isClearlyDerivativeMangaCorrespondenceTitle(match.source.result.title)
  ));
};

const rebuildSeriesGroup = (
  group: AuthorSeriesGroup,
  snapshot: AuthorSeriesCorrespondenceSnapshot,
  mergeOptions: MultiSearchMergeOptions,
): AuthorSeriesGroup => {
  const activeMatches = getActiveMatches(snapshot);
  const activeSourceKeys = new Set(activeMatches.map((match) => (
    buildMultiSearchSourceIdentityKey(match.source)
  )));
  const candidatesByKey = collectCandidateSourcesByKey(snapshot.result);
  const invalidatedSourceKeys = new Set(
    Array.from(getInvalidatedMangaCorrespondenceResultKeys(snapshot.result)).flatMap((key) => {
      const source = candidatesByKey.get(key);
      return source ? [buildMultiSearchSourceIdentityKey(source)] : [];
    }),
  );
  const baseEntries: ChapterSourceEntry[] = group.chapters.flatMap((chapter) => (
    chapter.result.sources.flatMap((source) => {
      const sourceKey = buildMultiSearchSourceIdentityKey(source);
      return invalidatedSourceKeys.has(sourceKey) || activeSourceKeys.has(sourceKey)
        ? []
        : [{ chapter: chapter.chapter, source }];
    })
  ));
  const resolvedMatches = resolveMangaCorrespondenceChapterGroups(
    activeMatches,
    snapshot.input.reference,
  );
  const correspondenceEntries: ChapterSourceEntry[] = resolvedMatches.groups.flatMap((chapter) => (
    chapter.matches.map((match) => ({ chapter: chapter.chapter, source: match.source }))
  ));
  const chapterGroups = groupMangaCorrespondenceChapters(
    [...baseEntries, ...correspondenceEntries].map((entry) => ({
      chapter: entry.chapter,
      entry: entry.source,
    })),
  ).sort((left, right) => compareMangaCorrespondenceChapters(left.chapter, right.chapter));
  const chapters = chapterGroups.flatMap(({ chapter, entries }) => {
    const result = buildMangaChapterCard({
      chapter,
      fallbackTitle: snapshot.input.reference.title,
      idPrefix: group.id,
      mergeOptions,
      sources: entries,
    });
    return result ? [{ chapter, result }] : [];
  });

  return {
    ...group,
    title: snapshot.input.reference.title,
    reference: snapshot.input.reference,
    chapters,
    sourceCount: new Set(chapters.flatMap((chapter) => (
      chapter.result.sources.map(buildMultiSearchSourceIdentityKey)
    ))).size,
  };
};

export const applyAuthorSeriesCorrespondenceSnapshots = (
  groups: AuthorSeriesGroup[],
  snapshots: ReadonlyMap<string, AuthorSeriesCorrespondenceSnapshot>,
  mergeOptions: MultiSearchMergeOptions,
): AuthorSeriesGroup[] => groups.map((group) => {
  const snapshot = snapshots.get(group.id);
  return snapshot && group.kind === "series"
    ? rebuildSeriesGroup(group, snapshot, mergeOptions)
    : group;
});
