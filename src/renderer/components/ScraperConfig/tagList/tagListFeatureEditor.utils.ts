import {
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperEntityListFeatureConfig,
  ScraperEntityListItem,
  ScraperEntityListKind,
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

export type EntityListFeatureFormState = ScraperEntityListFeatureConfig;
export type TagListFeatureFormState = EntityListFeatureFormState;

export const TAG_LIST_FIELD_NAMES = [
  "collectFromDetails",
  "urlTemplate",
  "listSelector",
  "itemSelector",
  "nameSelector",
  "urlSelector",
  "countSelector",
  "nextPageSelector",
  "paginationLinkSelector",
] as const;

export const TAG_LIST_FIELD_SELECTOR_NAMES = [
  "nameSelector",
  "urlSelector",
  "countSelector",
  "nextPageSelector",
  "paginationLinkSelector",
] as const;

export type EntityListSourceMode = "scrape" | "collect";
export type TagListSourceMode = EntityListSourceMode;

export const getEntityListSourceModeField = (entityKind: ScraperEntityListKind): Field => {
  const pluralLabel = entityKind === "author" ? "auteurs" : "tags";

  return {
  name: "tagListSourceMode",
  label: "Mode d'alimentation",
  type: "radio",
  layout: "cards",
  required: true,
  options: [
    {
      label: "Scraping",
      value: "scrape",
      description: `Scrape une page de liste de ${pluralLabel} avec une URL et des selecteurs dedies.`,
    },
    {
      label: "Auto",
      value: "collect",
      description: `Ajoute au cache les ${pluralLabel} rencontres quand les fiches du scrapper sont ouvertes.`,
    },
  ],
  };
};

export const getEntityListUrlTemplateField = (entityKind: ScraperEntityListKind): Field => ({
  name: "urlTemplate",
  label: entityKind === "author" ? "URL de liste d'auteurs" : "URL de liste de tags",
  type: "text",
  required: true,
  placeholder: entityKind === "author"
    ? "Exemple : /artists, /authors/?page={{page}}"
    : "Exemple : /tags, /tags/?page={{page}}",
});

export const getEntityListScrapingFields = (entityKind: ScraperEntityListKind): Field[] => {
  const singularLabel = entityKind === "author" ? "auteur" : "tag";
  const pluralLabel = entityKind === "author" ? "auteurs" : "tags";

  return [
  {
    name: "listSelector",
    label: `Conteneur d${entityKind === "author" ? "'" : "e "}${pluralLabel}`,
    type: "text",
    placeholder: "Optionnel : #tag-container, .tag-listing-container",
  },
  {
    name: "itemSelector",
    label: `Bloc ${singularLabel}`,
    type: "text",
    required: true,
    placeholder: "Exemple : a.tag, .filter-elem",
  },
  {
    name: "nameSelector",
    label: "Selecteur du nom",
    type: "text",
    required: true,
    placeholder: "Exemple : .name, a",
  },
  {
    name: "urlSelector",
    label: `Selecteur du lien ou de la valeur ${singularLabel}`,
    type: "text",
    placeholder: "Optionnel : a@href, .tag@data-id, .slug",
  },
  {
    name: "countSelector",
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
};

export const DEFAULT_TAG_LIST_CONFIG: TagListFeatureFormState = {
  collectFromDetails: false,
  urlTemplate: "",
  listSelector: "",
  itemSelector: "",
  nameSelector: { kind: "css", value: "" },
  urlSelector: undefined,
  countSelector: undefined,
  nextPageSelector: undefined,
  paginationLinkSelector: undefined,
};

export const buildTagListConfig = (
  values: Partial<TagListFeatureFormState>,
): ScraperEntityListFeatureConfig => ({
  collectFromDetails: Boolean(values.collectFromDetails),
  urlTemplate: trimOptional(values.urlTemplate) ?? "",
  listSelector: trimOptionalSelector(values.listSelector),
  itemSelector: trimOptionalSelector(values.itemSelector) ?? "",
  nameSelector: normalizeRequiredFieldSelector(values.nameSelector),
  urlSelector: trimOptionalFieldSelector(values.urlSelector),
  countSelector: trimOptionalFieldSelector(values.countSelector),
  nextPageSelector: trimOptionalFieldSelector(values.nextPageSelector),
  paginationLinkSelector: trimOptionalFieldSelector(values.paginationLinkSelector),
});

export const getInitialConfig = (feature: ScraperFeatureDefinition): TagListFeatureFormState => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return {
    collectFromDetails: raw.collectFromDetails === true,
    urlTemplate: trimOptional(raw.urlTemplate) ?? "",
    listSelector: trimOptionalSelector(raw.listSelector ?? raw.tagListSelector),
    itemSelector: trimOptionalSelector(raw.itemSelector ?? raw.tagItemSelector) ?? "",
    nameSelector: normalizeRequiredFieldSelector(raw.nameSelector ?? raw.tagNameSelector),
    urlSelector: trimOptionalFieldSelector(raw.urlSelector ?? raw.tagUrlSelector),
    countSelector: trimOptionalFieldSelector(raw.countSelector ?? raw.tagCountSelector),
    nextPageSelector: trimOptionalFieldSelector(raw.nextPageSelector),
    paginationLinkSelector: trimOptionalFieldSelector(raw.paginationLinkSelector),
  };
};

export const getSaveFieldErrors = (
  config: ScraperEntityListFeatureConfig,
  entityKind: ScraperEntityListKind = "tag",
): Record<string, string> => {
  const errors: Record<string, string> = {};
  const requireManualScrapingConfig = config.collectFromDetails !== true;

  if (requireManualScrapingConfig && !config.urlTemplate) {
    errors.urlTemplate = entityKind === "author"
      ? "L'URL de liste d'auteurs est requise."
      : "L'URL de liste de tags est requise.";
  }

  if (requireManualScrapingConfig && !config.itemSelector) {
    errors.itemSelector = entityKind === "author" ? "Le bloc auteur est requis." : "Le bloc tag est requis.";
  }

  if (requireManualScrapingConfig && !hasScraperFieldSelectorValue(config.nameSelector)) {
    errors.nameSelector = "Le selecteur du nom est requis.";
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
  config: ScraperEntityListFeatureConfig,
  entityKind: ScraperEntityListKind = "tag",
): Record<string, string> => {
  const configForManualValidation: ScraperEntityListFeatureConfig = {
    ...config,
    collectFromDetails: false,
  };

  return getSaveFieldErrors(configForManualValidation, entityKind);
};

export const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
  previewTags: ScraperEntityListItem[],
  previewPage: ScraperRuntimeTagListPageResult | null,
  entityKind: ScraperEntityListKind = "tag",
): ScraperValidationPresentation => {
  const details: string[] = [];
  const warnings: string[] = [];
  const nameCheckKey = entityKind === "author" ? "authors" : "tags";
  const urlCheckKey = entityKind === "author" ? "authorUrl" : "tagUrl";
  const tagsCheck = validationResult.checks.find((check) => check.key === nameCheckKey);
  const tagUrlCheck = validationResult.checks.find((check) => check.key === urlCheckKey);
  const pluralLabel = entityKind === "author" ? "Auteurs" : "Tags";
  const targetLabel = entityKind === "author" ? "auteur" : "tag";
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
    details.push(`${pluralLabel} trouves : ${tagsCheck.matchedCount}`);
  }

  if (tagUrlCheck?.matchedCount) {
    details.push(`Cibles ${targetLabel} detectees : ${tagUrlCheck.matchedCount}`);
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
    details.push(`Premiere cible ${targetLabel} : ${formatDisplayUrl(previewTags[0].url)}`);
  }

  return {
    summary: validationResult.ok
      ? `La liste de ${entityKind === "author" ? "auteurs" : "tags"} renvoie des ${entityKind === "author" ? "auteurs" : "tags"} exploitables.`
      : validationResult.failureCode === "http_error"
        ? typeof validationResult.status === "number"
          ? `La liste de tags a repondu avec le code HTTP ${validationResult.status}.`
          : "La liste de tags a repondu avec une erreur HTTP."
        : validationResult.failureCode === "request_failed"
          ? "Impossible de recuperer la liste de tags."
          : tagsCheck?.issueCode === "no_match"
            ? `Aucun ${targetLabel} exploitable n'a ete trouve avec la configuration actuelle.`
            : `La validation de la liste de ${entityKind === "author" ? "auteurs" : "tags"} a echoue.`,
    details,
    warning: warnings.length ? warnings.join(" ") : undefined,
  };
};
