import type { SearchHistorySettings } from "@/shared/history";
import type { ScraperRecord } from "@/shared/scraper";
import type {
  MultiSearchAdvancedPages,
  MultiSearchDepthMode,
  MultiSearchPaceMode,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";
import {
  NO_MULTI_SEARCH_CONTENT_TYPES_VALUE,
  NO_MULTI_SEARCH_LANGUAGES_VALUE,
  getLanguageLabel,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import { splitIncludeFilterValues } from "@/renderer/components/IncludeFilterBar/includeFilterValues";

type BuildMultiSearchHistorySettingsOptions = {
  selectedScrapers: ScraperRecord[];
  selectedLanguageCodes: string[];
  selectedContentTypes: string[];
  depthMode: MultiSearchDepthMode;
  advancedPages: MultiSearchAdvancedPages;
  paceMode: MultiSearchPaceMode;
  viewMode: MultiSearchViewMode;
};

const formatDepth = (
  depthMode: MultiSearchDepthMode,
  advancedPages: MultiSearchAdvancedPages,
): string => {
  if (depthMode === "quick") {
    return "Rapide, 1 page";
  }

  if (depthMode === "extended") {
    return "Etendue, 3 pages";
  }

  return advancedPages === "maximum"
    ? "Avancee, maximum"
    : `Avancee, ${advancedPages} page(s)`;
};

const formatPace = (paceMode: MultiSearchPaceMode): string => (
  paceMode === "careful" ? "Prudent" : "Rapide"
);

const formatView = (viewMode: MultiSearchViewMode): string => (
  viewMode === "byScraper" ? "Par scrapper" : "Fusionnee"
);

const sortedList = (values: string[]): string[] => (
  Array.from(new Set(values.filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
);

const sortedFallbackList = (values: string[], fallback: string): string[] => {
  const entries = sortedList(values);

  return entries.length ? entries : [fallback];
};

const formatIncludedExcludedList = (
  values: string[],
  options: {
    allLabel: string;
    mapLabel?: (value: string) => string;
  },
): string[] => {
  const { includedValues, excludedValues } = splitIncludeFilterValues(values);
  const mapLabel = options.mapLabel ?? ((value: string) => value);
  const includedLabels = sortedList(includedValues.map(mapLabel));
  const excludedLabels = sortedList(excludedValues.map(mapLabel));

  if (!excludedLabels.length) {
    return includedLabels.length ? includedLabels : [options.allLabel];
  }

  if (!includedLabels.length) {
    return [`${options.allLabel} sauf ${excludedLabels.join(", ")}`];
  }

  return [
    ...includedLabels,
    `sauf ${excludedLabels.join(", ")}`,
  ];
};

const formatSelectedLanguages = (selectedLanguageCodes: string[]): string[] => (
  selectedLanguageCodes.includes(NO_MULTI_SEARCH_LANGUAGES_VALUE)
    ? ["Aucune"]
    : formatIncludedExcludedList(selectedLanguageCodes, {
      allLabel: "Toutes",
      mapLabel: getLanguageLabel,
    })
);

const formatSelectedContentTypes = (selectedContentTypes: string[]): string[] => (
  selectedContentTypes.includes(NO_MULTI_SEARCH_CONTENT_TYPES_VALUE)
    ? ["Aucun"]
    : formatIncludedExcludedList(selectedContentTypes, {
      allLabel: "Tous",
    })
);

export const buildMultiSearchHistorySettings = ({
  selectedScrapers,
  selectedLanguageCodes,
  selectedContentTypes,
  depthMode,
  advancedPages,
  paceMode,
  viewMode,
}: BuildMultiSearchHistorySettingsOptions): SearchHistorySettings => ({
  Scrappers: sortedFallbackList(selectedScrapers.map((scraper) => scraper.name), "Aucun"),
  _scraperIds: sortedList(selectedScrapers.map((scraper) => scraper.id)),
  Langues: formatSelectedLanguages(selectedLanguageCodes),
  Types: formatSelectedContentTypes(selectedContentTypes),
  Profondeur: formatDepth(depthMode, advancedPages),
  Rythme: formatPace(paceMode),
  Vue: formatView(viewMode),
});
