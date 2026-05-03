import {
  ScraperChapterItem,
  ScraperChaptersFeatureConfig,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
} from '@/shared/scraper';
import { Field } from '@/renderer/components/utils/Form/types';
import { ScraperValidationPresentation } from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import { formatDisplayUrl } from '@/renderer/components/ScraperConfig/shared/validationDisplay';
import {
  buildDocumentFailure,
  CHECK_LABELS,
  FEATURE_STATUS_META,
  getConfigSignature,
  getInvalidRegexFieldSelectorError,
  hasScraperFieldSelectorValue,
  normalizeSelectorInput,
  normalizeRequiredFieldSelector,
  trimOptional,
  trimOptionalFieldSelector,
  trimOptionalSelector,
} from '@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils';

export {
  buildDocumentFailure,
  FEATURE_STATUS_META,
  getConfigSignature,
  normalizeSelectorInput,
};

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

export const CHAPTER_FIELD_SELECTOR_NAMES = [
  'chapterUrlSelector',
  'chapterLabelSelector',
  'chapterImageSelector',
] as const;

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
  chapterUrlSelector: { kind: 'css', value: '' },
  chapterImageSelector: undefined,
  chapterLabelSelector: { kind: 'css', value: '' },
  reverseOrder: false,
};

export type FakeChaptersPreview = {
  chapters: ScraperChapterItem[];
};

export const buildChaptersConfig = (
  values: Partial<ScraperChaptersFeatureConfig>,
): ScraperChaptersFeatureConfig => ({
  urlStrategy: values.urlStrategy === 'template' ? 'template' : 'details_page',
  urlTemplate: trimOptional(values.urlTemplate),
  templateBase: values.templateBase === 'details_page' ? 'details_page' : 'scraper_base',
  chapterListSelector: trimOptionalSelector(values.chapterListSelector),
  chapterItemSelector: normalizeSelectorInput(String(values.chapterItemSelector ?? '')),
  chapterUrlSelector: normalizeRequiredFieldSelector(values.chapterUrlSelector),
  chapterImageSelector: trimOptionalFieldSelector(values.chapterImageSelector),
  chapterLabelSelector: normalizeRequiredFieldSelector(values.chapterLabelSelector),
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
    chapterUrlSelector: normalizeRequiredFieldSelector(raw.chapterUrlSelector),
    chapterImageSelector: trimOptionalFieldSelector(raw.chapterImageSelector),
    chapterLabelSelector: normalizeRequiredFieldSelector(raw.chapterLabelSelector),
    reverseOrder: Boolean(raw.reverseOrder),
  };
};

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

  if (!hasScraperFieldSelectorValue(config.chapterUrlSelector)) {
    errors.chapterUrlSelector = 'Le selecteur de l\'URL du chapitre est requis.';
  }

  if (!hasScraperFieldSelectorValue(config.chapterLabelSelector)) {
    errors.chapterLabelSelector = 'Le selecteur du label du chapitre est requis.';
  }

  CHAPTER_FIELD_SELECTOR_NAMES.forEach((fieldName) => {
    const error = getInvalidRegexFieldSelectorError(config[fieldName]);
    if (error) {
      errors[fieldName] = error;
    }
  });

  return errors;
};

export const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
): ScraperValidationPresentation => {
  const details: string[] = [];
  const chaptersCheck = validationResult.checks.find((check) => check.key === 'chapters');

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
