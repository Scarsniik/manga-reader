import type { AuthorCorrespondenceMangaEnrichment } from "@/renderer/backgroundSearch/authorCorrespondenceSessionCache";
import {
  appendMultiSearchSourceToGroup,
  buildMultiSearchSourceIdentityKey,
  mergeMultiSearchSourceIntoGroups,
  mergeMultiSearchResults,
  sortMultiSearchMergedResults,
} from "@/renderer/components/MultiSearch/multiSearchMerge";
import type {
  MultiSearchMergeOptions,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
import {
  doMangaCorrespondenceChaptersOverlap,
  inferMangaCorrespondenceFirstChapter,
} from "@/renderer/utils/mangaCorrespondenceChapter";
import {
  getScraperFeature,
  getScraperTitleAnalysisFeatureConfig,
} from "@/renderer/utils/scraperRuntime";

const cloneMergedResults = (results: MultiSearchMergedResult[]): MultiSearchMergedResult[] => (
  results.map((result) => ({
    ...result,
    sources: [...result.sources],
    sourceLanguageCodes: [...result.sourceLanguageCodes],
    tentativeAuthorNames: [...result.tentativeAuthorNames],
    contentTypes: [...result.contentTypes],
  }))
);

const resolveAuthorCorrespondenceSourceChapter = (
  source: MultiSearchSourceResult,
): string | undefined => {
  const analysis = analyzeMangaCorrespondenceTitle(
    source.result.title,
    getScraperTitleAnalysisFeatureConfig(getScraperFeature(source.scraper, "titleAnalysis")),
  );
  return analysis.chapter ?? inferMangaCorrespondenceFirstChapter(
    analysis,
    [analysis.title, ...analysis.alternativeTitles],
  );
};

const canAttachAuthorCorrespondenceEnrichmentSource = (
  anchorSources: MultiSearchSourceResult[],
  source: MultiSearchSourceResult,
): boolean => {
  const sourceChapter = resolveAuthorCorrespondenceSourceChapter(source);
  if (!sourceChapter) {
    return true;
  }

  const anchorChapters = anchorSources
    .map(resolveAuthorCorrespondenceSourceChapter)
    .filter((chapter): chapter is string => Boolean(chapter));
  return !anchorChapters.length || anchorChapters.some((chapter) => (
    doMangaCorrespondenceChaptersOverlap(chapter, sourceChapter)
  ));
};

export const collectAuthorCorrespondenceSessionSources = (
  authorSources: MultiSearchSourceResult[],
  enrichments: AuthorCorrespondenceMangaEnrichment[],
): MultiSearchSourceResult[] => {
  const sourcesByKey = new Map<string, MultiSearchSourceResult>();
  [...authorSources, ...enrichments.flatMap((enrichment) => enrichment.sources)].forEach((source) => {
    sourcesByKey.set(buildMultiSearchSourceIdentityKey(source), source);
  });
  return Array.from(sourcesByKey.values());
};

export const mergeAuthorCorrespondenceSessionResults = (
  authorSources: MultiSearchSourceResult[],
  enrichments: AuthorCorrespondenceMangaEnrichment[],
  options: Partial<MultiSearchMergeOptions> | null | undefined,
): MultiSearchMergedResult[] => {
  const authorMergeOptions: Partial<MultiSearchMergeOptions> = {
    ...(options ?? {}),
    enableRomajiPhoneticMerge: true,
    assumeSameAuthor: true,
  };
  const authorSourcesByKey = new Map(authorSources.map((source) => [
    buildMultiSearchSourceIdentityKey(source),
    source,
  ]));
  const attachedEnrichmentSourceKeys = new Set<string>();
  enrichments.forEach((enrichment) => {
    const anchorSources = enrichment.anchorSourceKeys
      .map((sourceKey) => authorSourcesByKey.get(sourceKey))
      .filter((source): source is MultiSearchSourceResult => Boolean(source));
    enrichment.sources.forEach((source) => {
      if (canAttachAuthorCorrespondenceEnrichmentSource(anchorSources, source)) {
        attachedEnrichmentSourceKeys.add(buildMultiSearchSourceIdentityKey(source));
      }
    });
  });
  const baseSources = authorSources.filter((source) => (
    !attachedEnrichmentSourceKeys.has(buildMultiSearchSourceIdentityKey(source))
  ));
  const groups = cloneMergedResults(mergeMultiSearchResults(baseSources, authorMergeOptions));

  enrichments.forEach((enrichment) => {
    const anchorKeys = new Set(enrichment.anchorSourceKeys);
    const targetGroup = groups.find((group) => group.sources.some((source) => (
      anchorKeys.has(buildMultiSearchSourceIdentityKey(source))
    )));
    if (!targetGroup) return;
    const anchorSources = enrichment.anchorSourceKeys
      .map((sourceKey) => authorSourcesByKey.get(sourceKey))
      .filter((source): source is MultiSearchSourceResult => Boolean(source));
    enrichment.sources.forEach((source) => {
      if (canAttachAuthorCorrespondenceEnrichmentSource(anchorSources, source)) {
        appendMultiSearchSourceToGroup(targetGroup, source, authorMergeOptions);
        return;
      }

      if (!authorSourcesByKey.has(buildMultiSearchSourceIdentityKey(source))) {
        mergeMultiSearchSourceIntoGroups(groups, source, authorMergeOptions);
      }
    });
  });

  return sortMultiSearchMergedResults(groups);
};
