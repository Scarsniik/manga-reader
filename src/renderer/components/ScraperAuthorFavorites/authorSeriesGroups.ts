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
  groupMangaCorrespondenceChapters,
  inferMangaCorrespondenceFirstChapter,
} from "@/renderer/utils/mangaCorrespondenceChapter";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";

export type AuthorSeriesChapterGroup = {
  chapter: string;
  result: MultiSearchMergedResult;
};

export type AuthorSeriesGroup = {
  id: string;
  kind: "series" | "oneShots";
  title: string;
  aliases: string[];
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
  const chapter = assignment
    ? assignedChapter || UNKNOWN_CHAPTER
    : analysis.chapter
      ?? inferMangaCorrespondenceFirstChapter(analysis, seriesTitles)
      ?? UNKNOWN_CHAPTER;

  return {
    aliases: uniqueNormalizedTitles(effectiveSeriesTitles),
    chapter,
    chapterAliases: assignment ? [] : analysis.namedChapterAliases,
    hasExplicitChapter: assignment ? Boolean(assignedChapter) : Boolean(analysis.chapter),
    seriesTitles: effectiveSeriesTitles,
    seriesTitle: assignedSeriesTitle || analysis.title || source.result.title,
    source,
  };
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
): SeriesSourceCandidate[][] => {
  const candidates: SeriesSourceCandidate[] = [];
  const resultCandidateIndexes: number[][] = [];

  results.forEach((result) => {
    const indexes = result.sources.map((source) => {
      const index = candidates.length;
      candidates.push(analyzeSeriesSource(
        source,
        assignments.get(buildMultiSearchSourceIdentityKey(source)),
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

const buildSeriesGroup = (
  candidates: SeriesSourceCandidate[],
  mergeOptions: MultiSearchMergeOptions,
): BuiltAuthorSeriesGroup | null => {
  const sources = candidates.map((candidate) => candidate.source);
  const preferredSource = selectPreferredMultiSearchTitleSource(
    sources,
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
  const isOneShot = groupedChapters.length === 1
    && groupedChapters[0].entries.every((candidate) => !candidate.hasExplicitChapter);
  const chapters = groupedChapters
    .map((group) => ({
      ...group,
      chapter: isOneShot ? preferredCandidate.seriesTitle : group.chapter,
    }))
    .sort((left, right) => compareMangaCorrespondenceChapters(left.chapter, right.chapter))
    .flatMap(({ chapter, entries }) => {
      const result = buildMangaChapterCard({
        chapter,
        fallbackTitle: preferredCandidate.seriesTitle,
        idPrefix: id,
        mergeOptions,
        sources: entries.map((entry) => entry.source),
      });
      return result ? [{ chapter, result }] : [];
    });

  return {
    id,
    kind: "series",
    title: preferredCandidate.seriesTitle,
    aliases,
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
): AuthorSeriesGroup[] => {
  const builtGroups = groupSeriesCandidates(results, assignments).flatMap((candidates) => {
    const group = buildSeriesGroup(candidates, mergeOptions);
    return group ? [group] : [];
  });
  const oneShotGroup = buildOneShotGroup(builtGroups);
  return [
    ...builtGroups.filter((group) => !group.standalone),
    ...(oneShotGroup ? [oneShotGroup] : []),
  ].sort(compareSeriesGroups);
};
