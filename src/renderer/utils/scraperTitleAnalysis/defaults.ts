import {
  type ScraperTitleAnalysisBlockConfig,
  type ScraperTitleAnalysisBlockKind,
  type ScraperTitleAnalysisConfig,
  type ScraperTitleAnalysisField,
  type ScraperTitleAnalysisVariantConfig,
  type ScraperTitleSuffixMapping,
} from "@/shared/scraper";

export const TITLE_ANALYSIS_DEFAULT_TEST_TITLES = [
  "[Maritozzo (Aizawa Uji)] Kanojo ga shite Kurenai Koto, Zenbu Yarasete Kureru Onna Tomodachi [English]",
  "[Joshdinobarney] Gold Week (Fairy Tail) [English] [Uncensored]",
];

export const DEFAULT_TITLE_ANALYSIS_SUFFIX_MAPPINGS: ScraperTitleSuffixMapping[] = [
  { value: "English", kind: "language", languageCode: "en" },
  { value: "Eng", kind: "language", languageCode: "en" },
  { value: "French", kind: "language", languageCode: "fr" },
  { value: "Japanese", kind: "language", languageCode: "ja" },
  { value: "Raw", kind: "language", languageCode: "ja" },
  { value: "Spanish", kind: "language", languageCode: "es" },
  { value: "Chinese", kind: "language", languageCode: "zh" },
  { value: "Korean", kind: "language", languageCode: "ko" },
  { value: "Uncensored", kind: "tag" },
  { value: "Decensored", kind: "tag" },
  { value: "Digital", kind: "tag" },
];

const createBlock = (
  id: string,
  kind: ScraperTitleAnalysisBlockKind,
  field?: ScraperTitleAnalysisField,
  innerField?: ScraperTitleAnalysisField,
  optional = false,
): ScraperTitleAnalysisBlockConfig => ({
  id,
  kind,
  enabled: true,
  optional,
  field,
  innerField,
  validation: "none",
  onValidationFailure: "rejectVariant",
});

const createVariant = (
  id: string,
  name: string,
  blocks: ScraperTitleAnalysisBlockConfig[],
): ScraperTitleAnalysisVariantConfig => ({
  id,
  name,
  enabled: true,
  blocks,
});

export const createDefaultScraperTitleAnalysisConfig = (): ScraperTitleAnalysisConfig => ({
  enabled: false,
  variants: [
    createVariant("circle-author-title-parody-suffixes", "Crochets cercle + auteur", [
      createBlock("prefix", "bracketWithParentheses", "circle", "authors"),
      createBlock("title", "title", "title"),
      createBlock("parody", "parentheses", "parody", undefined, true),
      createBlock("suffixes", "suffixes", undefined, undefined, true),
    ]),
    createVariant("author-title-parody-suffixes", "Crochets auteur seul", [
      createBlock("prefix", "bracket", "authors"),
      createBlock("title", "title", "title"),
      createBlock("parody", "parentheses", "parody", undefined, true),
      createBlock("suffixes", "suffixes", undefined, undefined, true),
    ]),
    createVariant("title-parody-suffixes", "Titre avec parodie et suffixes", [
      createBlock("title", "title", "title"),
      createBlock("parody", "parentheses", "parody", undefined, true),
      createBlock("suffixes", "suffixes", undefined, undefined, true),
    ]),
    createVariant("raw-title", "Fallback titre brut", [
      createBlock("title", "title", "title"),
    ]),
  ],
  suffixMappings: DEFAULT_TITLE_ANALYSIS_SUFFIX_MAPPINGS,
  manualTestTitles: TITLE_ANALYSIS_DEFAULT_TEST_TITLES,
  searchTestQuery: "",
  searchTestLimit: 20,
});

