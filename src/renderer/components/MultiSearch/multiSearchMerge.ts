import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import {
  canMergeMultiSearchSourceTitles,
} from "@/renderer/components/MultiSearch/multiSearchTitleMerge";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchConstants";

const shouldMergeSourceIntoGroup = (
  source: MultiSearchSourceResult,
  group: MultiSearchMergedResult,
): boolean => {
  return group.sources.some((groupSource) => {
    if (source.result.detailUrl && groupSource.result.detailUrl === source.result.detailUrl) {
      return true;
    }

    return canMergeMultiSearchSourceTitles(source, groupSource);
  });
};

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const getSourceLanguageValuesForMerge = (source: MultiSearchSourceResult): string[] => (
  source.sourceLanguageCodes.length ? source.sourceLanguageCodes : [UNKNOWN_MULTI_SEARCH_VALUE]
);

const buildMergedResultId = (source: MultiSearchSourceResult): string => (
  `${source.scraper.id}::${source.result.detailUrl || source.result.title}`
);

export const mergeMultiSearchSourceIntoGroups = (
  groups: MultiSearchMergedResult[],
  source: MultiSearchSourceResult,
): void => {
  const group = groups.find((candidate) => shouldMergeSourceIntoGroup(source, candidate));

  if (group) {
    group.sources.push(source);
    group.sourceLanguageCodes = uniqueValues([
      ...group.sourceLanguageCodes,
      ...getSourceLanguageValuesForMerge(source),
    ]);
    group.tentativeAuthorNames = uniqueValues([
      ...group.tentativeAuthorNames,
      ...source.tentativeAuthorNames,
    ]);
    group.contentTypes = uniqueValues([
      ...group.contentTypes,
      ...source.contentTypes,
    ]);
    if (!group.coverUrl && source.result.thumbnailUrl) {
      group.coverUrl = source.result.thumbnailUrl;
    }
    if (!group.summary && source.result.summary) {
      group.summary = source.result.summary;
    }
    if (!group.pageCount && source.result.pageCount) {
      group.pageCount = source.result.pageCount;
    }
    return;
  }

  groups.push({
    id: buildMergedResultId(source),
    title: source.result.title,
    coverUrl: source.result.thumbnailUrl,
    summary: source.result.summary,
    pageCount: source.result.pageCount,
    sources: [source],
    sourceLanguageCodes: uniqueValues(getSourceLanguageValuesForMerge(source)),
    tentativeAuthorNames: uniqueValues(source.tentativeAuthorNames),
    contentTypes: uniqueValues(source.contentTypes),
  });
};

export const sortMultiSearchMergedResults = (
  groups: MultiSearchMergedResult[],
): MultiSearchMergedResult[] => (
  [...groups].sort((left, right) => {
    const sourceCountCompare = right.sources.length - left.sources.length;
    if (sourceCountCompare !== 0) {
      return sourceCountCompare;
    }

    return left.title.localeCompare(right.title);
  })
);

export const mergeMultiSearchResults = (
  sources: MultiSearchSourceResult[],
): MultiSearchMergedResult[] => {
  const groups: MultiSearchMergedResult[] = [];

  sources.forEach((source) => mergeMultiSearchSourceIntoGroups(groups, source));
  return sortMultiSearchMergedResults(groups);
};
