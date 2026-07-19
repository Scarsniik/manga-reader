import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { getMultiSearchSourceLanguageValues } from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";

const buildSingleSourceResultId = (source: MultiSearchSourceResult): string => (
  `multi-search::${buildMultiSearchSourceIdentityKey(source)}`
);

const buildSingleSourceResult = (source: MultiSearchSourceResult): MultiSearchMergedResult => ({
  id: buildSingleSourceResultId(source),
  title: source.result.title,
  coverUrl: source.result.thumbnailUrl,
  summary: source.result.summary,
  pageCount: source.result.pageCount,
  sources: [source],
  sourceLanguageCodes: getMultiSearchSourceLanguageValues(source),
  tentativeAuthorNames: source.tentativeAuthorNames,
  contentTypes: source.contentTypes,
});

export const applyManualMultiSearchSplits = (
  results: MultiSearchMergedResult[],
  splitResultIds: Set<string>,
): MultiSearchMergedResult[] => {
  if (!splitResultIds.size) {
    return results;
  }

  return results.flatMap((result) => (
    result.sources.length > 1 && splitResultIds.has(result.id)
      ? result.sources.map(buildSingleSourceResult)
      : [result]
  ));
};
