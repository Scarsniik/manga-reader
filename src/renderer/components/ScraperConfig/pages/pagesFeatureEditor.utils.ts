import {
  buildScraperContextTemplateUrl,
  FetchScraperDocumentResult,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
  ScraperPagesFeatureConfig,
  ScraperPagesTemplateBase,
} from '@/shared/scraper';
import { Field } from '@/renderer/components/utils/Form/types';
import { ScraperValidationPresentation } from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import { usesScraperPagesSelectorSource } from '@/renderer/utils/scraperPages';
import { resolveScraperTemplateBaseUrl } from '@/renderer/utils/scraperTemplateContext';

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
  pageImageSelector: '',
  linkedToChapters: false,
};

export const FEATURE_STATUS_META = {
  not_configured: { label: 'Non configure', className: 'is-not-configured' },
  configured: { label: 'Configure non valide', className: 'is-configured' },
  validated: { label: 'Valide', className: 'is-validated' },
} as const;

const CHECK_LABELS: Record<ScraperFeatureValidationCheck['key'], string> = {
  title: 'Titre',
  cover: 'Couverture',
  description: 'Description',
  authors: 'Auteurs',
  tags: 'Tags',
  status: 'Statut',
  chapters: 'Chapitres',
  pages: 'Pages',
};

export const normalizeSelectorInput = (input: string): string => input
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const trimOptional = (value: unknown): string | undefined => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
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
    pageImageSelector: trimOptional(normalizeSelectorInput(String(values.pageImageSelector ?? ''))),
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
    pageImageSelector: trimOptional(normalizeSelectorInput(String(raw.pageImageSelector ?? ''))),
    linkedToChapters: raw.urlStrategy === 'template'
      ? Boolean(raw.linkedToChapters)
      : false,
  };
};

export const parseSelectorExpression = (input: string): { selector: string; attribute?: string } => {
  const trimmed = normalizeSelectorInput(input);
  const atIndex = trimmed.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return { selector: trimmed };
  }

  return {
    selector: trimmed.slice(0, atIndex).trim(),
    attribute: trimmed.slice(atIndex + 1).trim(),
  };
};

export const extractSelectorValues = (doc: Document, input: string): string[] => {
  const { selector, attribute } = parseSelectorExpression(input);
  if (!selector) {
    return [];
  }

  return Array.from(doc.querySelectorAll(selector))
    .map((element) => {
      if (attribute) {
        return element.getAttribute(attribute)?.trim() || '';
      }

      if (element.tagName === 'IMG') {
        return element.getAttribute('src')?.trim() || '';
      }

      return element.textContent?.trim() || '';
    })
    .filter(Boolean);
};

export const toAbsoluteUrl = (value: string, baseUrl: string): string => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

export const getConfigSignature = (config: ScraperPagesFeatureConfig): string => JSON.stringify(config);

export const getSaveFieldErrors = (config: ScraperPagesFeatureConfig): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (usesScraperPagesSelectorSource(config) && !config.pageImageSelector) {
    errors.pageImageSelector = 'Le selecteur des pages est requis.';
  }

  if (config.urlStrategy === 'template' && !config.urlTemplate) {
    errors.urlTemplate = 'Le template d\'URL des pages est requis dans ce mode.';
  }

  return errors;
};

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
