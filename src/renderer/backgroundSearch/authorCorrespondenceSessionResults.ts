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
import { getMultiSearchSourceTitleMergeMatchKind } from "@/renderer/components/MultiSearch/multiSearchTitleMerge";
import {
  isUsableAuthorCorrespondenceAdvancedMangaSource,
  isUsableAuthorCorrespondenceAutomaticTitle,
} from "@/renderer/searchEngines/authorCorrespondenceAdvancedSelection";
import { normalizeCorrespondenceTitle } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
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

const buildAuthorCorrespondenceMergeOptions = (
  options: Partial<MultiSearchMergeOptions> | null | undefined,
): MultiSearchMergeOptions => ({
  ...(options ?? {}),
  enableRomajiPhoneticMerge: true,
  assumeSameAuthor: true,
  preferredTitleLanguageCodes: options?.preferredTitleLanguageCodes ?? [],
});

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

const getAuthorCorrespondenceSourceTitles = (source: MultiSearchSourceResult): string[] => {
  const analysis = analyzeMangaCorrespondenceTitle(
    source.result.title,
    getScraperTitleAnalysisFeatureConfig(getScraperFeature(source.scraper, "titleAnalysis")),
  );
  return [analysis.title, ...analysis.alternativeTitles];
};

const isUnderspecifiedAnchorSearchTerm = (
  anchorSources: MultiSearchSourceResult[],
  searchTerm: string,
): boolean => {
  if (isUsableAuthorCorrespondenceAutomaticTitle(searchTerm)) return false;
  const searchKey = normalizeCorrespondenceTitle(searchTerm);
  if (!searchKey) return false;

  return anchorSources.some((anchorSource) => getAuthorCorrespondenceSourceTitles(anchorSource)
    .map(normalizeCorrespondenceTitle)
    .some((anchorTitleKey) => (
      anchorTitleKey !== searchKey
      && ` ${anchorTitleKey} `.includes(` ${searchKey} `)
    )));
};

type EnrichmentSourceDisposition = "attach" | "discard" | "separate";

const resolveAuthorCorrespondenceEnrichmentSourceDisposition = (
  anchorSources: MultiSearchSourceResult[],
  source: MultiSearchSourceResult,
  mergeOptions: MultiSearchMergeOptions,
): EnrichmentSourceDisposition => {
  const matchesAnchorTitle = anchorSources.some((anchorSource) => (
    getMultiSearchSourceTitleMergeMatchKind(anchorSource, source, mergeOptions) !== null
  ));
  if (!matchesAnchorTitle && isUnderspecifiedAnchorSearchTerm(anchorSources, source.searchTerm)) {
    return "discard";
  }

  const sourceChapter = resolveAuthorCorrespondenceSourceChapter(source);
  if (!sourceChapter) {
    return "attach";
  }

  const anchorChapters = anchorSources
    .map(resolveAuthorCorrespondenceSourceChapter)
    .filter((chapter): chapter is string => Boolean(chapter));
  return !anchorChapters.length || anchorChapters.some((chapter) => (
    doMangaCorrespondenceChaptersOverlap(chapter, sourceChapter)
  )) ? "attach" : "separate";
};

const selectUsableAuthorCorrespondenceEnrichments = (
  authorSources: MultiSearchSourceResult[],
  enrichments: AuthorCorrespondenceMangaEnrichment[],
): AuthorCorrespondenceMangaEnrichment[] => {
  const authorSourcesByKey = new Map(authorSources.map((source) => [
    buildMultiSearchSourceIdentityKey(source),
    source,
  ]));
  return enrichments.filter((enrichment) => enrichment.anchorSourceKeys
    .map((sourceKey) => authorSourcesByKey.get(sourceKey))
    .filter((source): source is MultiSearchSourceResult => Boolean(source))
    .some((source) => isUsableAuthorCorrespondenceAdvancedMangaSource(source)));
};

export const collectAuthorCorrespondenceSessionSources = (
  authorSources: MultiSearchSourceResult[],
  enrichments: AuthorCorrespondenceMangaEnrichment[],
): MultiSearchSourceResult[] => {
  const sourcesByKey = new Map<string, MultiSearchSourceResult>();
  const usableEnrichments = selectUsableAuthorCorrespondenceEnrichments(authorSources, enrichments);
  const authorSourcesByKey = new Map(authorSources.map((source) => [
    buildMultiSearchSourceIdentityKey(source),
    source,
  ]));
  const mergeOptions = buildAuthorCorrespondenceMergeOptions(undefined);
  const usableEnrichmentSources = usableEnrichments.flatMap((enrichment) => {
    const anchorSources = enrichment.anchorSourceKeys
      .map((sourceKey) => authorSourcesByKey.get(sourceKey))
      .filter((source): source is MultiSearchSourceResult => Boolean(source));
    return enrichment.sources.filter((source) => (
      resolveAuthorCorrespondenceEnrichmentSourceDisposition(
        anchorSources,
        source,
        mergeOptions,
      ) !== "discard"
    ));
  });
  [...authorSources, ...usableEnrichmentSources].forEach((source) => {
    sourcesByKey.set(buildMultiSearchSourceIdentityKey(source), source);
  });
  return Array.from(sourcesByKey.values());
};

export const mergeAuthorCorrespondenceSessionResults = (
  authorSources: MultiSearchSourceResult[],
  enrichments: AuthorCorrespondenceMangaEnrichment[],
  options: Partial<MultiSearchMergeOptions> | null | undefined,
): MultiSearchMergedResult[] => {
  const authorMergeOptions = buildAuthorCorrespondenceMergeOptions(options);
  const authorSourcesByKey = new Map(authorSources.map((source) => [
    buildMultiSearchSourceIdentityKey(source),
    source,
  ]));
  const usableEnrichments = selectUsableAuthorCorrespondenceEnrichments(authorSources, enrichments);
  const attachedEnrichmentSourceKeys = new Set<string>();
  usableEnrichments.forEach((enrichment) => {
    const anchorSources = enrichment.anchorSourceKeys
      .map((sourceKey) => authorSourcesByKey.get(sourceKey))
      .filter((source): source is MultiSearchSourceResult => Boolean(source));
    enrichment.sources.forEach((source) => {
      if (resolveAuthorCorrespondenceEnrichmentSourceDisposition(
        anchorSources,
        source,
        authorMergeOptions,
      ) === "attach") {
        attachedEnrichmentSourceKeys.add(buildMultiSearchSourceIdentityKey(source));
      }
    });
  });
  const baseSources = authorSources.filter((source) => (
    !attachedEnrichmentSourceKeys.has(buildMultiSearchSourceIdentityKey(source))
  ));
  const groups = cloneMergedResults(mergeMultiSearchResults(baseSources, authorMergeOptions));

  usableEnrichments.forEach((enrichment) => {
    const anchorKeys = new Set(enrichment.anchorSourceKeys);
    const targetGroup = groups.find((group) => group.sources.some((source) => (
      anchorKeys.has(buildMultiSearchSourceIdentityKey(source))
    )));
    if (!targetGroup) return;
    const anchorSources = enrichment.anchorSourceKeys
      .map((sourceKey) => authorSourcesByKey.get(sourceKey))
      .filter((source): source is MultiSearchSourceResult => Boolean(source));
    enrichment.sources.forEach((source) => {
      const disposition = resolveAuthorCorrespondenceEnrichmentSourceDisposition(
        anchorSources,
        source,
        authorMergeOptions,
      );
      if (disposition === "attach") {
        appendMultiSearchSourceToGroup(targetGroup, source, authorMergeOptions);
        return;
      }

      if (
        disposition === "separate"
        && !authorSourcesByKey.has(buildMultiSearchSourceIdentityKey(source))
      ) {
        mergeMultiSearchSourceIntoGroups(groups, source, authorMergeOptions);
      }
    });
  });

  return sortMultiSearchMergedResults(groups);
};
