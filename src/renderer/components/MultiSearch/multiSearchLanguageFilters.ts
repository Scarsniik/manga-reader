import {
  UNKNOWN_MULTI_SEARCH_VALUE,
  getLanguageLabel,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchMergedResult,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

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

const isLanguageFilterMode = (
  mode: MultiSearchLanguageFilterMode | undefined,
): mode is MultiSearchLanguageFilterMode => (
  mode === "only" || mode === "without" || mode === "default"
);

export const getMultiSearchSourceLanguageValues = (source: MultiSearchSourceResult): string[] => (
  source.sourceLanguageCodes.length ? source.sourceLanguageCodes : [UNKNOWN_MULTI_SEARCH_VALUE]
);

export const getMultiSearchLanguageFilterMode = (
  modes: MultiSearchLanguageFilterModes,
  languageCode: string,
): MultiSearchLanguageFilterMode => {
  const mode = modes[languageCode];
  return isLanguageFilterMode(mode) ? mode : "default";
};

export const hasActiveMultiSearchLanguageFilter = (
  modes: MultiSearchLanguageFilterModes,
): boolean => (
  Object.values(modes).some((mode) => mode === "only" || mode === "without")
);

export const toggleMultiSearchLanguageFilterMode = (
  mode: MultiSearchLanguageFilterMode,
  toggledMode: Exclude<MultiSearchLanguageFilterMode, "default">,
): MultiSearchLanguageFilterMode => {
  return mode === toggledMode ? "default" : toggledMode;
};

const getLanguageCodesByFilterMode = (
  modes: MultiSearchLanguageFilterModes,
  expectedMode: MultiSearchLanguageFilterMode,
): string[] => (
  Object.entries(modes)
    .filter(([, mode]) => mode === expectedMode)
    .map(([languageCode]) => languageCode)
);

const doesSourceMatchLanguageFilter = (
  source: MultiSearchSourceResult,
  modes: MultiSearchLanguageFilterModes,
): boolean => {
  const onlyLanguageCodes = getLanguageCodesByFilterMode(modes, "only");
  const withoutLanguageCodes = getLanguageCodesByFilterMode(modes, "without");
  const sourceLanguageCodes = getMultiSearchSourceLanguageValues(source);

  if (withoutLanguageCodes.some((languageCode) => sourceLanguageCodes.includes(languageCode))) {
    return false;
  }

  if (
    onlyLanguageCodes.length
    && !onlyLanguageCodes.some((languageCode) => sourceLanguageCodes.includes(languageCode))
  ) {
    return false;
  }

  return true;
};

const getFirstSourceValue = (
  sources: MultiSearchSourceResult[],
  getValue: (source: MultiSearchSourceResult) => string | undefined,
): string | undefined => (
  sources.map(getValue).find((value): value is string => Boolean(value))
);

const buildFilteredMergedResult = (
  result: MultiSearchMergedResult,
  sources: MultiSearchSourceResult[],
): MultiSearchMergedResult => ({
  id: result.id,
  title: sources[0]?.result.title || result.title,
  coverUrl: getFirstSourceValue(sources, (source) => source.result.thumbnailUrl),
  summary: getFirstSourceValue(sources, (source) => source.result.summary),
  pageCount: getFirstSourceValue(sources, (source) => source.result.pageCount),
  sources,
  sourceLanguageCodes: uniqueValues(sources.flatMap(getMultiSearchSourceLanguageValues)),
  tentativeAuthorNames: uniqueValues(sources.flatMap((source) => source.tentativeAuthorNames)),
  contentTypes: uniqueValues(sources.flatMap((source) => source.contentTypes)),
});

export const filterMultiSearchMergedResultsByLanguage = (
  results: MultiSearchMergedResult[],
  modes: MultiSearchLanguageFilterModes,
): MultiSearchMergedResult[] => {
  if (!hasActiveMultiSearchLanguageFilter(modes)) {
    return results;
  }

  return results.reduce<MultiSearchMergedResult[]>((visibleResults, result) => {
    const visibleSources = result.sources.filter((source) => doesSourceMatchLanguageFilter(source, modes));
    if (!visibleSources.length) {
      return visibleResults;
    }

    visibleResults.push(buildFilteredMergedResult(result, visibleSources));
    return visibleResults;
  }, []);
};

export const filterMultiSearchRunsByLanguage = (
  runs: MultiSearchScraperRun[],
  modes: MultiSearchLanguageFilterModes,
): MultiSearchScraperRun[] => {
  if (!hasActiveMultiSearchLanguageFilter(modes)) {
    return runs;
  }

  return runs.map((run) => ({
    ...run,
    results: run.results.filter((source) => doesSourceMatchLanguageFilter(source, modes)),
  }));
};

export const buildMultiSearchResultLanguageFilterCodes = (
  sources: MultiSearchSourceResult[],
): string[] => (
  uniqueValues(sources.flatMap(getMultiSearchSourceLanguageValues))
    .sort((left, right) => getLanguageLabel(left).localeCompare(getLanguageLabel(right)))
);
