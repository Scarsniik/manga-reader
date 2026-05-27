import {
  hasScraperFieldSelectorValue,
  normalizeScraperFieldSelector,
  type ScraperAuthorFeatureConfig,
  type ScraperCardListConfig,
  type ScraperChaptersFeatureConfig,
  type ScraperDetailsDerivedValueConfig,
  type ScraperDetailsFeatureConfig,
  type ScraperFeatureDefinition,
  type ScraperFeatureKind,
  type ScraperFieldSelector,
  type ScraperHomepageFeatureConfig,
  type ScraperLanguageDetectionConfig,
  type ScraperLanguageValueMapping,
  type ScraperPagesFeatureConfig,
  type ScraperPagesTemplateBase,
  type ScraperRecord,
  type ScraperRequestConfig,
  type ScraperRequestField,
  type ScraperSearchFeatureConfig,
  type ScraperTagFeatureConfig,
  type ScraperTitleAnalysisConfig,
} from "@/shared/scraper";
import { normalizeScraperTitleAnalysisConfig } from "@/renderer/utils/scraperTitleAnalysis";
import { normalizeSelectorInput } from "@/renderer/utils/scraperRuntime/display";
import { DETAILS_FIELD_KEYS, type DetailsFieldKey } from "@/renderer/utils/scraperRuntime/types";

const trimOptional = (value: unknown): string | undefined => {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : undefined;
};

const trimOptionalBlockSelector = (value: unknown): string | undefined => {
  const normalized = normalizeSelectorInput(String(value ?? ""));
  return normalized ? normalized : undefined;
};

const normalizeRequiredFieldSelector = (value: unknown): ScraperFieldSelector =>
  normalizeScraperFieldSelector(value) ?? { kind: "css", value: "" };

const trimOptionalFieldSelector = (value: unknown): ScraperFieldSelector | undefined =>
  normalizeScraperFieldSelector(value);

const normalizeLanguageValueMappings = (value: unknown): ScraperLanguageValueMapping[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const raw = item as Record<string, unknown>;
      const mapping: ScraperLanguageValueMapping = {
        value: String(raw.value ?? "").trim(),
        languageCode: String(raw.languageCode ?? "")
          .trim()
          .toLowerCase(),
      };

      return mapping.value && mapping.languageCode ? mapping : null;
    })
    .filter((item): item is ScraperLanguageValueMapping => Boolean(item));
};

const normalizeLanguageDetectionConfig = (value: unknown): ScraperLanguageDetectionConfig => {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    detectFromTitle: Boolean(raw.detectFromTitle),
    languageSelector: trimOptionalFieldSelector(raw.languageSelector),
    processedLanguageSelector: trimOptionalFieldSelector(raw.processedLanguageSelector),
    valueMappings: normalizeLanguageValueMappings(raw.valueMappings),
  };
};

const normalizePagesTemplateBase = (value: unknown): ScraperPagesTemplateBase =>
  value === "details_page" ? "details_page" : "scraper_base";

const buildCardListConfig = (raw: Record<string, unknown>): ScraperCardListConfig => ({
  resultListSelector: trimOptionalBlockSelector(raw.resultListSelector),
  resultItemSelector: normalizeSelectorInput(String(raw.resultItemSelector ?? "")),
  titleSelector: normalizeRequiredFieldSelector(raw.titleSelector),
  detailUrlSelector: trimOptionalFieldSelector(raw.detailUrlSelector),
  authorUrlSelector: trimOptionalFieldSelector(raw.authorUrlSelector),
  thumbnailSelector: trimOptionalFieldSelector(raw.thumbnailSelector),
  summarySelector: trimOptionalFieldSelector(raw.summarySelector),
  pageCountSelector: trimOptionalFieldSelector(raw.pageCountSelector),
  nextPageSelector: trimOptionalFieldSelector(raw.nextPageSelector),
  languageDetection: normalizeLanguageDetectionConfig(raw.languageDetection),
});

const normalizeRequestField = (value: unknown): ScraperRequestField | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const key = trimOptional(raw.key) ?? "";
  const fieldValue = typeof raw.value === "string" ? raw.value : raw.value == null ? "" : String(raw.value);

  if (!key && fieldValue.trim().length === 0) {
    return null;
  }

  return {
    key,
    value: fieldValue,
  };
};

export const normalizeRequestConfig = (value: unknown): ScraperRequestConfig | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const method = raw.method === "POST" ? "POST" : "GET";
  const bodyMode = raw.bodyMode === "raw" ? "raw" : "form";
  const bodyFields = Array.isArray(raw.bodyFields)
    ? raw.bodyFields
        .map((field) => normalizeRequestField(field))
        .filter((field): field is ScraperRequestField => Boolean(field))
    : [];
  const body = typeof raw.body === "string" ? raw.body : undefined;
  const contentType = trimOptional(raw.contentType);

  if (method === "GET" && bodyMode === "form" && bodyFields.length === 0 && !body && !contentType) {
    return undefined;
  }

  return {
    method,
    bodyMode,
    bodyFields,
    body,
    contentType,
  };
};

export const isDetailsFieldKey = (value: unknown): value is DetailsFieldKey =>
  DETAILS_FIELD_KEYS.includes(String(value) as DetailsFieldKey);

const normalizeDerivedValueConfig = (value: unknown): ScraperDetailsDerivedValueConfig | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const key = trimOptional(raw.key);
  if (!key) {
    return null;
  }

  return {
    key,
    sourceType:
      raw.sourceType === "selector" ||
      raw.sourceType === "html" ||
      raw.sourceType === "requested_url" ||
      raw.sourceType === "final_url"
        ? raw.sourceType
        : "field",
    sourceField: isDetailsFieldKey(raw.sourceField) ? raw.sourceField : undefined,
    selector: trimOptionalFieldSelector(raw.selector),
    pattern: trimOptional(raw.pattern),
  };
};

export const getScraperFeature = (
  scraper: ScraperRecord,
  featureKind: ScraperFeatureKind,
): ScraperFeatureDefinition | null => scraper.features.find((feature) => feature.kind === featureKind) ?? null;

const getFeatureConfigRecord = (
  feature: ScraperFeatureDefinition | null | undefined,
): Record<string, unknown> | null => (feature?.config ? (feature.config as Record<string, unknown>) : null);

type SearchLikeFeatureConfigBase = ScraperCardListConfig & Pick<ScraperSearchFeatureConfig, "urlTemplate" | "request">;

const buildSearchLikeFeatureConfig = (raw: Record<string, unknown>): SearchLikeFeatureConfigBase => ({
  ...buildCardListConfig(raw),
  urlTemplate: trimOptional(raw.urlTemplate) ?? "",
  request: normalizeRequestConfig(raw.request),
});

type ListingFeatureConfigBase = ScraperCardListConfig &
  Pick<ScraperAuthorFeatureConfig, "urlStrategy" | "urlTemplate" | "testUrl" | "testValue">;

const buildListingFeatureConfig = (raw: Record<string, unknown>): ListingFeatureConfigBase => ({
  ...buildCardListConfig(raw),
  urlStrategy: raw.urlStrategy === "template" ? "template" : "result_url",
  urlTemplate: trimOptional(raw.urlTemplate),
  testUrl: trimOptional(raw.testUrl),
  testValue: trimOptional(raw.testValue),
});

export const getScraperSearchFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperSearchFeatureConfig | null => {
  const raw = getFeatureConfigRecord(feature);
  if (!raw) {
    return null;
  }

  return {
    ...buildSearchLikeFeatureConfig(raw),
    testQuery: trimOptional(raw.testQuery),
  };
};

export const getScraperHomepageFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperHomepageFeatureConfig | null => {
  const raw = getFeatureConfigRecord(feature);
  if (!raw) {
    return null;
  }

  return buildSearchLikeFeatureConfig(raw);
};

export const getScraperAuthorFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperAuthorFeatureConfig | null => {
  const raw = getFeatureConfigRecord(feature);
  if (!raw) {
    return null;
  }

  return {
    ...buildListingFeatureConfig(raw),
    authorNameSelector: trimOptionalFieldSelector(raw.authorNameSelector),
  };
};

export const getScraperTagFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperTagFeatureConfig | null => {
  const raw = getFeatureConfigRecord(feature);
  if (!raw) {
    return null;
  }

  return {
    ...buildListingFeatureConfig(raw),
    tagNameSelector: trimOptionalFieldSelector(raw.tagNameSelector),
  };
};

export const isScraperFeatureConfigured = (feature: ScraperFeatureDefinition | null | undefined): boolean =>
  Boolean(feature?.config && feature.status !== "not_configured");

export const getScraperDetailsFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperDetailsFeatureConfig | null => {
  const raw = getFeatureConfigRecord(feature);
  if (!raw) {
    return null;
  }

  return {
    urlStrategy: raw.urlStrategy === "template" ? "template" : "result_url",
    urlTemplate: trimOptional(raw.urlTemplate),
    testUrl: trimOptional(raw.testUrl),
    testValue: trimOptional(raw.testValue),
    titleSelector: normalizeRequiredFieldSelector(raw.titleSelector),
    coverSelector: trimOptionalFieldSelector(raw.coverSelector),
    descriptionSelector: trimOptionalFieldSelector(raw.descriptionSelector),
    authorsSelector: trimOptionalFieldSelector(raw.authorsSelector),
    authorUrlSelector: trimOptionalFieldSelector(raw.authorUrlSelector),
    tagsSelector: trimOptionalFieldSelector(raw.tagsSelector),
    tagUrlSelector: trimOptionalFieldSelector(raw.tagUrlSelector),
    statusSelector: trimOptionalFieldSelector(raw.statusSelector),
    pageCountSelector: trimOptionalFieldSelector(raw.pageCountSelector),
    thumbnailsListSelector: trimOptionalBlockSelector(raw.thumbnailsListSelector),
    thumbnailsSelector: trimOptionalFieldSelector(raw.thumbnailsSelector),
    thumbnailsNextPageSelector: trimOptionalFieldSelector(raw.thumbnailsNextPageSelector),
    languageDetection: normalizeLanguageDetectionConfig(raw.languageDetection),
    derivedValues: Array.isArray(raw.derivedValues)
      ? raw.derivedValues
          .map((value) => normalizeDerivedValueConfig(value))
          .filter((value): value is ScraperDetailsDerivedValueConfig => Boolean(value))
      : [],
  };
};

export const getScraperChaptersFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperChaptersFeatureConfig | null => {
  const raw = getFeatureConfigRecord(feature);
  if (!raw) {
    return null;
  }

  const chapterItemSelector = normalizeSelectorInput(String(raw.chapterItemSelector ?? ""));
  return {
    urlStrategy: raw.urlStrategy === "template" ? "template" : "details_page",
    urlTemplate: trimOptional(raw.urlTemplate),
    templateBase: normalizePagesTemplateBase(raw.templateBase),
    chapterListSelector: trimOptionalBlockSelector(raw.chapterListSelector),
    chapterItemSelector,
    chapterUrlSelector: normalizeRequiredFieldSelector(raw.chapterUrlSelector),
    chapterImageSelector: trimOptionalFieldSelector(raw.chapterImageSelector),
    chapterLabelSelector: normalizeRequiredFieldSelector(raw.chapterLabelSelector),
    reverseOrder: Boolean(raw.reverseOrder),
  };
};

export const getScraperPagesFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperPagesFeatureConfig | null => {
  const raw = getFeatureConfigRecord(feature);
  if (!raw) {
    return null;
  }

  return {
    urlStrategy:
      raw.urlStrategy === "template"
        ? "template"
        : raw.urlStrategy === "chapter_page" || Boolean(raw.linkedToChapters)
          ? "chapter_page"
          : "details_page",
    urlTemplate: trimOptional(raw.urlTemplate),
    templateBase: normalizePagesTemplateBase(raw.templateBase),
    pageImageSelector: trimOptionalFieldSelector(raw.pageImageSelector),
    linkedToChapters: raw.urlStrategy === "template" ? Boolean(raw.linkedToChapters) : false,
  };
};

export const getScraperTitleAnalysisFeatureConfig = (
  feature: ScraperFeatureDefinition | null | undefined,
): ScraperTitleAnalysisConfig | null => {
  const raw = getFeatureConfigRecord(feature);
  if (!raw) {
    return null;
  }

  return normalizeScraperTitleAnalysisConfig(raw);
};
