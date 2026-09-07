import type { MangaCorrespondenceMatch } from "@/renderer/backgroundSearch/types";
import type { MangaCorrespondenceReference } from "@/shared/backgroundSearch";
import { stripMangaCorrespondenceTrailingKnownAuthor } from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";
import {
  compareMangaCorrespondenceChapters,
  groupMangaCorrespondenceChapters,
  inferMangaCorrespondenceFirstChapter,
  resolveMangaCorrespondenceMatchChapter,
} from "@/renderer/utils/mangaCorrespondenceChapter";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";

export type MangaCorrespondenceMatchChapterResolution = {
  aliases: string[];
  detectedChapter: string;
  effectiveChapter: string;
  detection: ReturnType<typeof analyzeMangaCorrespondenceTitle>["chapterDetection"];
};

export type MangaCorrespondenceChapterMatchGroup = {
  chapter: string;
  matches: MangaCorrespondenceMatch[];
};

export const resolveMangaCorrespondenceChapterGroups = (
  matches: MangaCorrespondenceMatch[],
  reference?: MangaCorrespondenceReference,
): {
  groups: MangaCorrespondenceChapterMatchGroup[];
  resolutionByMatchKey: Map<string, MangaCorrespondenceMatchChapterResolution>;
} => {
  const resolutionByMatchKey = new Map<string, MangaCorrespondenceMatchChapterResolution>();
  matches.forEach((match) => {
    const titleAnalysis = analyzeMangaCorrespondenceTitle(
      stripMangaCorrespondenceTrailingKnownAuthor(
        match.source.result.title,
        reference?.authors ?? [],
      ),
      getScraperTitleAnalysisFeatureConfig(getScraperFeature(match.source.scraper, "titleAnalysis")),
    );
    const inferredFirstChapter = inferMangaCorrespondenceFirstChapter(titleAnalysis, [
      match.matchedTerm,
      reference?.title ?? "",
      ...(reference?.alternativeTitles ?? []),
    ]);
    const preferAnalyzedChapter = titleAnalysis.chapterDetection?.source === "compoundTitle"
      || titleAnalysis.chapterDetection?.source === "explicitVolume";
    const detectedChapter = resolveMangaCorrespondenceMatchChapter(
      match.chapter,
      titleAnalysis.chapter,
      inferredFirstChapter,
      match.acceptedManually,
      undefined,
      preferAnalyzedChapter,
    );
    resolutionByMatchKey.set(match.key, {
      aliases: match.chapterOverride ? [] : titleAnalysis.namedChapterAliases,
      detectedChapter,
      effectiveChapter: resolveMangaCorrespondenceMatchChapter(
        match.chapter,
        titleAnalysis.chapter,
        inferredFirstChapter,
        match.acceptedManually,
        match.chapterOverride?.value,
        preferAnalyzedChapter,
      ),
      detection: titleAnalysis.chapterDetection,
    });
  });

  const groups = groupMangaCorrespondenceChapters(matches.map((match) => {
    const resolution = resolutionByMatchKey.get(match.key);
    return {
      aliases: resolution?.aliases,
      chapter: resolution?.effectiveChapter ?? "Non renseigné",
      entry: match,
    };
  }))
    .sort((left, right) => compareMangaCorrespondenceChapters(left.chapter, right.chapter))
    .map(({ chapter, entries }) => ({ chapter, matches: entries }));

  return { groups, resolutionByMatchKey };
};
