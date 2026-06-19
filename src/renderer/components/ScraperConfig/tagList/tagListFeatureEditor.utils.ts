import {
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperTagListFeatureConfig,
  ScraperTagListItem,
} from "@/shared/scraper";
import type { ScraperRuntimeTagListPageResult } from "@/renderer/utils/scraperRuntime";
import type { ScraperValidationPresentation } from "@/renderer/components/ScraperConfig/shared/ScraperValidationSummary";
import { formatDisplayUrl } from "@/renderer/components/ScraperConfig/shared/validationDisplay";
import type { Field } from "@/renderer/components/utils/Form/types";
import {
  buildDocumentFailure,
  FEATURE_STATUS_META,
  getConfigSignature,
  getInvalidRegexFieldSelectorError,
  hasScraperFieldSelectorValue,
  normalizeRequiredFieldSelector,
  trimOptional,
  trimOptionalFieldSelector,
  trimOptionalSelector,
} from "@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils";

export {
  buildDocumentFailure,
  FEATURE_STATUS_META,
  getConfigSignature,
};

export type TagListFeatureFormState = ScraperTagListFeatureConfig;

export const TAG_LIST_FIELD_NAMES = [
  "collectFromDetails",
  "urlTemplate",
  "tagListSelector",
  "tagItemSelector",
  "tagNameSelector",
  "tagUrlSelector",
  "tagCountSelector",
  "nextPageSelector",
  "paginationLinkSelector",
] as const;

export const TAG_LIST_FIELD_SELECTOR_NAMES = [
  "tagNameSelector",
  "tagUrlSelector",
  "tagCountSelector",
  "nextPageSelector",
  "paginationLinkSelector",
] as const;

export type TagListSourceMode = "scrape" | "collect";

export const TAG_LIST_SOURCE_MODE_FIELD: Field = {
  name: "tagListSourceMode",
  label: "Mode d'alimentation",
  type: "radio",
  layout: "cards",
  required: true,
  options: [
    {
      label: "Scraping",
      value: "scrape",
      description: "Scrape une page de liste de tags avec une URL et des selecteurs dedies.",
    },
    {
      label: "Auto",
      value: "collect",
      description: "Ajoute au cache les tags rencontres quand les fiches du scrapper sont ouvertes.",
    },
  ],
};

export const URL_TEMPLATE_FIELD: Field = {
  name: "urlTemplate",
  label: "URL de liste de tags",
  type: "text",
  required: true,
  placeholder: "Exemple : /tags, /tags/?page={{page}}",
};

export const SCRAPING_FIELDS: Field[] = [
  {
    name: "tagListSelector",
    label: "Conteneur de tags",
    type: "text",
    placeholder: "Optionnel : #tag-container, .tag-listing-container",
  },
  {
    name: "tagItemSelector",
    label: "Bloc tag",
    type: "text",
    required: true,
    placeholder: "Exemple : a.tag, .filter-elem",
  },
  {
    name: "tagNameSelector",
    label: "Selecteur du nom",
    type: "text",
    required: true,
    placeholder: "Exemple : .name, a",
  },
  {
    name: "tagUrlSelector",
    label: "Selecteur du lien tag",
    type: "text",
    placeholder: "Optionnel : a@href, .name@href",
  },
  {
    name: "tagCountSelector",
    label: "Selecteur du compteur",
    type: "text",
    placeholder: "Optionnel : .count, a@data-qty",
  },
  {
    name: "nextPageSelector",
    label: "Selecteur page suivante",
    type: "text",
    placeholder: "Optionnel : .next a@href",
  },
  {
    name: "paginationLinkSelector",
    label: "Liens pages ou lettres",
    type: "text",
    placeholder: "Optionnel : .pagination a@href, .alphabetical-pagination a@href",
  },
];

export const DEFAULT_TAG_LIST_CONFIG: TagListFeatureFormState = {
  collectFromDetails: false,
  urlTemplate: "",
  tagListSelector: "",
  tagItemSelector: "",
  tagNameSelector: { kind: "css", value: "" },
  tagUrlSelector: undefined,
  tagCountSelector: undefined,
  nextPageSelector: undefined,
  paginationLinkSelector: undefined,
};

export const buildTagListConfig = (
  values: Partial<TagListFeatureFormState>,
): ScraperTagListFeatureConfig => ({
  collectFromDetails: Boolean(values.collectFromDetails),
  urlTemplate: trimOptional(values.urlTemplate) ?? "",
  tagListSelector: trimOptionalSelector(values.tagListSelector),
  tagItemSelector: trimOptionalSelector(values.tagItemSelector) ?? "",
  tagNameSelector: normalizeRequiredFieldSelector(values.tagNameSelector),
  tagUrlSelector: trimOptionalFieldSelector(values.tagUrlSelector),
  tagCountSelector: trimOptionalFieldSelector(values.tagCountSelector),
  nextPageSelector: trimOptionalFieldSelector(values.nextPageSelector),
  paginationLinkSelector: trimOptionalFieldSelector(values.paginationLinkSelector),
});

export const getInitialConfig = (feature: ScraperFeatureDefinition): TagListFeatureFormState => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return {
    collectFromDetails: raw.collectFromDetails === true,
    urlTemplate: trimOptional(raw.urlTemplate) ?? "",
    tagListSelector: trimOptionalSelector(raw.tagListSelector),
    tagItemSelector: trimOptionalSelector(raw.tagItemSelector) ?? "",
    tagNameSelector: normalizeRequiredFieldSelector(raw.tagNameSelector),
    tagUrlSelector: trimOptionalFieldSelector(raw.tagUrlSelector),
    tagCountSelector: trimOptionalFieldSelector(raw.tagCountSelector),
    nextPageSelector: trimOptionalFieldSelector(raw.nextPageSelector),
    paginationLinkSelector: trimOptionalFieldSelector(raw.paginationLinkSelector),
  };
};

export const getSaveFieldErrors = (
  config: ScraperTagListFeatureConfig,
): Record<string, string> => {
  const errors: Record<string, string> = {};
  const requireManualScrapingConfig = config.collectFromDetails !== true;

  if (requireManualScrapingConfig && !config.urlTemplate) {
    errors.urlTemplate = "L'URL de liste de tags est requise.";
  }

  if (requireManualScrapingConfig && !config.tagItemSelector) {
    errors.tagItemSelector = "Le bloc tag est requis.";
  }

  if (requireManualScrapingConfig && !hasScraperFieldSelectorValue(config.tagNameSelector)) {
    errors.tagNameSelector = "Le selecteur du nom est requis.";
  }

  TAG_LIST_FIELD_SELECTOR_NAMES.forEach((fieldName) => {
    const error = getInvalidRegexFieldSelectorError(config[fieldName]);
    if (error) {
      errors[fieldName] = error;
    }
  });

  return errors;
};

export const getValidationFieldErrors = (
  config: ScraperTagListFeatureConfig,
): Record<string, string> => {
  const configForManualValidation: ScraperTagListFeatureConfig = {
    ...config,
    collectFromDetails: false,
  };

  return getSaveFieldErrors(configForManualValidation);
};

export const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
  previewTags: ScraperTagListItem[],
  previewPage: ScraperRuntimeTagListPageResult | null,
): ScraperValidationPresentation => {
  const details: string[] = [];
  const warnings: string[] = [];
  const tagsCheck = validationResult.checks.find((check) => check.key === "tags");
  const tagUrlCheck = validationResult.checks.find((check) => check.key === "tagUrl");
  const pageCountCheck = validationResult.checks.find((check) => check.key === "pageCount");
  const paginationCheck = validationResult.checks.find((check) => check.key === "pages");

  if (validationResult.requestedUrl) {
    details.push(`URL demandee : ${formatDisplayUrl(validationResult.requestedUrl)}`);
  }

  if (validationResult.finalUrl && validationResult.finalUrl !== validationResult.requestedUrl) {
    details.push(`URL finale : ${formatDisplayUrl(validationResult.finalUrl)}`);
  }

  if (typeof validationResult.status === "number") {
    details.push(`Code HTTP : ${validationResult.status}`);
  }

  if (validationResult.contentType) {
    details.push(`Content-Type : ${validationResult.contentType}`);
    if (!validationResult.contentType.toLowerCase().includes("html")) {
      warnings.push("Le type de contenu ne ressemble pas a une page HTML.");
    }
  }

  if (tagsCheck?.matchedCount) {
    details.push(`Tags trouves : ${tagsCheck.matchedCount}`);
  }

  if (tagUrlCheck?.matchedCount) {
    details.push(`Liens tag detectes : ${tagUrlCheck.matchedCount}`);
  }

  if (pageCountCheck?.matchedCount) {
    details.push(`Compteurs detectes : ${pageCountCheck.matchedCount}`);
  }

  if (paginationCheck?.matchedCount) {
    details.push(`Liens de pagination detectes : ${paginationCheck.matchedCount}`);
  }

  if (previewPage?.nextPageUrl) {
    details.push(`Page suivante detectee : ${formatDisplayUrl(previewPage.nextPageUrl)}`);
  }

  if (previewTags[0]?.url) {
    details.push(`Premier lien tag : ${formatDisplayUrl(previewTags[0].url)}`);
  }

  return {
    summary: validationResult.ok
      ? "La liste de tags renvoie des tags exploitables."
      : validationResult.failureCode === "http_error"
        ? typeof validationResult.status === "number"
          ? `La liste de tags a repondu avec le code HTTP ${validationResult.status}.`
          : "La liste de tags a repondu avec une erreur HTTP."
        : validationResult.failureCode === "request_failed"
          ? "Impossible de recuperer la liste de tags."
          : tagsCheck?.issueCode === "no_match"
            ? "Aucun tag exploitable n'a ete trouve avec la configuration actuelle."
            : "La validation de la liste de tags a echoue.",
    details,
    warning: warnings.length ? warnings.join(" ") : undefined,
  };
};
