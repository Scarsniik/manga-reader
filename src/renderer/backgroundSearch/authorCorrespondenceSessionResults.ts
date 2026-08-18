import type { AuthorCorrespondenceMangaEnrichment } from "@/renderer/backgroundSearch/authorCorrespondenceSessionCache";
import {
  appendMultiSearchSourceToGroup,
  buildMultiSearchSourceIdentityKey,
  mergeMultiSearchResults,
  sortMultiSearchMergedResults,
} from "@/renderer/components/MultiSearch/multiSearchMerge";
import type {
  MultiSearchMergeOptions,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

const cloneMergedResults = (results: MultiSearchMergedResult[]): MultiSearchMergedResult[] => (
  results.map((result) => ({
    ...result,
    sources: [...result.sources],
    sourceLanguageCodes: [...result.sourceLanguageCodes],
    tentativeAuthorNames: [...result.tentativeAuthorNames],
    contentTypes: [...result.contentTypes],
  }))
);

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
  const enrichmentSourceKeys = new Set(enrichments.flatMap((enrichment) => (
    enrichment.sources.map(buildMultiSearchSourceIdentityKey)
  )));
  const baseSources = authorSources.filter((source) => (
    !enrichmentSourceKeys.has(buildMultiSearchSourceIdentityKey(source))
  ));
  const groups = cloneMergedResults(mergeMultiSearchResults(baseSources, options));

  enrichments.forEach((enrichment) => {
    const anchorKeys = new Set(enrichment.anchorSourceKeys);
    const targetGroup = groups.find((group) => group.sources.some((source) => (
      anchorKeys.has(buildMultiSearchSourceIdentityKey(source))
    )));
    if (!targetGroup) return;
    enrichment.sources.forEach((source) => {
      appendMultiSearchSourceToGroup(targetGroup, source, options);
    });
  });

  return sortMultiSearchMergedResults(groups);
};
