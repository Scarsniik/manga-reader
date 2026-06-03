import type { ScraperRecord } from "@/shared/scraper";
import type { AppParams } from "@/renderer/hooks/useParams";
import {
  buildIncludeFilterExcludedValue,
  getIncludeFilterExcludedId,
} from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import {
  NO_MULTI_SEARCH_CONTENT_TYPES_VALUE,
  NO_MULTI_SEARCH_LANGUAGES_VALUE,
  NO_MULTI_SEARCH_SCRAPERS_VALUE,
} from "@/renderer/components/MultiSearch/multiSearchConstants";
import type {
  MultiSearchAdvancedPages,
  MultiSearchDepthMode,
  MultiSearchPaceMode,
  MultiSearchViewMode,
} from "@/renderer/components/MultiSearch/types";

export type MultiSearchPersistentSettings = {
  selectedScraperIds: string[];
  selectedLanguageCodes: string[];
  selectedContentTypes: string[];
  depthMode: MultiSearchDepthMode;
  advancedPages: MultiSearchAdvancedPages;
  paceMode: MultiSearchPaceMode;
  viewMode: MultiSearchViewMode;
};

const DEFAULT_SETTINGS: MultiSearchPersistentSettings = {
  selectedScraperIds: [],
  selectedLanguageCodes: [],
  selectedContentTypes: [],
  depthMode: "quick",
  advancedPages: 3,
  paceMode: "fast",
  viewMode: "merged",
};

const normalizeStringList = (
  value: unknown,
  options?: {
    lowercase?: boolean;
    allowedValues?: readonly string[];
    noneValue?: string;
  },
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedValues = value.map((entry) => {
    const rawEntry = String(entry ?? "").trim();
    const excludedId = getIncludeFilterExcludedId(rawEntry);
    const normalizedEntry = excludedId ?? rawEntry;
    const normalized = options?.lowercase ? normalizedEntry.toLowerCase() : normalizedEntry;

    return excludedId ? buildIncludeFilterExcludedValue(normalized) : normalized;
  });

  if (options?.noneValue && normalizedValues.includes(options.noneValue)) {
    return [options.noneValue];
  }

  const allowedValues = options?.allowedValues ? new Set(options.allowedValues) : null;
  const seen = new Set<string>();

  return normalizedValues.reduce<string[]>((result, entry) => {
    const excludedId = getIncludeFilterExcludedId(entry);
    const validationValue = excludedId ?? entry;

    if (
      !validationValue
      || seen.has(entry)
      || (allowedValues && !allowedValues.has(validationValue))
    ) {
      return result;
    }

    seen.add(entry);
    result.push(entry);
    return result;
  }, []);
};

const normalizeDepthMode = (value: unknown): MultiSearchDepthMode => (
  value === "extended" || value === "advanced" ? value : "quick"
);

const normalizeAdvancedPages = (value: unknown): MultiSearchAdvancedPages => {
  if (value === "maximum") {
    return "maximum";
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : DEFAULT_SETTINGS.advancedPages;
};

const normalizePaceMode = (value: unknown): MultiSearchPaceMode => (
  value === "careful" ? "careful" : "fast"
);

const normalizeViewMode = (value: unknown): MultiSearchViewMode => (
  value === "byScraper" ? "byScraper" : "merged"
);

export const normalizeMultiSearchSelectedScraperIds = (
  value: unknown,
  scrapers: readonly ScraperRecord[],
): string[] => (
  normalizeStringList(value, {
    allowedValues: scrapers.map((scraper) => scraper.id),
    noneValue: NO_MULTI_SEARCH_SCRAPERS_VALUE,
  })
);

export const normalizeMultiSearchSelectedLanguageCodes = (value: unknown): string[] => (
  normalizeStringList(value, {
    lowercase: true,
    noneValue: NO_MULTI_SEARCH_LANGUAGES_VALUE,
  })
);

export const normalizeMultiSearchSelectedContentTypes = (value: unknown): string[] => (
  normalizeStringList(value, {
    noneValue: NO_MULTI_SEARCH_CONTENT_TYPES_VALUE,
  })
);

export const getMultiSearchPersistentSettingsFromParams = (
  params: AppParams | null,
  scrapers: readonly ScraperRecord[],
): MultiSearchPersistentSettings => ({
  selectedScraperIds: normalizeMultiSearchSelectedScraperIds(
    params?.multiSearchSelectedScraperIds,
    scrapers,
  ),
  selectedLanguageCodes: normalizeMultiSearchSelectedLanguageCodes(params?.multiSearchSelectedLanguageCodes),
  selectedContentTypes: normalizeMultiSearchSelectedContentTypes(params?.multiSearchSelectedContentTypes),
  depthMode: normalizeDepthMode(params?.multiSearchDepthMode),
  advancedPages: normalizeAdvancedPages(params?.multiSearchAdvancedPages),
  paceMode: normalizePaceMode(params?.multiSearchPaceMode),
  viewMode: normalizeViewMode(params?.multiSearchViewMode),
});
