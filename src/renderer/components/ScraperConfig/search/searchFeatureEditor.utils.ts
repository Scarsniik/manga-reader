import {
  FetchScraperDocumentResult,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperSearchFeatureConfig,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import {
  normalizeSelectorInput,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import { ScraperValidationPresentation } from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import { Field } from '@/renderer/components/utils/Form/types';

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
    name: 'nextPageSelector',
    label: 'Selecteur page suivante',
    type: 'text',
    placeholder: 'Optionnel : .next a@href',
  },
];

export const DEFAULT_SEARCH_CONFIG: ScraperSearchFeatureConfig = {
  urlTemplate: '',
  testQuery: '',
  resultListSelector: '',
  resultItemSelector: '',
  titleSelector: '',
  detailUrlSelector: '',
  thumbnailSelector: '',
  summarySelector: '',
  nextPageSelector: '',
};

export const FEATURE_STATUS_META = {
  not_configured: { label: 'Non configure', className: 'is-not-configured' },
  configured: { label: 'Configure non valide', className: 'is-configured' },
  validated: { label: 'Valide', className: 'is-validated' },
} as const;

const trimOptional = (value: unknown): string | undefined => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

const trimOptionalSelector = (value: unknown): string | undefined => {
  const normalized = normalizeSelectorInput(String(value ?? ''));
  return normalized ? normalized : undefined;
};

export const buildSearchConfig = (
  values: Partial<ScraperSearchFeatureConfig>,
): ScraperSearchFeatureConfig => ({
  urlTemplate: trimOptional(values.urlTemplate) ?? '',
  testQuery: trimOptional(values.testQuery),
  resultListSelector: trimOptionalSelector(values.resultListSelector),
  resultItemSelector: normalizeSelectorInput(String(values.resultItemSelector ?? '')),
  titleSelector: normalizeSelectorInput(String(values.titleSelector ?? '')),
  detailUrlSelector: trimOptionalSelector(values.detailUrlSelector),
  thumbnailSelector: trimOptionalSelector(values.thumbnailSelector),
  summarySelector: trimOptionalSelector(values.summarySelector),
  nextPageSelector: trimOptionalSelector(values.nextPageSelector),
});

export const getInitialConfig = (feature: ScraperFeatureDefinition): ScraperSearchFeatureConfig => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return {
    urlTemplate: trimOptional(raw.urlTemplate) ?? '',
    testQuery: trimOptional(raw.testQuery),
    resultListSelector: trimOptionalSelector(raw.resultListSelector),
    resultItemSelector: normalizeSelectorInput(String(raw.resultItemSelector ?? '')),
    titleSelector: normalizeSelectorInput(String(raw.titleSelector ?? '')),
    detailUrlSelector: trimOptionalSelector(raw.detailUrlSelector),
    thumbnailSelector: trimOptionalSelector(raw.thumbnailSelector),
    summarySelector: trimOptionalSelector(raw.summarySelector),
    nextPageSelector: trimOptionalSelector(raw.nextPageSelector),
  };
};

export const getConfigSignature = (config: ScraperSearchFeatureConfig): string => JSON.stringify(config);

export const buildDocumentFailure = (
  result: FetchScraperDocumentResult,
): ScraperFeatureValidationResult => ({
  ok: false,
  checkedAt: result.checkedAt,
  requestedUrl: result.requestedUrl,
  finalUrl: result.finalUrl,
  status: result.status,
  contentType: result.contentType,
  failureCode: typeof result.status === 'number' ? 'http_error' : 'request_failed',
  checks: [],
  derivedValues: [],
});

export const getSaveFieldErrors = (config: ScraperSearchFeatureConfig): Record<string, string> => {
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

  return errors;
};

export const getValidationFieldErrors = (
  config: ScraperSearchFeatureConfig,
): Record<string, string> => getSaveFieldErrors(config);

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

  if (validationResult.requestedUrl) {
    details.push(`URL demandee : ${validationResult.requestedUrl}`);
  }

  if (validationResult.finalUrl && validationResult.finalUrl !== validationResult.requestedUrl) {
    details.push(`URL finale : ${validationResult.finalUrl}`);
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
    details.push(`Premier lien detecte : ${previewResults[0].detailUrl}`);
  }

  if (coverCheck?.matchedCount) {
    details.push(`Miniatures detectees : ${coverCheck.matchedCount}`);
  }

  if (summaryCheck?.matchedCount) {
    details.push(`Resumes detectes : ${summaryCheck.matchedCount}`);
  }

  if (previewPage?.nextPageUrl) {
    details.push(`Page suivante detectee : ${previewPage.nextPageUrl}`);
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
