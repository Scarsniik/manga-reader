import { hasScraperFieldSelectorValue, ScraperRecord } from "@/shared/scraper";
import {
  detectLanguageCodesFromTitle,
  getLanguageFlagCode,
  getLanguageLabel,
  isTitleLanguageMarker,
  stripTitleLanguageMarkers,
} from "@/renderer/utils/languageDetection";
import {
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperSearchFeatureConfig,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

export const UNKNOWN_MULTI_SEARCH_VALUE = "__multi_search_unknown__";

export type MultiSearchFilterOption = {
  label: string;
  value: string;
};

export const parseMultiSearchTerms = (query: string): string[] => {
  const seen = new Set<string>();

  return query
    .split(/[\n,;|]+/g)
    .map((term) => term.trim().replace(/\s+/g, " "))
    .filter((term) => {
      const key = term.toLowerCase();
      if (!term || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
};

const normalizeListValue = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const normalizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value.reduce<string[]>((items, entry) => {
    const normalized = normalizeListValue(entry);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return items;
    }

    seen.add(key);
    items.push(normalized);
    return items;
  }, []);
};

export const getScraperSourceLanguages = (scraper: ScraperRecord): string[] => (
  normalizeList(scraper.globalConfig.sourceLanguages).map((language) => language.toLowerCase())
);

export const getScraperContentTypes = (scraper: ScraperRecord): string[] => (
  normalizeList(scraper.globalConfig.contentTypes)
);

export {
  detectLanguageCodesFromTitle,
  getLanguageFlagCode,
  getLanguageLabel,
};

export const buildLanguageFilterOptions = (scrapers: ScraperRecord[]): MultiSearchFilterOption[] => {
  const values = new Set<string>();
  let hasUnknown = false;

  scrapers.forEach((scraper) => {
    const scraperLanguages = getScraperSourceLanguages(scraper);
    if (!scraperLanguages.length) {
      hasUnknown = true;
      return;
    }

    scraperLanguages.forEach((language) => values.add(language));
  });

  const options = Array.from(values)
    .sort((left, right) => getLanguageLabel(left).localeCompare(getLanguageLabel(right)))
    .map((value) => ({
      label: getLanguageLabel(value),
      value,
    }));

  if (hasUnknown) {
    options.push({
      label: getLanguageLabel(UNKNOWN_MULTI_SEARCH_VALUE),
      value: UNKNOWN_MULTI_SEARCH_VALUE,
    });
  }

  return options;
};

export const buildContentTypeFilterOptions = (scrapers: ScraperRecord[]): MultiSearchFilterOption[] => {
  const values = new Map<string, string>();
  let hasUnknown = false;

  scrapers.forEach((scraper) => {
    const contentTypes = getScraperContentTypes(scraper);
    if (!contentTypes.length) {
      hasUnknown = true;
      return;
    }

    contentTypes.forEach((contentType) => {
      values.set(contentType.toLowerCase(), contentType);
    });
  });

  const options = Array.from(values.values())
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({
      label: value,
      value,
    }));

  if (hasUnknown) {
    options.push({
      label: "Non renseigne",
      value: UNKNOWN_MULTI_SEARCH_VALUE,
    });
  }

  return options;
};

export const isSearchableScraper = (scraper: ScraperRecord): boolean => {
  const searchFeature = getScraperFeature(scraper, "search");
  const searchConfig = getScraperSearchFeatureConfig(searchFeature);

  return Boolean(
    isScraperFeatureConfigured(searchFeature)
    && searchConfig?.urlTemplate
    && searchConfig.resultItemSelector
    && hasScraperFieldSelectorValue(searchConfig.titleSelector),
  );
};

export const canOpenScraperDetails = (scraper: ScraperRecord): boolean => {
  const detailsFeature = getScraperFeature(scraper, "details");
  const detailsConfig = getScraperDetailsFeatureConfig(detailsFeature);

  return Boolean(
    isScraperFeatureConfigured(detailsFeature)
    && hasScraperFieldSelectorValue(detailsConfig?.titleSelector),
  );
};

const TENTATIVE_AUTHOR_PREFIX_PATTERN = /^\s*(?:\([^)]*\)\s*)*(?:\[\s*([^\]]+?)\s*]\s*)+/;
const TENTATIVE_AUTHOR_NAME_PATTERN = /\[\s*([^\]]+?)\s*]/g;

const splitTentativeAuthorName = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  Array.from(value).forEach((char) => {
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      return;
    }

    current += char;
  });

  parts.push(current);
  return parts.map(normalizeListValue).filter(Boolean);
};

const collectTentativeAuthorNames = (value: string): string[] => {
  const author = normalizeListValue(value);
  if (!author || isTitleLanguageMarker(author)) {
    return [];
  }

  const splitAuthors = splitTentativeAuthorName(author)
    .filter((splitAuthor) => !isTitleLanguageMarker(splitAuthor));

  return Array.from(new Set([author, ...splitAuthors]));
};

export const extractTentativeAuthorNamesFromTitle = (title: string): string[] => {
  const prefixMatch = title.match(TENTATIVE_AUTHOR_PREFIX_PATTERN);
  if (!prefixMatch) {
    return [];
  }

  const seen = new Set<string>();
  const authors: string[] = [];

  Array.from(prefixMatch[0].matchAll(TENTATIVE_AUTHOR_NAME_PATTERN)).forEach((match) => {
    collectTentativeAuthorNames(match[1]).forEach((author) => {
      const key = author.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      authors.push(author);
    });
  });

  return authors;
};

export const matchesMultiSearchFilters = (
  scraper: ScraperRecord,
  filters: {
    selectedScraperIds: string[];
    selectedLanguageCodes: string[];
    selectedContentTypes: string[];
  },
): boolean => {
  if (filters.selectedScraperIds.length && !filters.selectedScraperIds.includes(scraper.id)) {
    return false;
  }

  const scraperLanguages = getScraperSourceLanguages(scraper);
  const languageValues = scraperLanguages.length ? scraperLanguages : [UNKNOWN_MULTI_SEARCH_VALUE];
  if (
    filters.selectedLanguageCodes.length
    && !languageValues.some((language) => filters.selectedLanguageCodes.includes(language))
  ) {
    return false;
  }

  const scraperContentTypes = getScraperContentTypes(scraper);
  const contentTypeValues = scraperContentTypes.length ? scraperContentTypes : [UNKNOWN_MULTI_SEARCH_VALUE];
  if (
    filters.selectedContentTypes.length
    && !contentTypeValues.some((contentType) => filters.selectedContentTypes.includes(contentType))
  ) {
    return false;
  }

  return true;
};

const normalizeTitleText = (value: string, removeParentheses = false): string => (
  stripTitleLanguageMarkers(value)
    .replace(/(?:\[[^\]]*]|\{[^}]*})/g, " ")
    .replace(removeParentheses ? /\([^)]*\)/g : /$^/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
);

const getMergeTitleVariants = (value: string): string[] => (
  Array.from(new Set([
    normalizeTitleText(value),
    normalizeTitleText(value, true),
  ])).filter(Boolean)
);

const getTitleAlternatives = (value: string): string[] => {
  const alternatives = value
    .split(/[|/]+/g)
    .map((title) => title.trim())
    .filter(Boolean);

  return alternatives.length ? Array.from(new Set(alternatives)) : [value];
};

const SEQUENCE_MARKER_PATTERN = /^(?:\d+|i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;

const getTitleSequenceMarkers = (value: string): Set<string> => (
  new Set(normalizeTitleText(value).split(" ").filter((token) => SEQUENCE_MARKER_PATTERN.test(token)))
);

const hasDifferentSequenceMarkers = (left: string, right: string): boolean => {
  const leftMarkers = getTitleSequenceMarkers(left);
  const rightMarkers = getTitleSequenceMarkers(right);

  return [...leftMarkers].some((marker) => !rightMarkers.has(marker))
    || [...rightMarkers].some((marker) => !leftMarkers.has(marker));
};

const normalizeTentativeAuthorName = (value: string): string => (
  normalizeTitleText(value)
);

const haveConflictingTentativeAuthors = (
  leftAuthors: string[],
  rightAuthors: string[],
): boolean => {
  const leftValues = leftAuthors.map(normalizeTentativeAuthorName).filter(Boolean);
  const rightValues = rightAuthors.map(normalizeTentativeAuthorName).filter(Boolean);
  if (!leftValues.length || !rightValues.length) {
    return false;
  }

  const rightSet = new Set(rightValues);
  return leftValues.every((author) => !rightSet.has(author));
};

const canMergeSourceTitles = (
  source: MultiSearchSourceResult,
  groupSource: MultiSearchSourceResult,
): boolean => {
  if (haveConflictingTentativeAuthors(source.tentativeAuthorNames, groupSource.tentativeAuthorNames)) {
    return false;
  }

  return doTitleAlternativesMatch(source.result.title, groupSource.result.title);
};

const doTitleAlternativesMatch = (
  left: string,
  right: string,
): boolean => {
  return getTitleAlternatives(left).some((leftAlternative) => (
    getTitleAlternatives(right).some((rightAlternative) => {
      if (hasDifferentSequenceMarkers(leftAlternative, rightAlternative)) {
        return false;
      }

      const rightVariants = new Set(getMergeTitleVariants(rightAlternative));
      return getMergeTitleVariants(leftAlternative).some((leftVariant) => rightVariants.has(leftVariant));
    })
  ));
};

const shouldMergeSourceIntoGroup = (
  source: MultiSearchSourceResult,
  group: MultiSearchMergedResult,
): boolean => {
  return group.sources.some((groupSource) => {
    if (source.result.detailUrl && groupSource.result.detailUrl === source.result.detailUrl) {
      return true;
    }

    return canMergeSourceTitles(source, groupSource);
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

export const mergeMultiSearchResults = (
  sources: MultiSearchSourceResult[],
): MultiSearchMergedResult[] => {
  const groups: MultiSearchMergedResult[] = [];

  sources.forEach((source) => {
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
  });

  return groups.sort((left, right) => {
    const sourceCountCompare = right.sources.length - left.sources.length;
    if (sourceCountCompare !== 0) {
      return sourceCountCompare;
    }

    return left.title.localeCompare(right.title);
  });
};

export const flattenMultiSearchSources = (
  runs: Array<{ results: MultiSearchSourceResult[] }>,
): MultiSearchSourceResult[] => (
  runs.flatMap((run) => run.results)
);
