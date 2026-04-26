import { ScraperRecord } from "@/shared/scraper";
import { languages } from "@/renderer/consts/languages";
import {
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperSearchFeatureConfig,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime";
import type {
  MultiSearchMergeMode,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

export const UNKNOWN_MULTI_SEARCH_VALUE = "__multi_search_unknown__";

export type MultiSearchFilterOption = {
  label: string;
  value: string;
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

export const getLanguageLabel = (value: string): string => {
  if (value === UNKNOWN_MULTI_SEARCH_VALUE) {
    return "Non renseignee";
  }

  return languages.find((language) => language.code === value)?.frenchName || value;
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
    && searchConfig.titleSelector,
  );
};

export const canOpenScraperDetails = (scraper: ScraperRecord): boolean => {
  const detailsFeature = getScraperFeature(scraper, "details");
  const detailsConfig = getScraperDetailsFeatureConfig(detailsFeature);

  return Boolean(isScraperFeatureConfigured(detailsFeature) && detailsConfig?.titleSelector);
};

const TITLE_LANGUAGE_PATTERNS: Array<{
  code: string;
  pattern: RegExp;
}> = [
  { code: "en", pattern: /(?:^|[\s[(\]{}_\-.])(?:en|eng|english|anglais)(?:$|[\s)\]{}_\-.])/i },
  { code: "fr", pattern: /(?:^|[\s[(\]{}_\-.])(?:fr|fra|fre|french|francais|français|vf|vostfr)(?:$|[\s)\]{}_\-.])/i },
  { code: "ja", pattern: /(?:^|[\s[(\]{}_\-.])(?:ja|jp|jpn|japanese|japonais|raw)(?:$|[\s)\]{}_\-.])/i },
  { code: "es", pattern: /(?:^|[\s[(\]{}_\-.])(?:es|esp|spa|spanish|espanol|español)(?:$|[\s)\]{}_\-.])/i },
  { code: "de", pattern: /(?:^|[\s[(\]{}_\-.])(?:de|ger|deu|german|allemand)(?:$|[\s)\]{}_\-.])/i },
  { code: "it", pattern: /(?:^|[\s[(\]{}_\-.])(?:it|ita|italian|italien)(?:$|[\s)\]{}_\-.])/i },
  { code: "pt", pattern: /(?:^|[\s[(\]{}_\-.])(?:pt|por|portuguese|portugais|br|ptbr|pt-br)(?:$|[\s)\]{}_\-.])/i },
  { code: "ko", pattern: /(?:^|[\s[(\]{}_\-.])(?:ko|kor|korean|coreen|coréen)(?:$|[\s)\]{}_\-.])/i },
  { code: "zh", pattern: /(?:^|[\s[(\]{}_\-.])(?:zh|chi|zho|cn|chinese|chinois)(?:$|[\s)\]{}_\-.])/i },
  { code: "ru", pattern: /(?:^|[\s[(\]{}_\-.])(?:ru|rus|russian|russe)(?:$|[\s)\]{}_\-.])/i },
];

const TITLE_LANGUAGE_MARKER_PATTERN = new RegExp([
  String.raw`[\[({]\s*(?:en|eng|english|anglais|fr|fra|fre|french|francais|français|vf|vostfr|ja|jp|jpn|japanese|japonais|raw|es|esp|spa|spanish|espanol|español|de|ger|deu|german|allemand|it|ita|italian|italien|pt|por|portuguese|portugais|br|ptbr|pt-br|ko|kor|korean|coreen|coréen|zh|chi|zho|cn|chinese|chinois|ru|rus|russian|russe)\s*[\])}]`,
  String.raw`(?:^|[\s_\-.])(?:en|eng|english|anglais|fr|fra|fre|french|francais|français|vf|vostfr|ja|jp|jpn|japanese|japonais|raw|es|esp|spa|spanish|espanol|español|de|ger|deu|german|allemand|it|ita|italian|italien|pt|por|portuguese|portugais|br|ptbr|pt-br|ko|kor|korean|coreen|coréen|zh|chi|zho|cn|chinese|chinois|ru|rus|russian|russe)(?:$|[\s_\-.])`,
].join("|"), "gi");

export const detectLanguageCodesFromTitle = (title: string): string[] => (
  TITLE_LANGUAGE_PATTERNS
    .filter(({ pattern }) => pattern.test(title))
    .map(({ code }) => code)
);

export const stripTitleLanguageMarkers = (title: string): string => (
  title
    .replace(TITLE_LANGUAGE_MARKER_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim()
);

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

const buildBigrams = (value: string): Set<string> => {
  const normalized = normalizeTitleText(value);
  if (normalized.length < 2) {
    return new Set(normalized ? [normalized] : []);
  }

  const bigrams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    bigrams.add(normalized.slice(index, index + 2));
  }

  return bigrams;
};

const calculateNormalizedTitleSimilarity = (normalizedLeft: string, normalizedRight: string): number => {
  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const leftBigrams = buildBigrams(normalizedLeft);
  const rightBigrams = buildBigrams(normalizedRight);
  let intersectionSize = 0;
  leftBigrams.forEach((bigram) => {
    if (rightBigrams.has(bigram)) intersectionSize += 1;
  });

  return (2 * intersectionSize) / (leftBigrams.size + rightBigrams.size);
};

const calculateTitleSimilarity = (left: string, right: string, useContextVariants: boolean): number => {
  const leftVariants = useContextVariants ? getMergeTitleVariants(left) : [normalizeTitleText(left)];
  const rightVariants = useContextVariants ? getMergeTitleVariants(right) : [normalizeTitleText(right)];
  if (!leftVariants.length || !rightVariants.length) {
    return 0;
  }

  return Math.max(...leftVariants.flatMap((normalizedLeft) => (
    rightVariants.map((normalizedRight) => calculateNormalizedTitleSimilarity(normalizedLeft, normalizedRight))
  )));
};

const getMergeThreshold = (mode: MultiSearchMergeMode): number => {
  if (mode === "loose") {
    return 0.82;
  }

  if (mode === "balanced") {
    return 0.9;
  }

  return 1;
};

const shouldMergeSourceIntoGroup = (
  source: MultiSearchSourceResult,
  group: MultiSearchMergedResult,
  mode: MultiSearchMergeMode,
): boolean => {
  const sourceTitle = source.result.title;
  const threshold = getMergeThreshold(mode);

  return group.sources.some((groupSource) => {
    if (source.result.detailUrl && groupSource.result.detailUrl === source.result.detailUrl) {
      return true;
    }

    if (hasDifferentSequenceMarkers(sourceTitle, groupSource.result.title)) {
      return false;
    }

    const score = calculateTitleSimilarity(sourceTitle, groupSource.result.title, mode !== "strict");
    if (mode === "strict") {
      return score === 1;
    }

    return score >= threshold;
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

const buildMergedResultId = (source: MultiSearchSourceResult): string => (
  `${source.scraper.id}::${source.result.detailUrl || source.result.title}`
);

export const mergeMultiSearchResults = (
  sources: MultiSearchSourceResult[],
  mode: MultiSearchMergeMode,
): MultiSearchMergedResult[] => {
  const groups: MultiSearchMergedResult[] = [];

  sources.forEach((source) => {
    const group = groups.find((candidate) => shouldMergeSourceIntoGroup(source, candidate, mode));

    if (group) {
      group.sources.push(source);
      group.sourceLanguageCodes = uniqueValues([
        ...group.sourceLanguageCodes,
        ...source.sourceLanguageCodes,
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
      sourceLanguageCodes: uniqueValues(source.sourceLanguageCodes),
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
