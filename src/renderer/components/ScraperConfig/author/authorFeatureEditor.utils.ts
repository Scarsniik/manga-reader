import {
  ScraperAuthorFeatureConfig,
  ScraperCardListConfig,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperSearchResultItem,
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

export type AuthorFeatureFormState = ScraperAuthorFeatureConfig;

export const AUTHOR_SCRAPING_FIELD_NAMES = LISTING_SCRAPING_FIELD_NAMES;

export type AuthorScrapingFieldName = ListingScrapingFieldName;

export const AUTHOR_NAME_SELECTOR_FIELD: Field = {
  name: 'authorNameSelector',
  label: 'Selecteur du nom auteur',
  type: 'text',
  placeholder: 'Optionnel : h1, .author-title, .profile-name',
};

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
  {
    name: 'sourceUrlSelector',
    label: 'Selecteur du lien source',
    type: 'text',
    placeholder: 'Optionnel : .source a@href',
  },
];

export const SCRAPING_FIELD_SELECTOR_NAMES = LISTING_SCRAPING_FIELD_SELECTOR_NAMES;

const AUTHOR_FEATURE_FIELD_SELECTOR_NAMES = [
  'authorNameSelector',
  ...SCRAPING_FIELD_SELECTOR_NAMES,
] as const;

export const DEFAULT_AUTHOR_CONFIG: AuthorFeatureFormState = {
  urlStrategy: 'result_url',
  urlTemplate: '',
  testUrl: '',
  testValue: '',
  authorNameSelector: undefined,
  resultListSelector: '',
  resultItemSelector: '',
  titleSelector: { kind: 'css', value: '' },
  detailUrlSelector: undefined,
  authorUrlSelector: undefined,
  sourceUrlSelector: undefined,
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
): Pick<AuthorFeatureFormState, AuthorScrapingFieldName> => buildListingScrapingFields(values);

export const buildAuthorConfig = (
  values: Partial<AuthorFeatureFormState>,
): ScraperAuthorFeatureConfig => ({
  urlStrategy: values.urlStrategy === 'template' ? 'template' : 'result_url',
  urlTemplate: trimOptional(values.urlTemplate),
  testUrl: trimOptional(values.testUrl),
  testValue: trimOptional(values.testValue),
  authorNameSelector: trimOptionalFieldSelector(values.authorNameSelector),
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
    authorNameSelector: trimOptionalFieldSelector(raw.authorNameSelector),
    languageDetection: buildLanguageDetectionConfig(raw.languageDetection as Record<string, unknown> | undefined),
    ...buildAuthorScrapingFields(raw),
  };
};

export const getSaveFieldErrors = (
  config: ScraperAuthorFeatureConfig,
): Record<string, string> => getListingSaveFieldErrors(config, {
  listingLabel: 'auteur',
  fieldSelectorNames: AUTHOR_FEATURE_FIELD_SELECTOR_NAMES,
});

export const getValidationFieldErrors = (
  config: ScraperAuthorFeatureConfig,
): Record<string, string> => getListingValidationFieldErrors(config, {
  listingLabel: 'auteur',
  fieldSelectorNames: AUTHOR_FEATURE_FIELD_SELECTOR_NAMES,
});

export const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
  previewResults: ScraperSearchResultItem[],
  previewPage: ScraperRuntimeSearchPageResult | null,
): ScraperValidationPresentation => buildListingValidationPresentation(validationResult, previewResults, previewPage, {
  listingLabel: 'auteur',
  listingNameCheckKey: 'authors',
  listingNameDetailsLabel: 'Nom(s) auteur detecte(s)',
});
