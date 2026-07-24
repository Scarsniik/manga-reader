import { parseMultiSearchTerms } from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchMergedResult,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { selectPreferredMultiSearchTitleSource } from "@/renderer/components/MultiSearch/multiSearchTitleSelection";

export const uniqueMultiSearchFilterValues = (values: string[]): string[] => {
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

const getFirstSourceValue = (
  sources: MultiSearchSourceResult[],
  getValue: (source: MultiSearchSourceResult) => string | undefined,
): string | undefined => (
  sources.map(getValue).find((value): value is string => Boolean(value))
);

export const buildFilteredMultiSearchMergedResult = (
  result: MultiSearchMergedResult,
  sources: MultiSearchSourceResult[],
  getSourceLanguageValues: (source: MultiSearchSourceResult) => string[],
): MultiSearchMergedResult => {
  const preferredSource = selectPreferredMultiSearchTitleSource(
    sources,
    result.preferredTitleLanguageCodes,
  );

  return {
    id: result.id,
    title: preferredSource?.result.title || result.title,
    coverUrl: preferredSource?.result.thumbnailUrl,
    summary: getFirstSourceValue(sources, (source) => source.result.summary),
    pageCount: getFirstSourceValue(sources, (source) => source.result.pageCount),
    sources,
    sourceLanguageCodes: uniqueMultiSearchFilterValues(sources.flatMap(getSourceLanguageValues)),
    tentativeAuthorNames: uniqueMultiSearchFilterValues(sources.flatMap((source) => source.tentativeAuthorNames)),
    contentTypes: uniqueMultiSearchFilterValues(sources.flatMap((source) => source.contentTypes)),
    preferredTitleLanguageCodes: result.preferredTitleLanguageCodes,
  };
};

const normalizeTextFilterValue = (value: string): string => (
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\[\]]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\[\s+/g, "[")
    .replace(/\s+]/g, "]")
);

const parseTextFilterTerms = (value: string): string[] => (
  parseMultiSearchTerms(value)
    .map(normalizeTextFilterValue)
    .filter(Boolean)
);

export const hasActiveMultiSearchTextFilter = (value: string): boolean => (
  parseTextFilterTerms(value).length > 0
);

const doesSourceMatchTextFilter = (
  source: MultiSearchSourceResult,
  normalizedTerms: string[],
): boolean => {
  if (!normalizedTerms.length) {
    return true;
  }

  const title = normalizeTextFilterValue(source.result.title);
  return normalizedTerms.some((term) => title.includes(term));
};

export const filterMultiSearchMergedResultsByText = (
  results: MultiSearchMergedResult[],
  value: string,
  getSourceLanguageValues: (source: MultiSearchSourceResult) => string[],
): MultiSearchMergedResult[] => {
  const normalizedTerms = parseTextFilterTerms(value);
  if (!normalizedTerms.length) {
    return results;
  }

  return results.reduce<MultiSearchMergedResult[]>((visibleResults, result) => {
    const visibleSources = result.sources.filter((source) => doesSourceMatchTextFilter(source, normalizedTerms));
    if (!visibleSources.length) {
      return visibleResults;
    }

    visibleResults.push(buildFilteredMultiSearchMergedResult(result, visibleSources, getSourceLanguageValues));
    return visibleResults;
  }, []);
};

export const filterMultiSearchRunsByText = (
  runs: MultiSearchScraperRun[],
  value: string,
): MultiSearchScraperRun[] => {
  const normalizedTerms = parseTextFilterTerms(value);
  if (!normalizedTerms.length) {
    return runs;
  }

  return runs.map((run) => ({
    ...run,
    results: run.results.filter((source) => doesSourceMatchTextFilter(source, normalizedTerms)),
  }));
};
