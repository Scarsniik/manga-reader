import {
  type ScraperTitleAnalysisBlockConfig,
  type ScraperTitleAnalysisBlockKind,
  type ScraperTitleAnalysisConfig,
  type ScraperTitleAnalysisField,
  type ScraperTitleAnalysisValidationFailureBehavior,
  type ScraperTitleAnalysisValidationKind,
  type ScraperTitleAnalysisVariantConfig,
  type ScraperTitleSuffixMapping,
  type ScraperTitleSuffixMappingKind,
} from "@/shared/scraper";
import { uniqueLanguageCodes } from "@/renderer/utils/languageDetection";
import { createDefaultScraperTitleAnalysisConfig } from "@/renderer/utils/scraperTitleAnalysis/defaults";
import { normalizeTitleAnalysisText } from "@/renderer/utils/scraperTitleAnalysis/text";

const normalizeId = (value: unknown, fallback: string): string => (
  normalizeTitleAnalysisText(value) || fallback
);

const normalizeEnabled = (value: unknown, fallback = true): boolean => (
  typeof value === "boolean" ? value : fallback
);

const normalizeBlockKind = (value: unknown): ScraperTitleAnalysisBlockKind => (
  value === "bracket"
  || value === "bracketWithParentheses"
  || value === "parentheses"
  || value === "suffixes"
    ? value
    : "title"
);

const normalizeField = (value: unknown): ScraperTitleAnalysisField | undefined => (
  value === "title"
  || value === "circle"
  || value === "authors"
  || value === "parody"
  || value === "extra"
    ? value
    : undefined
);

const normalizeValidation = (value: unknown): ScraperTitleAnalysisValidationKind => (
  value === "language" ? "language" : "none"
);

const normalizeValidationFailure = (value: unknown): ScraperTitleAnalysisValidationFailureBehavior => (
  value === "continue" ? "continue" : "rejectVariant"
);

const normalizeSuffixMappingKind = (value: unknown): ScraperTitleSuffixMappingKind => (
  value === "language" ? "language" : "tag"
);

const normalizeBlock = (
  value: unknown,
  index: number,
): ScraperTitleAnalysisBlockConfig | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  return {
    id: normalizeId(raw.id, `block-${index + 1}`),
    kind: normalizeBlockKind(raw.kind),
    enabled: normalizeEnabled(raw.enabled),
    optional: normalizeEnabled(raw.optional, false),
    field: normalizeField(raw.field),
    innerField: normalizeField(raw.innerField),
    validation: normalizeValidation(raw.validation),
    onValidationFailure: normalizeValidationFailure(raw.onValidationFailure),
  };
};

const normalizeVariant = (
  value: unknown,
  index: number,
): ScraperTitleAnalysisVariantConfig | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks
      .map((block, blockIndex) => normalizeBlock(block, blockIndex))
      .filter((block): block is ScraperTitleAnalysisBlockConfig => Boolean(block))
    : [];

  if (!blocks.length) {
    return null;
  }

  return {
    id: normalizeId(raw.id, `variant-${index + 1}`),
    name: normalizeTitleAnalysisText(raw.name) || `Variante ${index + 1}`,
    enabled: normalizeEnabled(raw.enabled),
    blocks,
  };
};

const normalizeSuffixMapping = (value: unknown): ScraperTitleSuffixMapping | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const mappingValue = normalizeTitleAnalysisText(raw.value);
  if (!mappingValue) {
    return null;
  }

  const kind = normalizeSuffixMappingKind(raw.kind);
  const languageCode = uniqueLanguageCodes([String(raw.languageCode ?? "")])[0];
  return {
    value: mappingValue,
    kind,
    languageCode: kind === "language" ? languageCode : undefined,
  };
};

const normalizeManualTestTitles = (value: unknown): string[] => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/g)
      : [];

  return rawValues.map(normalizeTitleAnalysisText).filter(Boolean);
};

export const normalizeScraperTitleAnalysisConfig = (
  value: unknown,
): ScraperTitleAnalysisConfig => {
  const defaults = createDefaultScraperTitleAnalysisConfig();
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const variants = Array.isArray(raw.variants)
    ? raw.variants
      .map((variant, index) => normalizeVariant(variant, index))
      .filter((variant): variant is ScraperTitleAnalysisVariantConfig => Boolean(variant))
    : defaults.variants;
  const suffixMappings = Array.isArray(raw.suffixMappings)
    ? raw.suffixMappings
      .map(normalizeSuffixMapping)
      .filter((mapping): mapping is ScraperTitleSuffixMapping => Boolean(mapping))
    : defaults.suffixMappings;
  const manualTestTitles = normalizeManualTestTitles(raw.manualTestTitles);
  const rawSearchTestLimit = Number(raw.searchTestLimit);

  return {
    enabled: Boolean(raw.enabled),
    variants: variants.length ? variants : defaults.variants,
    suffixMappings: suffixMappings.length ? suffixMappings : defaults.suffixMappings,
    manualTestTitles: manualTestTitles.length ? manualTestTitles : defaults.manualTestTitles,
    searchTestQuery: normalizeTitleAnalysisText(raw.searchTestQuery),
    searchTestLimit: Number.isFinite(rawSearchTestLimit)
      ? Math.max(1, Math.min(100, Math.floor(rawSearchTestLimit)))
      : defaults.searchTestLimit,
  };
};

