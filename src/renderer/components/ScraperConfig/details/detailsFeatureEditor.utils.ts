import {
  buildScraperTemplateUrl,
  FetchScraperDocumentResult,
  resolveScraperUrl,
  ScraperDetailsDerivedValueConfig,
  ScraperDetailsFeatureConfig,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
} from '@/shared/scraper';
import { Field } from '@/renderer/components/utils/Form/types';
import { ScraperValidationPresentation } from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';

export type DerivedValueFormItem = ScraperDetailsDerivedValueConfig & {
  draftId: string;
};

export type DetailsFormState = Omit<ScraperDetailsFeatureConfig, 'derivedValues'> & {
  derivedValues: DerivedValueFormItem[];
};

export type FakeDetailsPreview = {
  title?: string;
  cover?: string;
  description?: string;
  authors?: string;
  tags?: string;
  status?: string;
  derivedValues: Array<{ key: string; value: string }>;
};

export const URL_STRATEGY_FIELD: Field = {
  name: 'urlStrategy',
  label: 'Strategie de construction de l\'URL',
  type: 'radio',
  layout: 'cards',
  required: true,
  options: [
    {
      label: 'Depuis une URL',
      value: 'result_url',
      description: 'La fiche sera ouverte a partir d\'une URL deja connue, par exemple depuis la recherche.',
    },
    {
      label: 'Depuis un template',
      value: 'template',
      description: 'La fiche sera construite a partir d\'un pattern du type /manga/{{id}} ou /title/{{slug}}.',
    },
  ],
};

export const URL_TEMPLATE_FIELD: Field = {
  name: 'urlTemplate',
  label: 'Template d\'URL',
  type: 'text',
  placeholder: 'Exemple : /manga/{{id}}/ ou /works/{{slug}}',
};

export const TEST_URL_FIELD: Field = {
  name: 'testUrl',
  label: 'URL ou chemin de test',
  type: 'text',
  placeholder: 'Exemple : /manga/123 ou https://momoniji.com/...',
};

export const TEST_VALUE_FIELD: Field = {
  name: 'testValue',
  label: 'Valeur de test',
  type: 'text',
  placeholder: 'Exemple : 123, one-piece ou autre valeur utile au template',
};

export const SELECTOR_FIELDS: Field[] = [
  {
    name: 'titleSelector',
    label: 'Selecteur du titre',
    type: 'text',
    required: true,
    placeholder: 'Exemple : h1',
  },
  {
    name: 'coverSelector',
    label: 'Selecteur de la couverture',
    type: 'text',
    placeholder: 'Exemple : .cover img@src',
  },
  {
    name: 'descriptionSelector',
    label: 'Selecteur de la description',
    type: 'text',
    placeholder: 'Exemple : .entry-content p',
  },
  {
    name: 'authorsSelector',
    label: 'Selecteur des auteurs',
    type: 'text',
    placeholder: 'Exemple : .meta .author a',
  },
  {
    name: 'tagsSelector',
    label: 'Selecteur des tags',
    type: 'text',
    placeholder: 'Exemple : .tagcloud a',
  },
  {
    name: 'statusSelector',
    label: 'Selecteur du statut',
    type: 'text',
    placeholder: 'Exemple : .status',
  },
];

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
  pages: 'Pages',
};

export const DERIVED_VALUE_SOURCE_OPTIONS = [
  { value: 'field', label: 'Champ deja extrait' },
  { value: 'selector', label: 'Selecteur personnalise' },
  { value: 'requested_url', label: 'URL demandee' },
  { value: 'final_url', label: 'URL finale' },
] as const;

export const DERIVED_VALUE_FIELD_OPTIONS = [
  { value: 'title', label: 'Titre' },
  { value: 'cover', label: 'Couverture' },
  { value: 'description', label: 'Description' },
  { value: 'authors', label: 'Auteurs' },
  { value: 'tags', label: 'Tags' },
  { value: 'status', label: 'Statut' },
] as const;

export const DEFAULT_DETAILS_CONFIG: ScraperDetailsFeatureConfig = {
  urlStrategy: 'result_url',
  urlTemplate: '',
  testUrl: '',
  testValue: '',
  titleSelector: '',
  coverSelector: '',
  descriptionSelector: '',
  authorsSelector: '',
  tagsSelector: '',
  statusSelector: '',
  derivedValues: [],
};

export const DERIVED_VALUE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const trimOptional = (value: unknown): string | undefined => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

export const normalizeSelectorInput = (input: string): string => input
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const trimOptionalSelector = (value: unknown): string | undefined => {
  const normalized = normalizeSelectorInput(String(value ?? ''));
  return normalized ? normalized : undefined;
};

const truncateValue = (value: string, max = 160): string => (
  value.length > max ? `${value.slice(0, max - 3)}...` : value
);

const createDraftId = (): string => `derived-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const isFieldKey = (value: unknown): value is ScraperFeatureValidationCheck['key'] => (
  ['title', 'cover', 'description', 'authors', 'tags', 'status'].includes(String(value))
);

export const createDerivedValueFormItem = (
  value?: Partial<ScraperDetailsDerivedValueConfig>,
): DerivedValueFormItem => ({
  draftId: createDraftId(),
  key: trimOptional(value?.key) ?? '',
  sourceType: value?.sourceType === 'selector'
    || value?.sourceType === 'requested_url'
    || value?.sourceType === 'final_url'
    ? value.sourceType
    : 'field',
  sourceField: isFieldKey(value?.sourceField) ? value.sourceField : undefined,
  selector: trimOptionalSelector(value?.selector),
  pattern: trimOptional(value?.pattern),
});

export const buildDerivedValueConfig = (
  value: Partial<ScraperDetailsDerivedValueConfig>,
): ScraperDetailsDerivedValueConfig => ({
  key: trimOptional(value.key) ?? '',
  sourceType: value.sourceType === 'selector'
    || value.sourceType === 'requested_url'
    || value.sourceType === 'final_url'
    ? value.sourceType
    : 'field',
  sourceField: isFieldKey(value.sourceField) ? value.sourceField : undefined,
  selector: trimOptionalSelector(value.selector),
  pattern: trimOptional(value.pattern),
});

export const hasDerivedValueContent = (value: ScraperDetailsDerivedValueConfig): boolean => (
  Boolean(value.key || value.selector || value.pattern || value.sourceField || value.sourceType !== 'field')
);

export const getConfiguredDerivedValueItems = (
  values: DerivedValueFormItem[],
): Array<{ draftId: string; config: ScraperDetailsDerivedValueConfig }> => values
  .map((value) => ({
    draftId: value.draftId,
    config: buildDerivedValueConfig(value),
  }))
  .filter(({ config }) => hasDerivedValueContent(config));

export const buildDetailsConfig = (values: Partial<DetailsFormState>): ScraperDetailsFeatureConfig => ({
  urlStrategy: values.urlStrategy === 'template' ? 'template' : 'result_url',
  urlTemplate: trimOptional(values.urlTemplate),
  testUrl: trimOptional(values.testUrl),
  testValue: trimOptional(values.testValue),
  titleSelector: normalizeSelectorInput(String(values.titleSelector ?? '')),
  coverSelector: trimOptionalSelector(values.coverSelector),
  descriptionSelector: trimOptionalSelector(values.descriptionSelector),
  authorsSelector: trimOptionalSelector(values.authorsSelector),
  tagsSelector: trimOptionalSelector(values.tagsSelector),
  statusSelector: trimOptionalSelector(values.statusSelector),
  derivedValues: getConfiguredDerivedValueItems(values.derivedValues ?? []).map(({ config }) => config),
});

export const getConfigSignature = (config: ScraperDetailsFeatureConfig): string => JSON.stringify(config);

export const getInitialConfig = (feature: ScraperFeatureDefinition): ScraperDetailsFeatureConfig => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return {
    urlStrategy: raw.urlStrategy === 'template' ? 'template' : 'result_url',
    urlTemplate: trimOptional(raw.urlTemplate),
    testUrl: trimOptional(
      typeof raw.testUrl === 'string'
        ? raw.testUrl
        : typeof raw.exampleUrl === 'string'
          ? raw.exampleUrl
          : '',
    ),
    testValue: trimOptional(raw.testValue),
    titleSelector: normalizeSelectorInput(String(raw.titleSelector ?? '')),
    coverSelector: trimOptionalSelector(raw.coverSelector),
    descriptionSelector: trimOptionalSelector(raw.descriptionSelector),
    authorsSelector: trimOptionalSelector(raw.authorsSelector),
    tagsSelector: trimOptionalSelector(raw.tagsSelector),
    statusSelector: trimOptionalSelector(raw.statusSelector),
    derivedValues: Array.isArray(raw.derivedValues)
      ? raw.derivedValues
        .map((value) => buildDerivedValueConfig(value as Partial<ScraperDetailsDerivedValueConfig>))
        .filter((value) => hasDerivedValueContent(value))
      : DEFAULT_DETAILS_CONFIG.derivedValues,
  };
};

export const createFormStateFromConfig = (config: ScraperDetailsFeatureConfig): DetailsFormState => ({
  ...config,
  derivedValues: config.derivedValues.map((value) => createDerivedValueFormItem(value)),
});

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

  const elements = Array.from(doc.querySelectorAll(selector));
  return elements
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

export const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
): ScraperValidationPresentation => {
  const details: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

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

  if (validationResult.failureCode === 'http_error') {
    errors.push(
      typeof validationResult.status === 'number'
        ? `La page de test a repondu avec le code HTTP ${validationResult.status}.`
        : 'La page de test a repondu avec une erreur HTTP.',
    );
  }

  if (validationResult.failureCode === 'request_failed') {
    errors.push('Impossible de recuperer la fiche de test.');
  }

  validationResult.checks.forEach((check) => {
    const label = CHECK_LABELS[check.key];

    if (check.matchedCount > 0) {
      const sample = check.sample ? truncateValue(check.sample) : `${check.matchedCount} resultat(s)`;
      details.push(`${label} : ${sample}`);
      return;
    }

    if (check.issueCode === 'invalid_selector') {
      const text = `${label} : selecteur invalide.`;
      if (check.required) {
        errors.push(text);
      } else {
        warnings.push(text);
      }
      return;
    }

    if (check.issueCode === 'no_match') {
      const text = `${label} : aucun resultat trouve.`;
      if (check.required) {
        errors.push(text);
      } else {
        warnings.push(text);
      }
    }
  });

  validationResult.derivedValues.forEach((derivedValue) => {
    if (derivedValue.value) {
      details.push(`Variable {{${derivedValue.key}}} : ${truncateValue(derivedValue.value)}`);
      return;
    }

    if (derivedValue.issueCode === 'invalid_pattern') {
      errors.push(`Variable {{${derivedValue.key}}} : regex invalide.`);
      return;
    }

    if (derivedValue.issueCode === 'invalid_selector') {
      errors.push(`Variable {{${derivedValue.key}}} : selecteur source invalide.`);
      return;
    }

    if (derivedValue.issueCode === 'missing_source') {
      errors.push(`Variable {{${derivedValue.key}}} : aucune valeur source disponible.`);
      return;
    }

    if (derivedValue.issueCode === 'no_match') {
      errors.push(
        derivedValue.pattern
          ? `Variable {{${derivedValue.key}}} : la regex ne correspond pas a la valeur source.`
          : `Variable {{${derivedValue.key}}} : aucune valeur source trouvee.`,
      );
    }
  });

  return {
    summary: validationResult.ok
      ? 'La fiche de test repond bien aux selecteurs fournis.'
      : errors[0] || 'La validation de la fiche a echoue.',
    details,
    warning: warnings.length > 0 ? warnings.join(' ') : undefined,
  };
};

export const buildPreviewFromValidation = (
  validationResult: ScraperFeatureValidationResult | null,
): FakeDetailsPreview | null => {
  if (!validationResult) {
    return null;
  }

  const getSample = (key: ScraperFeatureValidationCheck['key']) => (
    validationResult.checks.find((check) => check.key === key && check.matchedCount > 0)?.sample
  );

  const preview: FakeDetailsPreview = {
    title: getSample('title'),
    cover: getSample('cover'),
    description: getSample('description'),
    authors: getSample('authors'),
    tags: getSample('tags'),
    status: getSample('status'),
    derivedValues: validationResult.derivedValues
      .filter((derivedValue) => Boolean(derivedValue.value))
      .map((derivedValue) => ({
        key: derivedValue.key,
        value: derivedValue.value as string,
      })),
  };

  return Object.values(preview).some((value) => (
    Array.isArray(value) ? value.length > 0 : Boolean(value)
  )) ? preview : null;
};

export const getSaveFieldErrors = (
  formValues: DetailsFormState,
  config: ScraperDetailsFeatureConfig,
): Record<string, string> => {
  const errors: Record<string, string> = {};
  const configuredDerivedValues = getConfiguredDerivedValueItems(formValues.derivedValues);
  const seenKeys = new Map<string, string[]>();

  if (!config.titleSelector) {
    errors.titleSelector = 'Le selecteur du titre est requis.';
  }

  if (config.urlStrategy === 'template' && !config.urlTemplate) {
    errors.urlTemplate = 'Le template d\'URL est requis pour ce mode.';
  }

  configuredDerivedValues.forEach(({ draftId, config: derivedValue }) => {
    if (!derivedValue.key) {
      errors[`derivedValues.${draftId}.key`] = 'Le nom de variable est requis.';
    } else if (!DERIVED_VALUE_KEY_PATTERN.test(derivedValue.key)) {
      errors[`derivedValues.${draftId}.key`] = 'Utilise uniquement lettres, chiffres et _.';
    }

    if (derivedValue.sourceType === 'field' && !derivedValue.sourceField) {
      errors[`derivedValues.${draftId}.sourceField`] = 'Choisis le champ source a reutiliser.';
    }

    if (derivedValue.sourceType === 'selector' && !derivedValue.selector) {
      errors[`derivedValues.${draftId}.selector`] = 'Le selecteur source est requis.';
    }

    if (derivedValue.pattern) {
      try {
        new RegExp(derivedValue.pattern);
      } catch {
        errors[`derivedValues.${draftId}.pattern`] = 'Regex invalide.';
      }
    }

    if (derivedValue.key) {
      const current = seenKeys.get(derivedValue.key) ?? [];
      current.push(draftId);
      seenKeys.set(derivedValue.key, current);
    }
  });

  seenKeys.forEach((draftIds, key) => {
    if (draftIds.length < 2) {
      return;
    }

    draftIds.forEach((draftId) => {
      errors[`derivedValues.${draftId}.key`] = `La variable ${key} est deja definie.`;
    });
  });

  return errors;
};

export const getValidationFieldErrors = (
  formValues: DetailsFormState,
  config: ScraperDetailsFeatureConfig,
): Record<string, string> => {
  const errors = getSaveFieldErrors(formValues, config);

  if (config.urlStrategy === 'result_url' && !config.testUrl) {
    errors.testUrl = 'Une URL ou un chemin de test est requis pour valider.';
  }

  if (config.urlStrategy === 'template' && !config.testValue) {
    errors.testValue = 'Une valeur de test est requise pour valider le template.';
  }

  return errors;
};

export const resolveTestTargetUrl = (
  baseUrl: string,
  config: ScraperDetailsFeatureConfig,
): string => {
  if (config.urlStrategy === 'template') {
    return buildScraperTemplateUrl(baseUrl, config.urlTemplate || '', config.testValue || '');
  }

  return resolveScraperUrl(baseUrl, config.testUrl || '');
};
