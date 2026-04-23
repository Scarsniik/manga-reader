import {
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperRequestBodyMode,
  ScraperRequestConfig,
  ScraperRequestField,
  ScraperRequestMethod,
  ScraperSearchFeatureConfig,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import { ScraperRuntimeSearchPageResult } from '@/renderer/utils/scraperRuntime';
import { ScraperValidationPresentation } from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import { formatDisplayUrl } from '@/renderer/components/ScraperConfig/shared/validationDisplay';
import { Field } from '@/renderer/components/utils/Form/types';
import {
  buildDocumentFailure,
  FEATURE_STATUS_META,
  getConfigSignature,
  normalizeSelectorInput,
  trimOptional,
  trimOptionalSelector,
} from '@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils';

export {
  buildDocumentFailure,
  FEATURE_STATUS_META,
  getConfigSignature,
};

export type SearchRequestFieldFormItem = ScraperRequestField & {
  draftId: string;
};

export type SearchRequestFormState = {
  method: ScraperRequestMethod;
  bodyMode: ScraperRequestBodyMode;
  bodyFields: SearchRequestFieldFormItem[];
  body: string;
  contentType: string;
};

export type SearchFeatureFormState = Omit<ScraperSearchFeatureConfig, 'request'> & {
  request: SearchRequestFormState;
};

export const URL_TEMPLATE_FIELD: Field = {
  name: 'urlTemplate',
  label: 'Template d\'URL de recherche',
  type: 'text',
  required: true,
  placeholder: 'Exemple : /?s={{query}}',
};

export const TEST_QUERY_FIELD: Field = {
  name: 'testQuery',
  label: 'Requete de test',
  type: 'text',
  placeholder: 'Optionnel : one piece',
};

export const REQUEST_METHOD_FIELD: Field = {
  name: 'requestMethod',
  label: 'Methode HTTP',
  type: 'radio',
  layout: 'cards',
  required: true,
  options: [
    {
      label: 'GET',
      value: 'GET',
      description: 'La recherche est entierement portee par l\'URL resolue a partir du template.',
    },
    {
      label: 'POST',
      value: 'POST',
      description: 'L\'URL cible reste fixe et la requete envoie son contenu dans le body HTTP.',
    },
  ],
};

export const REQUEST_BODY_MODE_FIELD: Field = {
  name: 'requestBodyMode',
  label: 'Format du body',
  type: 'radio',
  layout: 'cards',
  required: true,
  options: [
    {
      label: 'Formulaire',
      value: 'form',
      description: 'Envoie des couples cle/valeur en x-www-form-urlencoded, pratique pour la plupart des formulaires.',
    },
    {
      label: 'Brut',
      value: 'raw',
      description: 'Envoie un body texte libre, utile pour du JSON ou des formats specifiques.',
    },
  ],
};

export const SCRAPING_FIELDS: Field[] = [
  {
    name: 'resultListSelector',
    label: 'Conteneur de resultats',
    type: 'text',
    placeholder: 'Optionnel : .search-results',
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

const DEFAULT_REQUEST_FORM_STATE: SearchRequestFormState = {
  method: 'GET',
  bodyMode: 'form',
  bodyFields: [],
  body: '',
  contentType: '',
};

export const DEFAULT_SEARCH_CONFIG: SearchFeatureFormState = {
  urlTemplate: '',
  testQuery: '',
  request: DEFAULT_REQUEST_FORM_STATE,
  resultListSelector: '',
  resultItemSelector: '',
  titleSelector: '',
  detailUrlSelector: '',
  authorUrlSelector: '',
  thumbnailSelector: '',
  summarySelector: '',
  pageCountSelector: '',
  nextPageSelector: '',
};

const createDraftId = (): string => `search-request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createSearchRequestFieldFormItem = (
  value?: Partial<ScraperRequestField>,
): SearchRequestFieldFormItem => ({
  draftId: createDraftId(),
  key: trimOptional(value?.key) ?? '',
  value: typeof value?.value === 'string' ? value.value : '',
});

const hasRequestFieldContent = (value: ScraperRequestField): boolean => (
  Boolean(value.key || value.value.trim().length > 0)
);

const buildRequestFieldConfig = (value: Partial<ScraperRequestField>): ScraperRequestField => ({
  key: trimOptional(value.key) ?? '',
  value: typeof value.value === 'string' ? value.value : '',
});

const getConfiguredRequestFieldItems = (
  values: SearchRequestFieldFormItem[],
): Array<{ draftId: string; config: ScraperRequestField }> => values
  .map((value) => ({
    draftId: value.draftId,
    config: buildRequestFieldConfig(value),
  }))
  .filter(({ config }) => hasRequestFieldContent(config));

export const buildSearchRequestConfig = (
  values: Partial<SearchRequestFormState> | undefined,
): ScraperRequestConfig | undefined => {
  const method = values?.method === 'POST' ? 'POST' : 'GET';
  if (method !== 'POST') {
    return undefined;
  }

  const bodyMode = values?.bodyMode === 'raw' ? 'raw' : 'form';
  const contentType = trimOptional(values?.contentType);

  if (bodyMode === 'raw') {
    return {
      method,
      bodyMode,
      body: typeof values?.body === 'string' ? values.body : '',
      contentType,
    };
  }

  return {
    method,
    bodyMode,
    bodyFields: getConfiguredRequestFieldItems(values?.bodyFields ?? []).map(({ config }) => config),
    contentType,
  };
};

export const buildSearchConfig = (
  values: Partial<SearchFeatureFormState>,
): ScraperSearchFeatureConfig => ({
  urlTemplate: trimOptional(values.urlTemplate) ?? '',
  testQuery: trimOptional(values.testQuery),
  request: buildSearchRequestConfig(values.request),
  resultListSelector: trimOptionalSelector(values.resultListSelector),
  resultItemSelector: normalizeSelectorInput(String(values.resultItemSelector ?? '')),
  titleSelector: normalizeSelectorInput(String(values.titleSelector ?? '')),
  detailUrlSelector: trimOptionalSelector(values.detailUrlSelector),
  authorUrlSelector: trimOptionalSelector(values.authorUrlSelector),
  thumbnailSelector: trimOptionalSelector(values.thumbnailSelector),
  summarySelector: trimOptionalSelector(values.summarySelector),
  pageCountSelector: trimOptionalSelector(values.pageCountSelector),
  nextPageSelector: trimOptionalSelector(values.nextPageSelector),
});

export const getInitialConfig = (feature: ScraperFeatureDefinition): SearchFeatureFormState => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;
  const request = (raw.request ?? {}) as Record<string, unknown>;

  return {
    urlTemplate: trimOptional(raw.urlTemplate) ?? '',
    testQuery: trimOptional(raw.testQuery),
    request: {
      method: request.method === 'POST' ? 'POST' : 'GET',
      bodyMode: request.bodyMode === 'raw' ? 'raw' : 'form',
      bodyFields: Array.isArray(request.bodyFields)
        ? request.bodyFields
          .map((value) => buildRequestFieldConfig(value as Partial<ScraperRequestField>))
          .filter((value) => hasRequestFieldContent(value))
          .map((value) => createSearchRequestFieldFormItem(value))
        : DEFAULT_REQUEST_FORM_STATE.bodyFields,
      body: typeof request.body === 'string' ? request.body : '',
      contentType: trimOptional(request.contentType) ?? '',
    },
    resultListSelector: trimOptionalSelector(raw.resultListSelector),
    resultItemSelector: normalizeSelectorInput(String(raw.resultItemSelector ?? '')),
    titleSelector: normalizeSelectorInput(String(raw.titleSelector ?? '')),
    detailUrlSelector: trimOptionalSelector(raw.detailUrlSelector),
    authorUrlSelector: trimOptionalSelector(raw.authorUrlSelector),
    thumbnailSelector: trimOptionalSelector(raw.thumbnailSelector),
    summarySelector: trimOptionalSelector(raw.summarySelector),
    pageCountSelector: trimOptionalSelector(raw.pageCountSelector),
    nextPageSelector: trimOptionalSelector(raw.nextPageSelector),
  };
};

export const getSaveFieldErrors = (
  formValues: SearchFeatureFormState,
  config: ScraperSearchFeatureConfig,
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (!config.urlTemplate) {
    errors.urlTemplate = 'Le template de recherche est requis.';
  }

  if (!config.resultItemSelector) {
    errors.resultItemSelector = 'Le bloc resultat est requis.';
  }

  if (!config.titleSelector) {
    errors.titleSelector = 'Le selecteur du titre est requis.';
  }

  if (formValues.request.method === 'POST' && formValues.request.bodyMode === 'form') {
    getConfiguredRequestFieldItems(formValues.request.bodyFields).forEach(({ draftId, config: requestField }) => {
      if (!requestField.key) {
        errors[`request.bodyFields.${draftId}.key`] = 'Le nom du champ POST est requis.';
      }
    });
  }

  return errors;
};

export const getValidationFieldErrors = (
  formValues: SearchFeatureFormState,
  config: ScraperSearchFeatureConfig,
): Record<string, string> => getSaveFieldErrors(formValues, config);

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
    details.push(`Resultats trouves : ${titleCheck.matchedCount}`);
  }

  if (previewResults[0]?.detailUrl) {
    details.push(`Premier lien detecte : ${formatDisplayUrl(previewResults[0].detailUrl)}`);
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

  if (previewPage?.nextPageUrl) {
    details.push(`Page suivante detectee : ${formatDisplayUrl(previewPage.nextPageUrl)}`);
  }

  return {
    summary: validationResult.ok
      ? 'La recherche de test renvoie des resultats exploitables.'
      : validationResult.failureCode === 'http_error'
        ? typeof validationResult.status === 'number'
          ? `La page de recherche a repondu avec le code HTTP ${validationResult.status}.`
          : 'La page de recherche a repondu avec une erreur HTTP.'
        : validationResult.failureCode === 'request_failed'
          ? 'Impossible de recuperer la page de recherche.'
          : titleCheck?.issueCode === 'no_match'
            ? 'Aucun resultat exploitable n\'a ete trouve avec la configuration actuelle.'
            : 'La validation de la recherche a echoue.',
    details,
    warning: warnings.length ? warnings.join(' ') : undefined,
  };
};
