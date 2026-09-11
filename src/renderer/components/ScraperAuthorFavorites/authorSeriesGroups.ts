import { buildMangaChapterCard } from "@/renderer/components/ChapterGroups/mangaChapterCard";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import { selectPreferredMultiSearchTitleSource } from "@/renderer/components/MultiSearch/multiSearchTitleSelection";
import type {
  MangaCorrespondenceReference,
} from "@/shared/backgroundSearch";
import type {
  MultiSearchMergeOptions,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { normalizeFuzzyText } from "@/renderer/utils/fuzzyText";
import {
  compareMangaCorrespondenceChapters,
  describeMangaCorrespondenceChapter,
  doMangaCorrespondenceChaptersOverlap,
  groupMangaCorrespondenceChapters,
  inferMangaCorrespondenceFirstChapter,
} from "@/renderer/utils/mangaCorrespondenceChapter";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";
import type {
  AuthorSeriesSourceChapterCoverage,
} from "@/renderer/components/ScraperAuthorFavorites/authorSeriesChapterCoverage";
import {
  areVisualImagesEquivalent,
  type VisualImageFingerprint,
} from "@/shared/visualImageFingerprint";
import { haveSharedVisualTitleStem } from "@/renderer/utils/visualTitleMatching";

export type AuthorSeriesChapterGroup = {
  chapter: string;
  result: MultiSearchMergedResult;
};

export type AuthorSeriesGroup = {
  id: string;
  kind: "series" | "oneShots";
  title: string;
  aliases: string[];
  chapterCount: number;
  chapters: AuthorSeriesChapterGroup[];
  reference: MangaCorrespondenceReference;
  sourceCount: number;
};

export type AuthorSeriesAssignmentOverride = {
  seriesTitle: string;
  chapter: string;
};

type BuiltAuthorSeriesGroup = AuthorSeriesGroup & {
  standalone: boolean;
};

type SeriesSourceCandidate = {
  aliases: string[];
  chapter: string;
  chapterAliases: string[];
  hasExplicitChapter: boolean;
  hasNamedChapter: boolean;
  hasManualAssignment: boolean;
  seriesTitles: string[];
  seriesTitle: string;
  source: MultiSearchSourceResult;
};

const UNKNOWN_CHAPTER = "Non renseigné";
const ONE_SHOT_GROUP_ID = "author-series::one-shots";
const ONE_SHOT_GROUP_TITLE = "One Shot";

const uniqueNormalizedTitles = (values: string[]): string[] => Array.from(new Set(
  values.map(normalizeFuzzyText).filter(Boolean),
));

const analyzeSeriesSource = (
  source: MultiSearchSourceResult,
  assignment?: AuthorSeriesAssignmentOverride,
  chapterCoverage?: AuthorSeriesSourceChapterCoverage,
): SeriesSourceCandidate => {
  const titleAnalysisFeature = Array.isArray(source.scraper.features)
    ? getScraperFeature(source.scraper, "titleAnalysis")
    : null;
  const config = getScraperTitleAnalysisFeatureConfig(titleAnalysisFeature);
  const analysis = analyzeMangaCorrespondenceTitle(source.result.title, config);
  const romanizedAnalyses = (source.advancedRomanizedTitleVariants ?? []).map((title) => (
    analyzeMangaCorrespondenceTitle(title, config)
  ));
  const seriesTitles = [
    analysis.title,
    ...analysis.alternativeTitles,
    ...romanizedAnalyses.flatMap((entry) => [entry.title, ...entry.alternativeTitles]),
  ].filter(Boolean);
  const assignedSeriesTitle = assignment?.seriesTitle.trim();
  const effectiveSeriesTitles = assignedSeriesTitle ? [assignedSeriesTitle] : seriesTitles;
  const assignedChapter = assignment?.chapter.trim();
  const hasNamedChapter = !assignment
    && !chapterCoverage
    && analysis.chapterDetection?.source === "namedChapter";
  const chapter = assignment
    ? assignedChapter || UNKNOWN_CHAPTER
    : chapterCoverage?.chapter
      ?? analysis.chapter
      ?? inferMangaCorrespondenceFirstChapter(analysis, seriesTitles)
      ?? UNKNOWN_CHAPTER;

  return {
    aliases: uniqueNormalizedTitles(effectiveSeriesTitles),
    chapter,
    chapterAliases: assignment ? [] : analysis.namedChapterAliases,
    hasExplicitChapter: assignment
      ? Boolean(assignedChapter)
      : Boolean(chapterCoverage || (analysis.chapter && !hasNamedChapter)),
    hasNamedChapter,
    hasManualAssignment: Boolean(assignment),
    seriesTitles: effectiveSeriesTitles,
    seriesTitle: assignedSeriesTitle || analysis.title || source.result.title,
    source,
  };
};

const connectVisualCandidates = (
  candidates: SeriesSourceCandidate[],
  parents: number[],
  fingerprintsBySourceKey: ReadonlyMap<string, VisualImageFingerprint>,
): void => {
  const visualParents = candidates.map((_, index) => index);
  const getVisualRoot = (index: number): number => {
    while (visualParents[index] !== index) index = visualParents[index];
    return index;
  };
  const canConnectVisualChapters = (leftIndex: number, rightIndex: number): boolean => {
    const leftRoot = getVisualRoot(leftIndex);
    const rightRoot = getVisualRoot(rightIndex);
    const leftExplicitChapters = candidates.filter((candidate, index) => (
      getVisualRoot(index) === leftRoot && candidate.hasExplicitChapter
    ));
    const rightExplicitChapters = candidates.filter((candidate, index) => (
      getVisualRoot(index) === rightRoot && candidate.hasExplicitChapter
    ));
    return leftExplicitChapters.every((leftCandidate) => rightExplicitChapters.every((rightCandidate) => (
      doMangaCorrespondenceChaptersOverlap(leftCandidate.chapter, rightCandidate.chapter)
    )));
  };

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (left.hasManualAssignment) continue;
    const leftFingerprint = fingerprintsBySourceKey.get(
      buildMultiSearchSourceIdentityKey(left.source),
    );
    if (!leftFingerprint) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex];
      if (
        right.hasManualAssignment
        || !haveSharedVisualTitleStem(left.aliases, right.aliases)
      ) continue;
      const rightFingerprint = fingerprintsBySourceKey.get(
        buildMultiSearchSourceIdentityKey(right.source),
      );
      if (!rightFingerprint || !areVisualImagesEquivalent(leftFingerprint, rightFingerprint)) continue;

      connectCandidate(parents, leftIndex, rightIndex);
      if (canConnectVisualChapters(leftIndex, rightIndex)) {
        connectCandidate(visualParents, leftIndex, rightIndex);
      }
    }
  }

  const membersByRoot = new Map<number, number[]>();
  candidates.forEach((_, index) => {
    const root = getVisualRoot(index);
    membersByRoot.set(root, [...(membersByRoot.get(root) ?? []), index]);
  });
  membersByRoot.forEach((indexes, root) => {
    if (indexes.length < 2) return;
    const visualAlias = `visual match ${root}`;
    indexes.forEach((index) => candidates[index].chapterAliases.push(visualAlias));
  });
};

const connectCandidate = (parents: number[], leftIndex: number, rightIndex: number): void => {
  const findRoot = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const parent = parents[index];
      parents[index] = root;
      index = parent;
    }
    return root;
  };

  const leftRoot = findRoot(leftIndex);
  const rightRoot = findRoot(rightIndex);
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
};

const groupSeriesCandidates = (
  results: MultiSearchMergedResult[],
  assignments: ReadonlyMap<string, AuthorSeriesAssignmentOverride>,
  chapterCoverages: ReadonlyMap<string, AuthorSeriesSourceChapterCoverage>,
  fingerprintsBySourceKey: ReadonlyMap<string, VisualImageFingerprint>,
): SeriesSourceCandidate[][] => {
  const candidates: SeriesSourceCandidate[] = [];
  const resultCandidateIndexes: number[][] = [];

  results.forEach((result) => {
    const indexes = result.sources.map((source) => {
      const index = candidates.length;
      candidates.push(analyzeSeriesSource(
        source,
        assignments.get(buildMultiSearchSourceIdentityKey(source)),
        chapterCoverages.get(buildMultiSearchSourceIdentityKey(source)),
      ));
      return index;
    });
    resultCandidateIndexes.push(indexes);
  });

  const parents = candidates.map((_, index) => index);
  const candidateIndexByAlias = new Map<string, number>();
  candidates.forEach((candidate, candidateIndex) => {
    candidate.aliases.forEach((alias) => {
      const matchingIndex = candidateIndexByAlias.get(alias);
      if (matchingIndex === undefined) {
        candidateIndexByAlias.set(alias, candidateIndex);
      } else {
        connectCandidate(parents, candidateIndex, matchingIndex);
      }
    });
  });
  resultCandidateIndexes.forEach((indexes) => {
    const firstIndex = indexes[0];
    if (firstIndex === undefined) return;
    indexes.slice(1).forEach((index) => connectCandidate(parents, firstIndex, index));
  });
  connectVisualCandidates(candidates, parents, fingerprintsBySourceKey);

  const getRoot = (index: number): number => {
    while (parents[index] !== index) index = parents[index];
    return index;
  };
  const groups = new Map<number, SeriesSourceCandidate[]>();
  candidates.forEach((candidate, index) => {
    const root = getRoot(index);
    groups.set(root, [...(groups.get(root) ?? []), candidate]);
  });
  return Array.from(groups.values());
};

export const countAuthorSeriesChapters = (chapters: string[]): number => {
  const integerIntervals: Array<{ start: number; end: number }> = [];
  const otherChapterKeys = new Set<string>();

  chapters.forEach((chapter) => {
    const descriptor = describeMangaCorrespondenceChapter(chapter);
    if (
      descriptor.kind !== "other"
      && Number.isSafeInteger(descriptor.start)
      && Number.isSafeInteger(descriptor.end)
      && descriptor.end >= descriptor.start
      && descriptor.end - descriptor.start < 10_000
    ) {
      integerIntervals.push({ start: descriptor.start, end: descriptor.end });
      return;
    }

    otherChapterKeys.add(descriptor.value.toLocaleLowerCase());
  });

  integerIntervals.sort((left, right) => left.start - right.start || left.end - right.end);
  const mergedIntervals: Array<{ start: number; end: number }> = [];
  integerIntervals.forEach((interval) => {
    const previous = mergedIntervals[mergedIntervals.length - 1];
    if (!previous || interval.start > previous.end + 1) {
      mergedIntervals.push({ ...interval });
      return;
    }

    previous.end = Math.max(previous.end, interval.end);
  });

  return otherChapterKeys.size + mergedIntervals.reduce((count, interval) => (
    count + interval.end - interval.start + 1
  ), 0);
};

const buildSeriesGroup = (
  candidates: SeriesSourceCandidate[],
  mergeOptions: MultiSearchMergeOptions,
): BuiltAuthorSeriesGroup | null => {
  const sources = candidates.map((candidate) => candidate.source);
  const explicitChapterSources = candidates
    .filter((candidate) => candidate.hasExplicitChapter)
    .map((candidate) => candidate.source);
  const preferredSource = selectPreferredMultiSearchTitleSource(
    explicitChapterSources.length ? explicitChapterSources : sources,
    mergeOptions.preferredTitleLanguageCodes,
  ) ?? sources[0];
  if (!preferredSource) return null;

  const candidateBySourceKey = new Map(candidates.map((candidate) => [
    buildMultiSearchSourceIdentityKey(candidate.source),
    candidate,
  ]));
  const preferredCandidate = candidateBySourceKey.get(
    buildMultiSearchSourceIdentityKey(preferredSource),
  ) ?? candidates[0];
  const aliases = Array.from(new Set(candidates.flatMap((candidate) => candidate.aliases))).sort();
  const seriesKey = aliases[0] || normalizeFuzzyText(preferredCandidate.seriesTitle);
  const id = `author-series::${seriesKey}`;
  const groupedChapters = groupMangaCorrespondenceChapters(candidates.map((candidate) => ({
    aliases: candidate.chapterAliases,
    chapter: candidate.chapter,
    entry: candidate,
  })));
  const namedChapterGroupCount = groupMangaCorrespondenceChapters(
    candidates.filter((candidate) => candidate.hasNamedChapter).map((candidate) => ({
      aliases: candidate.chapterAliases,
      chapter: candidate.chapter,
      entry: candidate,
    })),
  ).length;
  const isOneShot = candidates.every((candidate) => !candidate.hasExplicitChapter)
    && namedChapterGroupCount <= 1;
  const cardChapterGroups = isOneShot
    ? [{ chapter: preferredCandidate.seriesTitle, entries: candidates }]
    : groupedChapters;
  const chapters = cardChapterGroups
    .sort((left, right) => compareMangaCorrespondenceChapters(left.chapter, right.chapter))
    .flatMap(({ chapter, entries }) => {
      const result = buildMangaChapterCard({
        chapter,
        fallbackTitle: preferredCandidate.seriesTitle,
        idPrefix: id,
        mergeOptions,
        sources: entries.map((entry) => entry.source),
      });
      if (!result) return [];

      return [{ chapter, result }];
    });

  return {
    id,
    kind: "series",
    title: preferredCandidate.seriesTitle,
    aliases,
    chapterCount: countAuthorSeriesChapters(chapters.map((chapter) => chapter.chapter)),
    chapters,
    reference: {
      scraperId: preferredSource.scraper.id,
      sourceUrl: preferredSource.result.detailUrl ?? preferredSource.scraper.baseUrl,
      rawTitle: preferredSource.result.title,
      title: preferredCandidate.seriesTitle,
      alternativeTitles: Array.from(new Set(candidates.flatMap((candidate) => (
        candidate.seriesTitles.filter((title) => title !== preferredCandidate.seriesTitle)
      )))),
      authors: Array.from(new Set([
        ...(preferredSource.result.authorNames ?? []),
        ...(preferredSource.contextualAuthorNames ?? []),
        ...preferredSource.tentativeAuthorNames,
      ])),
      authorUrls: preferredSource.result.authorUrls?.length
        ? preferredSource.result.authorUrls
        : preferredSource.result.authorUrl
          ? [preferredSource.result.authorUrl]
          : [],
      chapter: preferredCandidate.chapter === UNKNOWN_CHAPTER
        ? undefined
        : preferredCandidate.chapter,
    },
    sourceCount: new Set(sources.map(buildMultiSearchSourceIdentityKey)).size,
    standalone: isOneShot,
  };
};

const compareSeriesGroups = (left: AuthorSeriesGroup, right: AuthorSeriesGroup): number => (
  left.title.localeCompare(right.title, "fr", {
    numeric: true,
    sensitivity: "base",
  })
);

const buildOneShotGroup = (groups: BuiltAuthorSeriesGroup[]): AuthorSeriesGroup | null => {
  const oneShotGroups = groups.filter((group) => group.standalone);
  if (!oneShotGroups.length) return null;

  return {
    id: ONE_SHOT_GROUP_ID,
    kind: "oneShots",
    title: ONE_SHOT_GROUP_TITLE,
    aliases: Array.from(new Set(oneShotGroups.flatMap((group) => group.aliases))),
    chapterCount: oneShotGroups.reduce((count, group) => count + group.chapterCount, 0),
    chapters: oneShotGroups
      .flatMap((group) => group.chapters)
      .sort((left, right) => left.chapter.localeCompare(right.chapter, "fr", {
        numeric: true,
        sensitivity: "base",
      })),
    sourceCount: oneShotGroups.reduce((count, group) => count + group.sourceCount, 0),
    reference: oneShotGroups[0].reference,
  };
};

export const buildAuthorSeriesGroups = (
  results: MultiSearchMergedResult[],
  mergeOptions: MultiSearchMergeOptions,
  assignments: ReadonlyMap<string, AuthorSeriesAssignmentOverride> = new Map(),
  chapterCoverages: ReadonlyMap<string, AuthorSeriesSourceChapterCoverage> = new Map(),
  fingerprintsBySourceKey: ReadonlyMap<string, VisualImageFingerprint> = new Map(),
): AuthorSeriesGroup[] => {
  const builtGroups = groupSeriesCandidates(
    results,
    assignments,
    chapterCoverages,
    fingerprintsBySourceKey,
  ).flatMap((candidates) => {
    const group = buildSeriesGroup(candidates, mergeOptions);
    return group ? [group] : [];
  });
  const oneShotGroup = buildOneShotGroup(builtGroups);
  return [
    ...builtGroups.filter((group) => !group.standalone),
    ...(oneShotGroup ? [oneShotGroup] : []),
  ].sort(compareSeriesGroups);
};
