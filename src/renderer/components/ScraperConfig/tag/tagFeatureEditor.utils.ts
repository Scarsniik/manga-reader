import {
  ScraperCardListConfig,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperSearchResultItem,
  ScraperTagFeatureConfig,
} from '@/shared/scraper';
import { ScraperRuntimeSearchPageResult } from '@/renderer/utils/scraperRuntime';
import { ScraperValidationPresentation } from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import { Field } from '@/renderer/components/utils/Form/types';
import {
  buildDocumentFailure,
  buildLanguageDetectionConfig,
  FEATURE_STATUS_META,
  getConfigSignature,
  trimOptional,
  trimOptionalFieldSelector,
} from '@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils';
import {
  buildListingScrapingFields,
  buildListingValidationPresentation,
  getListingSaveFieldErrors,
  getListingValidationFieldErrors,
  LISTING_SCRAPING_FIELD_NAMES,
  LISTING_SCRAPING_FIELD_SELECTOR_NAMES,
  ListingScrapingFieldName,
} from '@/renderer/components/ScraperConfig/shared/listingFeatureEditor.utils';

export {
  buildDocumentFailure,
  FEATURE_STATUS_META,
  getConfigSignature,
};

export type TagFeatureFormState = ScraperTagFeatureConfig;

export const TAG_SCRAPING_FIELD_NAMES = LISTING_SCRAPING_FIELD_NAMES;

export type TagScrapingFieldName = ListingScrapingFieldName;

export const TAG_NAME_SELECTOR_FIELD: Field = {
  name: 'tagNameSelector',
  label: 'Selecteur du nom tag',
  type: 'text',
  placeholder: 'Optionnel : h1, .tag-title, .archive-title',
};

export const URL_STRATEGY_FIELD: Field = {
  name: 'urlStrategy',
  label: 'Strategie de construction de l\'URL tag',
  type: 'radio',
  layout: 'cards',
  required: true,
  options: [
    {
      label: 'Depuis une URL',
      value: 'result_url',
      description: 'La page tag sera ouverte a partir d\'une URL deja connue.',
    },
    {
      label: 'Depuis un template',
      value: 'template',
      description: 'La page tag sera construite a partir d\'un pattern qui reutilise le nom ou le slug du tag.',
    },
  ],
};

export const URL_TEMPLATE_FIELD: Field = {
  name: 'urlTemplate',
  label: 'Template d\'URL tag',
  type: 'text',
  placeholder: 'Exemple : /tag/{{value}}/ ou /genre/{{rawValue}}/',
};

export const TEST_URL_FIELD: Field = {
  name: 'testUrl',
  label: 'URL ou chemin de test',
  type: 'text',
  placeholder: 'Exemple : /tag/action/ ou https://example.com/tag/action',
};

export const TEST_VALUE_FIELD: Field = {
  name: 'testValue',
  label: 'Valeur tag de test',
  type: 'text',
  placeholder: 'Exemple : action, romance, slug-tag',
};

export const SCRAPING_FIELDS: Field[] = [
  {
    name: 'resultListSelector',
    label: 'Conteneur de resultats',
    type: 'text',
    placeholder: 'Optionnel : .tag-archive, .search-results',
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

export const SCRAPING_FIELD_SELECTOR_NAMES = LISTING_SCRAPING_FIELD_SELECTOR_NAMES;

const TAG_FEATURE_FIELD_SELECTOR_NAMES = [
  'tagNameSelector',
  ...SCRAPING_FIELD_SELECTOR_NAMES,
] as const;

export const DEFAULT_TAG_CONFIG: TagFeatureFormState = {
  urlStrategy: 'result_url',
  urlTemplate: '',
  testUrl: '',
  testValue: '',
  tagNameSelector: undefined,
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

export const buildTagScrapingFields = (
  values: Partial<ScraperCardListConfig>,
): Pick<TagFeatureFormState, TagScrapingFieldName> => buildListingScrapingFields(values);

export const buildTagConfig = (
  values: Partial<TagFeatureFormState>,
): ScraperTagFeatureConfig => ({
  urlStrategy: values.urlStrategy === 'template' ? 'template' : 'result_url',
  urlTemplate: trimOptional(values.urlTemplate),
  testUrl: trimOptional(values.testUrl),
  testValue: trimOptional(values.testValue),
  tagNameSelector: trimOptionalFieldSelector(values.tagNameSelector),
  languageDetection: buildLanguageDetectionConfig(values.languageDetection),
  ...buildTagScrapingFields(values),
});

export const getInitialConfig = (feature: ScraperFeatureDefinition): TagFeatureFormState => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return {
    urlStrategy: raw.urlStrategy === 'template' ? 'template' : 'result_url',
    urlTemplate: trimOptional(raw.urlTemplate),
    testUrl: trimOptional(raw.testUrl),
    testValue: trimOptional(raw.testValue),
    tagNameSelector: trimOptionalFieldSelector(raw.tagNameSelector),
    languageDetection: buildLanguageDetectionConfig(raw.languageDetection as Record<string, unknown> | undefined),
    ...buildTagScrapingFields(raw),
  };
};

export const getSaveFieldErrors = (
  config: ScraperTagFeatureConfig,
): Record<string, string> => getListingSaveFieldErrors(config, {
  listingLabel: 'tag',
  fieldSelectorNames: TAG_FEATURE_FIELD_SELECTOR_NAMES,
});

export const getValidationFieldErrors = (
  config: ScraperTagFeatureConfig,
): Record<string, string> => getListingValidationFieldErrors(config, {
  listingLabel: 'tag',
  fieldSelectorNames: TAG_FEATURE_FIELD_SELECTOR_NAMES,
});

export const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
  previewResults: ScraperSearchResultItem[],
  previewPage: ScraperRuntimeSearchPageResult | null,
): ScraperValidationPresentation => buildListingValidationPresentation(validationResult, previewResults, previewPage, {
  listingLabel: 'tag',
  listingNameCheckKey: 'tags',
  listingNameDetailsLabel: 'Nom(s) tag detecte(s)',
});
