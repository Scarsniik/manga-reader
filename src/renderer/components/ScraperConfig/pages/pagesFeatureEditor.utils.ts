import {
  buildScraperContextTemplateUrl,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperPagesFeatureConfig,
  ScraperPagesTemplateBase,
} from '@/shared/scraper';
import { Field } from '@/renderer/components/utils/Form/types';
import { ScraperValidationPresentation } from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import { formatDisplayUrl } from '@/renderer/components/ScraperConfig/shared/validationDisplay';
import { usesScraperPagesSelectorSource } from '@/renderer/utils/scraperPages';
import { resolveScraperTemplateBaseUrl } from '@/renderer/utils/scraperTemplateContext';
import {
  buildDocumentFailure,
  CHECK_LABELS,
  extractSelectorValues,
  FEATURE_STATUS_META,
  getConfigSignature,
  getInvalidRegexFieldSelectorError,
  hasScraperFieldSelectorValue,
  normalizeSelectorInput,
  trimOptionalFieldSelector,
  parseSelectorExpression,
  trimOptional,
} from '@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils';

export {
  buildDocumentFailure,
  extractSelectorValues,
  FEATURE_STATUS_META,
  getConfigSignature,
  normalizeSelectorInput,
  parseSelectorExpression,
};

export const URL_STRATEGY_FIELD: Field = {
  name: 'urlStrategy',
  label: 'Source des pages',
  type: 'radio',
  layout: 'cards',
  required: true,
  options: [
    {
      label: 'Depuis la fiche',
      value: 'details_page',
      description: 'Les pages sont lues depuis le HTML de la fiche manga.',
    },
    {
      label: 'Depuis un chapitre',
      value: 'chapter_page',
      description: 'Les pages sont lues depuis le HTML d\'une page chapitre du composant `Chapitres`.',
    },
    {
      label: 'Depuis un template',
      value: 'template',
      description: 'Les pages sont lues depuis une URL construite avec les variables extraites de la fiche.',
    },
  ],
};

export const URL_TEMPLATE_FIELD: Field = {
  name: 'urlTemplate',
  label: 'Template d\'URL des pages',
  type: 'text',
  placeholder: 'Exemple : /reader/{{mangaId}} ou {{raw:imageBasePath}}index.html',
};

export const TEMPLATE_BASE_FIELD: Field = {
  name: 'templateBase',
  label: 'Base des URLs relatives',
  type: 'radio',
  layout: 'cards',
  required: true,
  options: [
    {
      label: 'Base du scraper',
      value: 'scraper_base',
      description: 'Les URLs relatives du template partent du baseUrl du scraper.',
    },
    {
      label: 'URL de la fiche',
      value: 'details_page',
      description: 'Les URLs relatives du template partent de l\'URL finale validee de la fiche, ou de la page chapitre si ce mode est actif.',
    },
  ],
};

export const PAGE_IMAGE_SELECTOR_FIELD: Field = {
  name: 'pageImageSelector',
  label: 'Selecteur des pages',
  type: 'text',
  placeholder: 'Exemple : #cif .iw img@src',
};

export const LINKED_TO_CHAPTERS_FIELD: Field = {
  name: 'linkedToChapters',
  label: 'Pages liees a des chapitres',
  type: 'checkbox',
};

export const DEFAULT_PAGES_CONFIG: ScraperPagesFeatureConfig = {
  urlStrategy: 'details_page',
  urlTemplate: '',
  templateBase: 'scraper_base',
  pageImageSelector: undefined,
  linkedToChapters: false,
};

const normalizeTemplateBase = (value: unknown): ScraperPagesTemplateBase => (
  value === 'details_page' ? 'details_page' : 'scraper_base'
);

const normalizePagesUrlStrategy = (value: unknown): ScraperPagesFeatureConfig['urlStrategy'] => {
  if (value === 'template') {
    return 'template';
  }

  if (value === 'chapter_page') {
    return 'chapter_page';
  }

  return 'details_page';
};

const getInitialPagesUrlStrategy = (raw: Record<string, unknown>): ScraperPagesFeatureConfig['urlStrategy'] => {
  const normalizedStrategy = normalizePagesUrlStrategy(raw.urlStrategy);

  if (normalizedStrategy === 'details_page' && Boolean(raw.linkedToChapters)) {
    return 'chapter_page';
  }

  return normalizedStrategy;
};

export const buildPagesConfig = (values: Partial<ScraperPagesFeatureConfig>): ScraperPagesFeatureConfig => {
  const urlStrategy = normalizePagesUrlStrategy(values.urlStrategy);

  return {
    urlStrategy,
    urlTemplate: trimOptional(values.urlTemplate),
    templateBase: normalizeTemplateBase(values.templateBase),
    pageImageSelector: trimOptionalFieldSelector(values.pageImageSelector),
    linkedToChapters: urlStrategy === 'template'
      ? Boolean(values.linkedToChapters)
      : false,
  };
};

export const getInitialConfig = (feature: ScraperFeatureDefinition): ScraperPagesFeatureConfig => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return {
    urlStrategy: getInitialPagesUrlStrategy(raw),
    urlTemplate: trimOptional(raw.urlTemplate),
    templateBase: normalizeTemplateBase(raw.templateBase),
    pageImageSelector: trimOptionalFieldSelector(raw.pageImageSelector),
    linkedToChapters: raw.urlStrategy === 'template'
      ? Boolean(raw.linkedToChapters)
      : false,
  };
};

export const toAbsoluteUrl = (value: string, baseUrl: string): string => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

export const getSaveFieldErrors = (config: ScraperPagesFeatureConfig): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (usesScraperPagesSelectorSource(config) && !hasScraperFieldSelectorValue(config.pageImageSelector)) {
    errors.pageImageSelector = 'Le selecteur des pages est requis.';
  }

  const pageImageSelectorError = getInvalidRegexFieldSelectorError(config.pageImageSelector);
  if (pageImageSelectorError) {
    errors.pageImageSelector = pageImageSelectorError;
  }

  if (config.urlStrategy === 'template' && !config.urlTemplate) {
    errors.urlTemplate = 'Le template d\'URL des pages est requis dans ce mode.';
  }

  return errors;
};

export const isImageLikeContentType = (contentType: string | undefined): boolean => (
  typeof contentType === 'string' && contentType.toLowerCase().startsWith('image/')
);

export const padPageNumber = (value: number, length: number): string => String(value).padStart(length, '0');

export const hasPagePlaceholder = (template: string | undefined): boolean => (
  typeof template === 'string' && /{{\s*page(?:Index)?\d*\s*}}/.test(template)
);

export const resolveTemplateBaseUrl = (
  scraperBaseUrl: string,
  config: Pick<ScraperPagesFeatureConfig, 'templateBase'>,
  detailsUrl?: string,
): string => resolveScraperTemplateBaseUrl(scraperBaseUrl, config.templateBase, detailsUrl);

export const buildTemplatePageUrl = (
  baseUrl: string,
  template: string,
  contextBuilder: (pageIndex: number) => Record<string, string | undefined>,
  pageIndex: number,
  options?: {
    relativeToUrl?: string;
  },
): string => buildScraperContextTemplateUrl(baseUrl, template, contextBuilder(pageIndex), options);

export const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
): ScraperValidationPresentation => {
  const details: string[] = [];
  const pagesCheck = validationResult.checks.find((check) => check.key === 'pages');

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
  }

  if (pagesCheck?.matchedCount) {
    details.push(`Pages trouvees : ${pagesCheck.matchedCount}`);
  }

  return {
    summary: validationResult.ok
      ? pagesCheck?.selector
        ? 'Les pages de test ont bien ete detectees.'
        : 'La ressource de page directe est bien accessible.'
      : pagesCheck?.issueCode === 'invalid_selector'
        ? `${CHECK_LABELS.pages} : selecteur invalide.`
        : pagesCheck?.issueCode === 'no_match'
          ? `${CHECK_LABELS.pages} : aucune page trouvee.`
          : 'La validation des pages a echoue.',
    details,
  };
};
