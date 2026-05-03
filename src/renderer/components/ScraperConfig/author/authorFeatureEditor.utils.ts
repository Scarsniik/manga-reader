import {
  ScraperAuthorFeatureConfig,
  ScraperCardListConfig,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import { ScraperRuntimeSearchPageResult } from '@/renderer/utils/scraperRuntime';
import { ScraperValidationPresentation } from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import { formatDisplayUrl } from '@/renderer/components/ScraperConfig/shared/validationDisplay';
import { Field } from '@/renderer/components/utils/Form/types';
import {
  buildDocumentFailure,
  buildLanguageDetectionConfig,
  FEATURE_STATUS_META,
  getConfigSignature,
  getInvalidRegexFieldSelectorError,
  getLanguageDetectionFieldErrors,
  hasScraperFieldSelectorValue,
  normalizeRequiredFieldSelector,
  trimOptional,
  trimOptionalFieldSelector,
  trimOptionalSelector,
} from '@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils';

export {
  buildDocumentFailure,
  FEATURE_STATUS_META,
  getConfigSignature,
};

export type AuthorFeatureFormState = ScraperAuthorFeatureConfig;

export const AUTHOR_SCRAPING_FIELD_NAMES = [
  'resultListSelector',
  'resultItemSelector',
  'titleSelector',
  'detailUrlSelector',
  'authorUrlSelector',
  'thumbnailSelector',
  'summarySelector',
  'pageCountSelector',
  'nextPageSelector',
] as const;

export type AuthorScrapingFieldName = typeof AUTHOR_SCRAPING_FIELD_NAMES[number];

export const URL_STRATEGY_FIELD: Field = {
  name: 'urlStrategy',
  label: 'Strategie de construction de l\'URL auteur',
  type: 'radio',
  layout: 'cards',
  required: true,
  options: [
    {
      label: 'Depuis une URL',
      value: 'result_url',
      description: 'La page auteur sera ouverte a partir d\'une URL deja connue, par exemple depuis `Fiche` ou `Recherche`.',
    },
    {
      label: 'Depuis un template',
      value: 'template',
      description: 'La page auteur sera construite a partir d\'un pattern qui reutilise le nom ou le slug de l\'auteur.',
    },
  ],
};

export const URL_TEMPLATE_FIELD: Field = {
  name: 'urlTemplate',
  label: 'Template d\'URL auteur',
  type: 'text',
  placeholder: 'Exemple : /cartoonist/{{value}}/ ou /author/{{rawValue}}/',
};

export const TEST_URL_FIELD: Field = {
  name: 'testUrl',
  label: 'URL ou chemin de test',
  type: 'text',
  placeholder: 'Exemple : /cartoonist/poliu.../ ou https://momoniji.com/...',
};

export const TEST_VALUE_FIELD: Field = {
  name: 'testValue',
  label: 'Valeur auteur de test',
  type: 'text',
  placeholder: 'Exemple : ぽりうれたん, poliu..., slug-auteur',
};

export const SCRAPING_FIELDS: Field[] = [
  {
    name: 'resultListSelector',
    label: 'Conteneur de resultats',
    type: 'text',
    placeholder: 'Optionnel : .author-archive, .search-results',
  },
  {
    name: 'resultItemSelector',
    label: 'Bloc resultat',
    type: 'text',
    required: true,
    placeholder: 'Exemple : article, .gb, .result-item',
  },
  {
    name: 'titleSelector',
    label: 'Selecteur du titre',
    type: 'text',
    required: true,
    placeholder: 'Exemple : a, h3 a',
  },
  {
    name: 'detailUrlSelector',
    label: 'Selecteur du lien fiche',
    type: 'text',
    placeholder: 'Optionnel : a@href',
  },
  {
    name: 'authorUrlSelector',
    label: 'Selecteur du lien auteur',
    type: 'text',
    placeholder: 'Optionnel : .author a@href',
  },
  {
    name: 'thumbnailSelector',
    label: 'Selecteur de miniature',
    type: 'text',
    placeholder: 'Optionnel : img@src',
  },
  {
    name: 'summarySelector',
    label: 'Selecteur de resume',
    type: 'text',
    placeholder: 'Optionnel : .excerpt, p',
  },
  {
    name: 'pageCountSelector',
    label: 'Selecteur du nombre de pages',
    type: 'text',
    placeholder: 'Optionnel : .pages-count',
  },
  {
    name: 'nextPageSelector',
    label: 'Selecteur page suivante',
    type: 'text',
    placeholder: 'Optionnel : .next a@href',
  },
];

export const SCRAPING_FIELD_SELECTOR_NAMES = [
  'titleSelector',
  'detailUrlSelector',
  'authorUrlSelector',
  'thumbnailSelector',
  'summarySelector',
  'pageCountSelector',
  'nextPageSelector',
] as const;

export const DEFAULT_AUTHOR_CONFIG: AuthorFeatureFormState = {
  urlStrategy: 'result_url',
  urlTemplate: '',
  testUrl: '',
  testValue: '',
  resultListSelector: '',
  resultItemSelector: '',
  titleSelector: { kind: 'css', value: '' },
  detailUrlSelector: undefined,
  authorUrlSelector: undefined,
  thumbnailSelector: undefined,
  summarySelector: undefined,
  pageCountSelector: undefined,
  nextPageSelector: undefined,
  languageDetection: {
    detectFromTitle: false,
    valueMappings: [],
  },
};

export const buildAuthorScrapingFields = (
  values: Partial<ScraperCardListConfig>,
): Pick<AuthorFeatureFormState, AuthorScrapingFieldName> => ({
  resultListSelector: trimOptionalSelector(values.resultListSelector),
  resultItemSelector: trimOptionalSelector(values.resultItemSelector) ?? '',
  titleSelector: normalizeRequiredFieldSelector(values.titleSelector),
  detailUrlSelector: trimOptionalFieldSelector(values.detailUrlSelector),
  authorUrlSelector: trimOptionalFieldSelector(values.authorUrlSelector),
  thumbnailSelector: trimOptionalFieldSelector(values.thumbnailSelector),
  summarySelector: trimOptionalFieldSelector(values.summarySelector),
  pageCountSelector: trimOptionalFieldSelector(values.pageCountSelector),
  nextPageSelector: trimOptionalFieldSelector(values.nextPageSelector),
});

export const buildAuthorConfig = (
  values: Partial<AuthorFeatureFormState>,
): ScraperAuthorFeatureConfig => ({
  urlStrategy: values.urlStrategy === 'template' ? 'template' : 'result_url',
  urlTemplate: trimOptional(values.urlTemplate),
  testUrl: trimOptional(values.testUrl),
  testValue: trimOptional(values.testValue),
  languageDetection: buildLanguageDetectionConfig(values.languageDetection),
  ...buildAuthorScrapingFields(values),
});

export const getInitialConfig = (feature: ScraperFeatureDefinition): AuthorFeatureFormState => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return {
    urlStrategy: raw.urlStrategy === 'template' ? 'template' : 'result_url',
    urlTemplate: trimOptional(raw.urlTemplate),
    testUrl: trimOptional(raw.testUrl),
    testValue: trimOptional(raw.testValue),
    languageDetection: buildLanguageDetectionConfig(raw.languageDetection as Record<string, unknown> | undefined),
    ...buildAuthorScrapingFields(raw),
  };
};

export const getSaveFieldErrors = (
  config: ScraperAuthorFeatureConfig,
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (config.urlStrategy === 'template' && !config.urlTemplate) {
    errors.urlTemplate = 'Le template d\'URL auteur est requis pour ce mode.';
  }

  if (!config.resultItemSelector) {
    errors.resultItemSelector = 'Le bloc resultat est requis.';
  }

  if (!hasScraperFieldSelectorValue(config.titleSelector)) {
    errors.titleSelector = 'Le selecteur du titre est requis.';
  }

  SCRAPING_FIELD_SELECTOR_NAMES.forEach((fieldName) => {
    const error = getInvalidRegexFieldSelectorError(config[fieldName]);
    if (error) {
      errors[fieldName] = error;
    }
  });

  Object.assign(errors, getLanguageDetectionFieldErrors(config.languageDetection));

  return errors;
};

export const getValidationFieldErrors = (
  config: ScraperAuthorFeatureConfig,
): Record<string, string> => {
  const errors = getSaveFieldErrors(config);
  const requiresTemplateValue = typeof config.urlTemplate === 'string'
    && /{{\s*(?:rawValue|rawQuery|value|query)\s*}}/.test(config.urlTemplate);

  if (config.urlStrategy === 'result_url' && !config.testUrl) {
    errors.testUrl = 'Une URL ou un chemin de test est requis pour valider.';
  }

  if (config.urlStrategy === 'template' && requiresTemplateValue && !config.testValue) {
    errors.testValue = 'Une valeur auteur de test est requise pour valider.';
  }

  return errors;
};

export const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
  previewResults: ScraperSearchResultItem[],
  previewPage: ScraperRuntimeSearchPageResult | null,
): ScraperValidationPresentation => {
  const details: string[] = [];
  const warnings: string[] = [];
  const titleCheck = validationResult.checks.find((check) => check.key === 'title');
  const coverCheck = validationResult.checks.find((check) => check.key === 'cover');
  const summaryCheck = validationResult.checks.find((check) => check.key === 'description');
  const authorUrlCheck = validationResult.checks.find((check) => check.key === 'authorUrl');
  const pageCountCheck = validationResult.checks.find((check) => check.key === 'pageCount');
  const languageCheck = validationResult.checks.find((check) => check.key === 'language');

  if (validationResult.requestedUrl) {
    details.push(`URL demandee : ${formatDisplayUrl(validationResult.requestedUrl)}`);
  }

  if (validationResult.finalUrl && validationResult.finalUrl !== validationResult.requestedUrl) {
    details.push(`URL finale : ${formatDisplayUrl(validationResult.finalUrl)}`);
  }

  if (typeof validationResult.status === 'number') {
    details.push(`Code HTTP : ${validationResult.status}`);
  }

  if (validationResult.contentType) {
    details.push(`Content-Type : ${validationResult.contentType}`);
    if (!validationResult.contentType.toLowerCase().includes('html')) {
      warnings.push('Le type de contenu ne ressemble pas a une page HTML.');
    }
  }

  if (titleCheck?.matchedCount) {
    details.push(`Cards extraites : ${titleCheck.matchedCount}`);
  }

  if (previewResults[0]?.detailUrl) {
    details.push(`Premier lien fiche detecte : ${formatDisplayUrl(previewResults[0].detailUrl)}`);
  }

  if (authorUrlCheck?.matchedCount) {
    details.push(`Liens auteur detectes : ${authorUrlCheck.matchedCount}`);
  }

  if (coverCheck?.matchedCount) {
    details.push(`Miniatures detectees : ${coverCheck.matchedCount}`);
  }

  if (summaryCheck?.matchedCount) {
    details.push(`Resumes detectes : ${summaryCheck.matchedCount}`);
  }

  if (pageCountCheck?.matchedCount) {
    details.push(`Nombre de pages detecte(s) : ${pageCountCheck.matchedCount}`);
  }

  if (languageCheck?.matchedCount) {
    details.push(`Langues detectees : ${languageCheck.samples?.join(', ') || languageCheck.sample}`);
  }

  if (previewPage?.nextPageUrl) {
    details.push(`Page suivante detectee : ${formatDisplayUrl(previewPage.nextPageUrl)}`);
  }

  return {
    summary: validationResult.ok
      ? 'La page auteur de test renvoie une liste de cards exploitable.'
      : validationResult.failureCode === 'http_error'
        ? typeof validationResult.status === 'number'
          ? `La page auteur a repondu avec le code HTTP ${validationResult.status}.`
          : 'La page auteur a repondu avec une erreur HTTP.'
        : validationResult.failureCode === 'request_failed'
          ? 'Impossible de recuperer la page auteur.'
          : titleCheck?.issueCode === 'no_match'
            ? 'Aucune card exploitable n\'a ete trouvee avec la configuration actuelle.'
            : 'La validation de la page auteur a echoue.',
    details,
    warning: warnings.length ? warnings.join(' ') : undefined,
  };
};
