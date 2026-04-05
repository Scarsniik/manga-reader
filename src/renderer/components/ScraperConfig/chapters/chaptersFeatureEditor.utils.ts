import {
  FetchScraperDocumentResult,
  ScraperChapterItem,
  ScraperChaptersFeatureConfig,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
} from '@/shared/scraper';
import { Field } from '@/renderer/components/utils/Form/types';
import { ScraperValidationPresentation } from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';

export const URL_STRATEGY_FIELD: Field = {
  name: 'urlStrategy',
  label: 'Source des chapitres',
  type: 'radio',
  layout: 'cards',
  required: true,
  options: [
    {
      label: 'Depuis la fiche',
      value: 'details_page',
      description: 'Les chapitres sont lus directement depuis le HTML de la fiche manga validee.',
    },
    {
      label: 'Depuis une URL',
      value: 'template',
      description: 'Les chapitres sont lus depuis une URL construite avec les variables extraites de la fiche.',
    },
  ],
};

export const URL_TEMPLATE_FIELD: Field = {
  name: 'urlTemplate',
  label: 'URL des chapitres',
  type: 'text',
  placeholder: 'Exemple : /ajax/chapters/{{mangaId}}?page={{chapterPage}}',
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
      description: 'Les URLs relatives du template partent de l\'URL finale validee de la fiche.',
    },
  ],
};

export const CHAPTER_LIST_SELECTOR_FIELD: Field = {
  name: 'chapterListSelector',
  label: 'Bloc liste',
  type: 'text',
  placeholder: 'Exemple : .chapters, .chapter-list',
};

export const CHAPTER_ITEM_SELECTOR_FIELD: Field = {
  name: 'chapterItemSelector',
  label: 'Bloc chapitre',
  type: 'text',
  required: true,
  placeholder: 'Exemple : li, .chapter-item',
};

export const CHAPTER_URL_SELECTOR_FIELD: Field = {
  name: 'chapterUrlSelector',
  label: 'URL du chapitre',
  type: 'text',
  required: true,
  placeholder: 'Exemple : a@href',
};

export const CHAPTER_LABEL_SELECTOR_FIELD: Field = {
  name: 'chapterLabelSelector',
  label: 'Label du chapitre',
  type: 'text',
  required: true,
  placeholder: 'Exemple : a .chapter-title',
};

export const CHAPTER_IMAGE_SELECTOR_FIELD: Field = {
  name: 'chapterImageSelector',
  label: 'Image du chapitre',
  type: 'text',
  placeholder: 'Exemple : img@src',
};

export const REVERSE_ORDER_FIELD: Field = {
  name: 'reverseOrder',
  label: 'Inverser l\'ordre de la liste',
  type: 'checkbox',
};

export const DEFAULT_CHAPTERS_CONFIG: ScraperChaptersFeatureConfig = {
  urlStrategy: 'details_page',
  urlTemplate: '',
  templateBase: 'scraper_base',
  chapterListSelector: '',
  chapterItemSelector: '',
  chapterUrlSelector: '',
  chapterImageSelector: '',
  chapterLabelSelector: '',
  reverseOrder: false,
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

export type FakeChaptersPreview = {
  chapters: ScraperChapterItem[];
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

const trimOptionalSelector = (value: unknown): string | undefined => {
  const normalized = normalizeSelectorInput(String(value ?? ''));
  return normalized ? normalized : undefined;
};

export const buildChaptersConfig = (
  values: Partial<ScraperChaptersFeatureConfig>,
): ScraperChaptersFeatureConfig => ({
  urlStrategy: values.urlStrategy === 'template' ? 'template' : 'details_page',
  urlTemplate: trimOptional(values.urlTemplate),
  templateBase: values.templateBase === 'details_page' ? 'details_page' : 'scraper_base',
  chapterListSelector: trimOptionalSelector(values.chapterListSelector),
  chapterItemSelector: normalizeSelectorInput(String(values.chapterItemSelector ?? '')),
  chapterUrlSelector: normalizeSelectorInput(String(values.chapterUrlSelector ?? '')),
  chapterImageSelector: trimOptionalSelector(values.chapterImageSelector),
  chapterLabelSelector: normalizeSelectorInput(String(values.chapterLabelSelector ?? '')),
  reverseOrder: Boolean(values.reverseOrder),
});

export const getInitialConfig = (
  feature: ScraperFeatureDefinition,
): ScraperChaptersFeatureConfig => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return {
    urlStrategy: raw.urlStrategy === 'template' ? 'template' : 'details_page',
    urlTemplate: trimOptional(raw.urlTemplate),
    templateBase: raw.templateBase === 'details_page' ? 'details_page' : 'scraper_base',
    chapterListSelector: trimOptionalSelector(raw.chapterListSelector),
    chapterItemSelector: normalizeSelectorInput(String(raw.chapterItemSelector ?? '')),
    chapterUrlSelector: normalizeSelectorInput(String(raw.chapterUrlSelector ?? '')),
    chapterImageSelector: trimOptionalSelector(raw.chapterImageSelector),
    chapterLabelSelector: normalizeSelectorInput(String(raw.chapterLabelSelector ?? '')),
    reverseOrder: Boolean(raw.reverseOrder),
  };
};

export const getConfigSignature = (config: ScraperChaptersFeatureConfig): string => JSON.stringify(config);

export const getSaveFieldErrors = (
  config: ScraperChaptersFeatureConfig,
): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (config.urlStrategy === 'template' && !config.urlTemplate) {
    errors.urlTemplate = 'L\'URL des chapitres est requise dans ce mode.';
  }

  if (!config.chapterItemSelector) {
    errors.chapterItemSelector = 'Le bloc chapitre est requis.';
  }

  if (!config.chapterUrlSelector) {
    errors.chapterUrlSelector = 'Le selecteur de l\'URL du chapitre est requis.';
  }

  if (!config.chapterLabelSelector) {
    errors.chapterLabelSelector = 'Le selecteur du label du chapitre est requis.';
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
  chapters: [],
});

export const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
): ScraperValidationPresentation => {
  const details: string[] = [];
  const chaptersCheck = validationResult.checks.find((check) => check.key === 'chapters');

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

  if (chaptersCheck?.matchedCount) {
    details.push(`Chapitres trouves : ${chaptersCheck.matchedCount}`);
  }

  return {
    summary: validationResult.ok
      ? 'Les chapitres de test ont bien ete detectes.'
      : chaptersCheck?.issueCode === 'invalid_selector'
        ? `${CHECK_LABELS.chapters} : selecteur invalide.`
        : chaptersCheck?.issueCode === 'no_match'
          ? `${CHECK_LABELS.chapters} : aucun chapitre trouve.`
          : 'La validation des chapitres a echoue.',
    details,
  };
};

export const buildPreviewFromValidation = (
  validationResult: ScraperFeatureValidationResult | null,
): FakeChaptersPreview | null => {
  if (!validationResult?.chapters?.length) {
    return null;
  }

  return {
    chapters: validationResult.chapters.slice(0, 8),
  };
};
