import {
  type ScraperFeatureValidationResult,
  type ScraperTitleAnalysisBlockConfig,
  type ScraperTitleAnalysisBlockKind,
  type ScraperTitleAnalysisConfig,
  type ScraperTitleAnalysisField,
  type ScraperTitleAnalysisResult,
  type ScraperTitleAnalysisVariantConfig,
  type ScraperTitleSuffixMapping,
} from "@/shared/scraper";
import {
  analyzeScraperTitle,
  createDefaultScraperTitleAnalysisConfig,
  normalizeScraperTitleAnalysisConfig,
} from "@/renderer/utils/scraperTitleAnalysis";

export const TITLE_ANALYSIS_BLOCK_KIND_LABELS: Record<ScraperTitleAnalysisBlockKind, string> = {
  title: "Titre",
  bracket: "Crochets",
  bracketWithParentheses: "Crochets + parentheses",
  parentheses: "Parentheses",
  suffixes: "Suffixes",
};

export const TITLE_ANALYSIS_FIELD_LABELS: Record<ScraperTitleAnalysisField, string> = {
  title: "Titre",
  circle: "Cercle",
  authors: "Auteurs",
  parody: "Parodie",
  extra: "Non reconnu",
};

export const TITLE_ANALYSIS_FIELD_OPTIONS: Array<{
  value: ScraperTitleAnalysisField;
  label: string;
}> = Object.entries(TITLE_ANALYSIS_FIELD_LABELS).map(([value, label]) => ({
  value: value as ScraperTitleAnalysisField,
  label,
}));

export const TITLE_ANALYSIS_BLOCK_KIND_OPTIONS: Array<{
  value: ScraperTitleAnalysisBlockKind;
  label: string;
}> = Object.entries(TITLE_ANALYSIS_BLOCK_KIND_LABELS).map(([value, label]) => ({
  value: value as ScraperTitleAnalysisBlockKind,
  label,
}));

export const createTitleAnalysisDraftId = (prefix: string): string => (
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);

export const getTitleAnalysisConfigSignature = (
  config: ScraperTitleAnalysisConfig,
): string => JSON.stringify(config);

export const getInitialTitleAnalysisConfig = (
  config: unknown,
): ScraperTitleAnalysisConfig => (
  config
    ? normalizeScraperTitleAnalysisConfig(config)
    : createDefaultScraperTitleAnalysisConfig()
);

export const analyzeTitleSamples = (
  titles: string[],
  config: ScraperTitleAnalysisConfig,
): ScraperTitleAnalysisResult[] => {
  const testConfig = {
    ...config,
    enabled: true,
  };

  return titles
    .map((title) => title.trim())
    .filter(Boolean)
    .map((title) => analyzeScraperTitle(title, testConfig));
};

export const buildTitleAnalysisValidationResult = (
  results: ScraperTitleAnalysisResult[],
): ScraperFeatureValidationResult => {
  const matchedResults = results.filter((result) => result.matched && result.title);
  const unmatchedResults = results.filter((result) => !result.matched || !result.title);

  return {
    ok: results.length > 0 && matchedResults.length > 0 && unmatchedResults.length === 0,
    checkedAt: new Date().toISOString(),
    checks: [
      {
        key: "title",
        selector: "Analyse des titres",
        required: true,
        matchedCount: matchedResults.length,
        sample: matchedResults[0]?.title,
        samples: matchedResults.slice(0, 12).map((result) => result.title),
        issueCode: unmatchedResults.length > 0 || matchedResults.length === 0 ? "no_match" : undefined,
      },
    ],
    derivedValues: [],
  };
};

export const buildTitleAnalysisValidationPresentation = (
  validationResult: ScraperFeatureValidationResult | null,
  testedCount: number,
) => {
  if (!validationResult) {
    return null;
  }

  const matchedCount = validationResult.checks.find((check) => check.key === "title")?.matchedCount ?? 0;
  const summary = validationResult.ok
    ? `${matchedCount}/${testedCount} titre(s) analyses.`
    : `${matchedCount}/${testedCount} titre(s) analyses, certains exemples restent sans variante.`;

  return {
    summary,
    details: [summary],
    warning: validationResult.ok
      ? undefined
      : "Ajuste l'ordre ou les blocs des variantes, puis relance le test.",
  };
};

export const createTitleAnalysisBlock = (
  kind: ScraperTitleAnalysisBlockKind,
): ScraperTitleAnalysisBlockConfig => ({
  id: createTitleAnalysisDraftId("block"),
  kind,
  enabled: true,
  optional: kind === "parentheses" || kind === "suffixes",
  field: kind === "title"
    ? "title"
    : kind === "parentheses"
      ? "parody"
      : kind === "suffixes"
        ? undefined
        : "authors",
  innerField: kind === "bracketWithParentheses" ? "authors" : undefined,
  validation: "none",
  onValidationFailure: "rejectVariant",
});

export const createTitleAnalysisVariant = (): ScraperTitleAnalysisVariantConfig => ({
  id: createTitleAnalysisDraftId("variant"),
  name: "Nouvelle variante",
  enabled: true,
  blocks: [
    createTitleAnalysisBlock("title"),
    createTitleAnalysisBlock("suffixes"),
  ],
});

export const createTitleAnalysisSuffixMapping = (): ScraperTitleSuffixMapping => ({
  value: "",
  kind: "tag",
});

export const moveArrayItem = <T,>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] => {
  if (
    fromIndex === toIndex
    || fromIndex < 0
    || toIndex < 0
    || fromIndex >= items.length
    || toIndex >= items.length
  ) {
    return items;
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
};
