import type { SearchHistorySettings } from "@/shared/history";
import type { ScraperRecord } from "@/shared/scraper";
import type {
  MultiSearchAdvancedPages,
  MultiSearchDepthMode,
  MultiSearchPaceMode,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";
import { getLanguageLabel } from "@/renderer/components/MultiSearch/multiSearchUtils";

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
  Langues: sortedFallbackList(selectedLanguageCodes.map(getLanguageLabel), "Toutes"),
  Types: sortedFallbackList(selectedContentTypes, "Tous"),
  Profondeur: formatDepth(depthMode, advancedPages),
  Rythme: formatPace(paceMode),
  Vue: formatView(viewMode),
});
