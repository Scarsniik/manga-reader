import type {
  ScraperCardListConfig,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperSearchResultItem,
  ScraperSourceFeatureConfig,
} from "@/shared/scraper";
import type { ScraperRuntimeSearchPageResult } from "@/renderer/utils/scraperRuntime";
import type { ScraperValidationPresentation } from "@/renderer/components/ScraperConfig/shared/ScraperValidationSummary";
import type { Field } from "@/renderer/components/utils/Form/types";
import {
  buildDocumentFailure,
  buildLanguageDetectionConfig,
  FEATURE_STATUS_META,
  getConfigSignature,
  trimOptional,
  trimOptionalFieldSelector,
} from "@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils";
import {
  buildListingScrapingFields,
  buildListingValidationPresentation,
  getListingSaveFieldErrors,
  getListingValidationFieldErrors,
  LISTING_SCRAPING_FIELD_NAMES,
  LISTING_SCRAPING_FIELD_SELECTOR_NAMES,
  type ListingScrapingFieldName,
} from "@/renderer/components/ScraperConfig/shared/listingFeatureEditor.utils";
import { SCRAPING_FIELDS } from "@/renderer/components/ScraperConfig/tag/tagFeatureEditor.utils";

export {
  buildDocumentFailure,
  FEATURE_STATUS_META,
  getConfigSignature,
  SCRAPING_FIELDS,
};

export type SourceFeatureFormState = ScraperSourceFeatureConfig;
export const SOURCE_SCRAPING_FIELD_NAMES = LISTING_SCRAPING_FIELD_NAMES;
export type SourceScrapingFieldName = ListingScrapingFieldName;
export const SCRAPING_FIELD_SELECTOR_NAMES = LISTING_SCRAPING_FIELD_SELECTOR_NAMES;

export const SOURCE_NAME_SELECTOR_FIELD: Field = {
  name: "sourceNameSelector",
  label: "Selecteur du nom de la source",
  type: "text",
  placeholder: "Optionnel : h1, .source-title, .archive-title",
};

export const URL_STRATEGY_FIELD: Field = {
  name: "urlStrategy",
  label: "Strategie de construction de l'URL source",
  type: "radio",
  layout: "cards",
  required: true,
  options: [
    {
      label: "Depuis une URL",
      value: "result_url",
      description: "La page source sera ouverte a partir d'une URL deja connue.",
    },
    {
      label: "Depuis un template",
      value: "template",
      description: "La page source sera construite a partir du nom ou du slug de l'oeuvre.",
    },
  ],
};

export const URL_TEMPLATE_FIELD: Field = {
  name: "urlTemplate",
  label: "Template d'URL source",
  type: "text",
  placeholder: "Exemple : /parody/{{value}}/ ou /source/{{rawValue}}/",
};

export const TEST_URL_FIELD: Field = {
  name: "testUrl",
  label: "URL ou chemin de test",
  type: "text",
  placeholder: "Exemple : /parody/example/",
};

export const TEST_VALUE_FIELD: Field = {
  name: "testValue",
  label: "Valeur source de test",
  type: "text",
  placeholder: "Exemple : one-piece, fate",
};

const SOURCE_FEATURE_FIELD_SELECTOR_NAMES = [
  "sourceNameSelector",
  ...SCRAPING_FIELD_SELECTOR_NAMES,
] as const;

export const buildSourceScrapingFields = (
  values: Partial<ScraperCardListConfig>,
): Pick<SourceFeatureFormState, SourceScrapingFieldName> => buildListingScrapingFields(values);

export const buildSourceConfig = (
  values: Partial<SourceFeatureFormState>,
): ScraperSourceFeatureConfig => ({
  urlStrategy: values.urlStrategy === "template" ? "template" : "result_url",
  urlTemplate: trimOptional(values.urlTemplate),
  testUrl: trimOptional(values.testUrl),
  testValue: trimOptional(values.testValue),
  sourceNameSelector: trimOptionalFieldSelector(values.sourceNameSelector),
  languageDetection: buildLanguageDetectionConfig(values.languageDetection),
  ...buildSourceScrapingFields(values),
});

export const getInitialConfig = (feature: ScraperFeatureDefinition): SourceFeatureFormState => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return buildSourceConfig({
    ...raw,
    languageDetection: buildLanguageDetectionConfig(
      raw.languageDetection as Record<string, unknown> | undefined,
    ),
  });
};

export const getSaveFieldErrors = (
  config: ScraperSourceFeatureConfig,
): Record<string, string> => getListingSaveFieldErrors(config, {
  listingLabel: "source",
  fieldSelectorNames: SOURCE_FEATURE_FIELD_SELECTOR_NAMES,
});

export const getValidationFieldErrors = (
  config: ScraperSourceFeatureConfig,
): Record<string, string> => getListingValidationFieldErrors(config, {
  listingLabel: "source",
  fieldSelectorNames: SOURCE_FEATURE_FIELD_SELECTOR_NAMES,
});

export const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
  previewResults: ScraperSearchResultItem[],
  previewPage: ScraperRuntimeSearchPageResult | null,
): ScraperValidationPresentation => buildListingValidationPresentation(
  validationResult,
  previewResults,
  previewPage,
  {
    listingLabel: "source",
    listingNameCheckKey: "sources",
    listingNameDetailsLabel: "Nom de source detecte",
  },
);
