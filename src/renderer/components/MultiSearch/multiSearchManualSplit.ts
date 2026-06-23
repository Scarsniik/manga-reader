import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import { getMultiSearchSourceLanguageValues } from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";

const buildSingleSourceResultId = (source: MultiSearchSourceResult): string => (
  `${source.scraper.id}::${normalizeScraperViewHistorySourceUrl(source.result.detailUrl) || source.result.title}`
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
