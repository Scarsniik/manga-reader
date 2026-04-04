import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Field } from '@/renderer/components/utils/Form/types';
import RadioField from '@/renderer/components/utils/Form/fields/RadioField';
import TextField from '@/renderer/components/utils/Form/fields/TextField';
import {
  buildScraperTemplateUrl,
  FetchScraperDocumentResult,
  resolveScraperUrl,
  ScraperDetailsDerivedValueConfig,
  ScraperDetailsDerivedValueResult,
  ScraperDetailsFeatureConfig,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
  ScraperRecord,
} from '@/shared/scraper';

type Props = {
  scraper: ScraperRecord;
  feature: ScraperFeatureDefinition;
  onBack: () => void;
  onScraperChange: (scraper: ScraperRecord) => void;
};

type DerivedValueFormItem = ScraperDetailsDerivedValueConfig & {
  draftId: string;
};

type DetailsFormState = Omit<ScraperDetailsFeatureConfig, 'derivedValues'> & {
  derivedValues: DerivedValueFormItem[];
};

type FakeDetailsPreview = {
  title?: string;
  cover?: string;
  description?: string;
  authors?: string;
  tags?: string;
  status?: string;
  derivedValues: Array<{ key: string; value: string }>;
};

const URL_STRATEGY_FIELD: Field = {
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

const URL_TEMPLATE_FIELD: Field = {
  name: 'urlTemplate',
  label: 'Template d\'URL',
  type: 'text',
  placeholder: 'Exemple : /manga/{{id}}/ ou /works/{{slug}}',
};

const TEST_URL_FIELD: Field = {
  name: 'testUrl',
  label: 'URL ou chemin de test',
  type: 'text',
  placeholder: 'Exemple : /manga/123 ou https://momoniji.com/...',
};

const TEST_VALUE_FIELD: Field = {
  name: 'testValue',
  label: 'Valeur de test',
  type: 'text',
  placeholder: 'Exemple : 123, one-piece ou autre valeur utile au template',
};

const SELECTOR_FIELDS: Field[] = [
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

const FEATURE_STATUS_META = {
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

const DERIVED_VALUE_SOURCE_OPTIONS = [
  { value: 'field', label: 'Champ deja extrait' },
  { value: 'selector', label: 'Selecteur personnalise' },
  { value: 'requested_url', label: 'URL demandee' },
  { value: 'final_url', label: 'URL finale' },
] as const;

const DERIVED_VALUE_FIELD_OPTIONS = [
  { value: 'title', label: 'Titre' },
  { value: 'cover', label: 'Couverture' },
  { value: 'description', label: 'Description' },
  { value: 'authors', label: 'Auteurs' },
  { value: 'tags', label: 'Tags' },
  { value: 'status', label: 'Statut' },
] as const;

const DEFAULT_DETAILS_CONFIG: ScraperDetailsFeatureConfig = {
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

const DERIVED_VALUE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const trimOptional = (value: unknown): string | undefined => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

const normalizeSelectorInput = (input: string): string => input
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

const isFieldKey = (value: unknown): value is ScraperFeatureValidationCheck['key'] => (
  ['title', 'cover', 'description', 'authors', 'tags', 'status'].includes(String(value))
);

const createDerivedValueFormItem = (
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

const buildDerivedValueConfig = (
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

const hasDerivedValueContent = (value: ScraperDetailsDerivedValueConfig): boolean => (
  Boolean(value.key || value.selector || value.pattern || value.sourceField || value.sourceType !== 'field')
);

const getConfiguredDerivedValueItems = (
  values: DerivedValueFormItem[],
): Array<{ draftId: string; config: ScraperDetailsDerivedValueConfig }> => values
  .map((value) => ({
    draftId: value.draftId,
    config: buildDerivedValueConfig(value),
  }))
  .filter(({ config }) => hasDerivedValueContent(config));

const buildDetailsConfig = (values: Partial<DetailsFormState>): ScraperDetailsFeatureConfig => ({
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

const getConfigSignature = (config: ScraperDetailsFeatureConfig): string => JSON.stringify(config);

const getInitialConfig = (feature: ScraperFeatureDefinition): ScraperDetailsFeatureConfig => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return buildDetailsConfig({
    ...DEFAULT_DETAILS_CONFIG,
    ...raw,
    urlStrategy: raw.urlStrategy === 'template' ? 'template' : 'result_url',
    testUrl: raw.testUrl ?? raw.exampleUrl ?? '',
    derivedValues: Array.isArray(raw.derivedValues)
      ? raw.derivedValues as ScraperDetailsFeatureConfig['derivedValues']
      : [],
  });
};

const createFormStateFromConfig = (config: ScraperDetailsFeatureConfig): DetailsFormState => ({
  ...config,
  derivedValues: config.derivedValues.map((value) => createDerivedValueFormItem(value)),
});

const parseSelectorExpression = (input: string): { selector: string; attribute?: string } => {
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

const extractSelectorValues = (doc: Document, input: string): string[] => {
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

const buildDocumentFailure = (
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

const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
): {
  summary: string;
  details: string[];
  warning?: string;
} => {
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

const buildPreviewFromValidation = (
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

const getSaveFieldErrors = (
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

const getValidationFieldErrors = (
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

const resolveTestTargetUrl = (
  baseUrl: string,
  config: ScraperDetailsFeatureConfig,
): string => {
  if (config.urlStrategy === 'template') {
    return buildScraperTemplateUrl(baseUrl, config.urlTemplate || '', config.testValue || '');
  }

  return resolveScraperUrl(baseUrl, config.testUrl || '');
};

export default function ScraperDetailsFeatureEditor({
  scraper,
  feature,
  onBack,
  onScraperChange,
}: Props) {
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature]);
  const initialFormState = useMemo(
    () => createFormStateFromConfig(initialConfig),
    [initialConfig],
  );
  const [formValues, setFormValues] = useState<DetailsFormState>(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationResult, setValidationResult] = useState<ScraperFeatureValidationResult | null>(
    feature.validation,
  );
  const [lastValidatedSignature, setLastValidatedSignature] = useState<string | null>(
    feature.validation?.ok ? getConfigSignature(initialConfig) : null,
  );
  const [validationUiError, setValidationUiError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setFormValues(initialFormState);
    setFieldErrors({});
    setValidationResult(feature.validation);
    setLastValidatedSignature(feature.validation?.ok ? getConfigSignature(initialConfig) : null);
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);
  }, [feature, initialConfig, initialFormState]);

  const currentStatusMeta = FEATURE_STATUS_META[feature.status];
  const currentConfig = useMemo(() => buildDetailsConfig(formValues), [formValues]);

  const resolvedTestUrl = useMemo(() => {
    try {
      return resolveTestTargetUrl(scraper.baseUrl, currentConfig);
    } catch {
      return null;
    }
  }, [currentConfig, scraper.baseUrl]);

  const validationPresentation = useMemo(
    () => (validationResult ? buildValidationPresentation(validationResult) : null),
    [validationResult],
  );

  const fakePreview = useMemo(
    () => buildPreviewFromValidation(validationResult),
    [validationResult],
  );

  const handleFieldChange = useCallback((fieldName: Exclude<keyof DetailsFormState, 'derivedValues'>) => (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const nextValue = event.target.value;
    setFormValues((previous) => ({
      ...previous,
      [fieldName]: nextValue,
    }));
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    setFieldErrors((previous) => {
      if (!previous[fieldName]) {
        return previous;
      }

      const next = { ...previous };
      delete next[fieldName];
      return next;
    });
  }, []);

  const updateDerivedValue = useCallback((
    draftId: string,
    field: keyof Omit<DerivedValueFormItem, 'draftId'>,
    nextValue: string,
  ) => {
    setFormValues((previous) => ({
      ...previous,
      derivedValues: previous.derivedValues.map((item) => {
        if (item.draftId !== draftId) {
          return item;
        }

        if (field === 'sourceType') {
          const normalizedSourceType = nextValue === 'selector'
            || nextValue === 'requested_url'
            || nextValue === 'final_url'
            ? nextValue
            : 'field';

          return {
            ...item,
            sourceType: normalizedSourceType,
            sourceField: normalizedSourceType === 'field' ? item.sourceField : undefined,
            selector: normalizedSourceType === 'selector' ? item.selector : undefined,
          };
        }

        if (field === 'sourceField') {
          return {
            ...item,
            sourceField: isFieldKey(nextValue) ? nextValue : undefined,
          };
        }

        return {
          ...item,
          [field]: nextValue,
        };
      }),
    }));

    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[`derivedValues.${draftId}.${field}`];

      if (field === 'sourceType') {
        delete next[`derivedValues.${draftId}.sourceField`];
        delete next[`derivedValues.${draftId}.selector`];
      }

      return next;
    });
  }, []);

  const handleAddDerivedValue = useCallback(() => {
    setFormValues((previous) => ({
      ...previous,
      derivedValues: [
        ...previous.derivedValues,
        createDerivedValueFormItem(),
      ],
    }));
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);
  }, []);

  const handleRemoveDerivedValue = useCallback((draftId: string) => {
    setFormValues((previous) => ({
      ...previous,
      derivedValues: previous.derivedValues.filter((item) => item.draftId !== draftId),
    }));
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    setFieldErrors((previous) => {
      const next = { ...previous };
      Object.keys(next)
        .filter((key) => key.startsWith(`derivedValues.${draftId}.`))
        .forEach((key) => {
          delete next[key];
        });
      return next;
    });
  }, []);

  const renderField = useCallback((field: Field) => {
    const value = formValues[field.name as keyof DetailsFormState] ?? '';
    const error = fieldErrors[field.name];

    return (
      <div key={field.name} className="mh-form__field">
        {field.label ? <label htmlFor={field.name}>{field.label}{field.required ? ' *' : ''}</label> : null}

        {field.type === 'radio' ? (
          <RadioField
            field={field}
            value={value}
            onChange={handleFieldChange(field.name as Exclude<keyof DetailsFormState, 'derivedValues'>)}
          />
        ) : (
          <TextField
            field={field}
            value={value}
            onChange={handleFieldChange(field.name as Exclude<keyof DetailsFormState, 'derivedValues'>)}
          />
        )}

        {error ? <div className="mh-form__field-error">{error}</div> : null}
      </div>
    );
  }, [fieldErrors, formValues, handleFieldChange]);

  const handleValidate = useCallback(async () => {
    const config = buildDetailsConfig(formValues);
    const errors = getValidationFieldErrors(formValues, config);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setValidationUiError('Complete d\'abord les champs requis pour lancer le test.');
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      setValidationUiError('La validation de fiche n\'est pas disponible dans cette version de l\'application.');
      return;
    }

    let targetUrl = '';
    try {
      targetUrl = resolveTestTargetUrl(scraper.baseUrl, config);
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : 'Impossible de construire l\'URL de test.');
      return;
    }

    setValidating(true);
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const documentResult = await (window as any).api.fetchScraperDocument({
        baseUrl: scraper.baseUrl,
        targetUrl,
      });

      const typedDocumentResult = documentResult as FetchScraperDocumentResult;
      if (!typedDocumentResult.ok || !typedDocumentResult.html) {
        setValidationResult(buildDocumentFailure(typedDocumentResult));
        return;
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(typedDocumentResult.html, 'text/html');
      const errorsForValidation: string[] = [];
      const checks: ScraperFeatureValidationCheck[] = [];
      const extractedValuesByKey: Partial<Record<ScraperFeatureValidationCheck['key'], string[]>> = {};

      const testSelector = (
        key: ScraperFeatureValidationCheck['key'],
        selector: string | undefined,
        required: boolean,
      ) => {
        if (!selector) return;

        try {
          const values = extractSelectorValues(doc, selector);
          if (values.length > 0) {
            extractedValuesByKey[key] = values;
            checks.push({
              key,
              selector,
              required,
              matchedCount: values.length,
              sample: values[0],
            });
            return;
          }

          checks.push({
            key,
            selector,
            required,
            matchedCount: 0,
            issueCode: 'no_match',
          });

          if (required) {
            errorsForValidation.push(key);
          }
        } catch {
          checks.push({
            key,
            selector,
            required,
            matchedCount: 0,
            issueCode: 'invalid_selector',
          });

          if (required) {
            errorsForValidation.push(key);
          }
        }
      };

      testSelector('title', config.titleSelector, true);
      testSelector('cover', config.coverSelector, false);
      testSelector('description', config.descriptionSelector, false);
      testSelector('authors', config.authorsSelector, false);
      testSelector('tags', config.tagsSelector, false);
      testSelector('status', config.statusSelector, false);

      const derivedValues: ScraperDetailsDerivedValueResult[] = config.derivedValues.map((derivedValue) => {
        const baseResult: ScraperDetailsDerivedValueResult = {
          key: derivedValue.key,
          sourceType: derivedValue.sourceType,
          sourceField: derivedValue.sourceField,
          selector: derivedValue.selector,
          pattern: derivedValue.pattern,
        };

        let sourceValues: string[] = [];

        if (derivedValue.sourceType === 'requested_url') {
          sourceValues = typedDocumentResult.requestedUrl ? [typedDocumentResult.requestedUrl] : [];
        } else if (derivedValue.sourceType === 'final_url') {
          sourceValues = typedDocumentResult.finalUrl
            ? [typedDocumentResult.finalUrl]
            : typedDocumentResult.requestedUrl
              ? [typedDocumentResult.requestedUrl]
              : [];
        } else if (derivedValue.sourceType === 'field') {
          sourceValues = derivedValue.sourceField
            ? (extractedValuesByKey[derivedValue.sourceField] ?? [])
            : [];
        } else {
          try {
            sourceValues = derivedValue.selector
              ? extractSelectorValues(doc, derivedValue.selector)
              : [];
          } catch {
            errorsForValidation.push(`derived:${derivedValue.key}`);
            return {
              ...baseResult,
              issueCode: 'invalid_selector',
            };
          }
        }

        if (sourceValues.length === 0) {
          errorsForValidation.push(`derived:${derivedValue.key}`);
          return {
            ...baseResult,
            issueCode: derivedValue.sourceType === 'requested_url' || derivedValue.sourceType === 'final_url'
              ? 'missing_source'
              : 'no_match',
          };
        }

        const sourceSample = sourceValues[0];

        if (!derivedValue.pattern) {
          return {
            ...baseResult,
            sourceSample,
            value: sourceSample,
          };
        }

        try {
          const match = sourceSample.match(new RegExp(derivedValue.pattern));
          if (!match) {
            errorsForValidation.push(`derived:${derivedValue.key}`);
            return {
              ...baseResult,
              sourceSample,
              issueCode: 'no_match',
            };
          }

          return {
            ...baseResult,
            sourceSample,
            value: match[1] ?? match[0],
          };
        } catch {
          errorsForValidation.push(`derived:${derivedValue.key}`);
          return {
            ...baseResult,
            sourceSample,
            issueCode: 'invalid_pattern',
          };
        }
      });

      const nextResult: ScraperFeatureValidationResult = {
        ok: errorsForValidation.length === 0,
        checkedAt: new Date().toISOString(),
        requestedUrl: typedDocumentResult.requestedUrl,
        finalUrl: typedDocumentResult.finalUrl,
        status: typedDocumentResult.status,
        contentType: typedDocumentResult.contentType,
        checks,
        derivedValues,
      };

      setValidationResult(nextResult);
      if (nextResult.ok) {
        setLastValidatedSignature(getConfigSignature(config));
      }
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : 'Echec de la validation de la fiche.');
    } finally {
      setValidating(false);
    }
  }, [formValues, scraper.baseUrl]);

  const handleSave = useCallback(async () => {
    const config = buildDetailsConfig(formValues);
    const errors = getSaveFieldErrors(formValues, config);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSaveError('Complete les champs requis avant d\'enregistrer.');
      return;
    }

    const matchingValidation = validationResult?.ok
      && lastValidatedSignature === getConfigSignature(config)
      ? validationResult
      : null;

    if (!(window as any).api || typeof (window as any).api.saveScraperFeatureConfig !== 'function') {
      setSaveError('L\'enregistrement du composant n\'est pas disponible dans cette version.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const updatedScraper = await (window as any).api.saveScraperFeatureConfig({
        scraperId: scraper.id,
        featureKind: feature.kind,
        config,
        validation: matchingValidation,
      });

      onScraperChange(updatedScraper as ScraperRecord);
      setSaveMessage(
        matchingValidation?.ok
          ? 'Configuration enregistree et validee.'
          : 'Configuration enregistree. Le composant reste a valider.',
      );
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Echec de l\'enregistrement.');
    } finally {
      setSaving(false);
    }
  }, [feature.kind, formValues, lastValidatedSignature, onScraperChange, scraper.id, validationResult]);

  return (
    <section className="scraper-config-step">
      <div className="scraper-feature-editor__topbar">
        <button type="button" className="secondary" onClick={onBack}>
          Retour aux composants
        </button>
        <span className={`scraper-feature-pill ${currentStatusMeta.className}`}>
          {currentStatusMeta.label}
        </span>
      </div>

      <div className="scraper-config-step__intro">
        <h3>Configurer la fiche manga</h3>
        <p>
          La configuration est maintenant separee en quatre blocs : construction de l&apos;URL,
          extraction par selecteurs, variables extraites, puis test avec apercu de la fiche.
        </p>
      </div>

      <div className="scraper-config-note">
        <strong>Validation facultative</strong>
        <span>
          L&apos;enregistrement reste possible sans test reussi. Dans ce cas, le composant reste
          marque en jaune jusqu&apos;a une validation sauvegardee.
        </span>
      </div>

      <div className="mh-form">
        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Construction de l&apos;URL</h4>
            <p>
              Definis comment l&apos;application saura ouvrir une fiche manga.
            </p>
          </div>

          {renderField(URL_STRATEGY_FIELD)}

          {currentConfig.urlStrategy === 'template' ? (
            <>
              {renderField(URL_TEMPLATE_FIELD)}
              <div className="scraper-config-hint">
                Placeholders supportes : <code>{'{{id}}'}</code>, <code>{'{{slug}}'}</code>,
                <code>{' {{value}}'}</code>, ainsi que leurs variantes brutes
                <code>{' {{rawId}}'}</code>, <code>{'{{rawSlug}}'}</code> et <code>{'{{rawValue}}'}</code>.
              </div>
            </>
          ) : null}
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Scraping</h4>
            <p>
              Indique les selecteurs qui permettent d&apos;extraire les donnees utiles de la fiche.
            </p>
          </div>

          <div className="scraper-config-section__grid">
            {SELECTOR_FIELDS.map(renderField)}
          </div>
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Variables extraites</h4>
            <p>
              Definis ici des variables reutilisables plus tard par d&apos;autres composants, par
              exemple un identifiant derive d&apos;une URL d&apos;image.
            </p>
          </div>

          <div className="scraper-config-hint">
            Chaque variable prend la premiere valeur trouvee dans sa source. Si une regex est
            fournie, le premier groupe capture est utilise. Exemple pour Momoniji :
            <code>{' mangaId'}</code> depuis <code>{'#cif .iw img@src'}</code> avec
            <code>{' d_(\\d+)'}</code>.
          </div>

          {formValues.derivedValues.length ? (
            <div className="scraper-derived-values">
              {formValues.derivedValues.map((derivedValue, index) => (
                <div key={derivedValue.draftId} className="scraper-derived-value-card">
                  <div className="scraper-derived-value-card__header">
                    <strong>{derivedValue.key ? `{{${derivedValue.key}}}` : `Variable ${index + 1}`}</strong>
                    <button
                      type="button"
                      className="secondary scraper-derived-value-card__remove"
                      onClick={() => handleRemoveDerivedValue(derivedValue.draftId)}
                      disabled={validating || saving}
                    >
                      Supprimer
                    </button>
                  </div>

                  <div className="scraper-config-section__grid">
                    <div className="mh-form__field">
                      <label htmlFor={`derived-key-${derivedValue.draftId}`}>Nom de variable *</label>
                      <input
                        id={`derived-key-${derivedValue.draftId}`}
                        type="text"
                        placeholder="Exemple : mangaId"
                        value={derivedValue.key}
                        onChange={(event) => updateDerivedValue(derivedValue.draftId, 'key', event.target.value)}
                      />
                      {fieldErrors[`derivedValues.${derivedValue.draftId}.key`] ? (
                        <div className="mh-form__field-error">
                          {fieldErrors[`derivedValues.${derivedValue.draftId}.key`]}
                        </div>
                      ) : null}
                    </div>

                    <div className="mh-form__field">
                      <label htmlFor={`derived-source-type-${derivedValue.draftId}`}>Source *</label>
                      <select
                        id={`derived-source-type-${derivedValue.draftId}`}
                        value={derivedValue.sourceType}
                        onChange={(event) => updateDerivedValue(derivedValue.draftId, 'sourceType', event.target.value)}
                      >
                        {DERIVED_VALUE_SOURCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {derivedValue.sourceType === 'field' ? (
                      <div className="mh-form__field">
                        <label htmlFor={`derived-source-field-${derivedValue.draftId}`}>Champ source *</label>
                        <select
                          id={`derived-source-field-${derivedValue.draftId}`}
                          value={derivedValue.sourceField ?? ''}
                          onChange={(event) => updateDerivedValue(derivedValue.draftId, 'sourceField', event.target.value)}
                        >
                          <option value="">--</option>
                          {DERIVED_VALUE_FIELD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {fieldErrors[`derivedValues.${derivedValue.draftId}.sourceField`] ? (
                          <div className="mh-form__field-error">
                            {fieldErrors[`derivedValues.${derivedValue.draftId}.sourceField`]}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {derivedValue.sourceType === 'selector' ? (
                      <div className="mh-form__field">
                        <label htmlFor={`derived-selector-${derivedValue.draftId}`}>Selecteur source *</label>
                        <input
                          id={`derived-selector-${derivedValue.draftId}`}
                          type="text"
                          placeholder="Exemple : #cif .iw img@src"
                          value={derivedValue.selector ?? ''}
                          onChange={(event) => updateDerivedValue(derivedValue.draftId, 'selector', event.target.value)}
                        />
                        {fieldErrors[`derivedValues.${derivedValue.draftId}.selector`] ? (
                          <div className="mh-form__field-error">
                            {fieldErrors[`derivedValues.${derivedValue.draftId}.selector`]}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mh-form__field">
                      <label htmlFor={`derived-pattern-${derivedValue.draftId}`}>Regex optionnelle</label>
                      <input
                        id={`derived-pattern-${derivedValue.draftId}`}
                        type="text"
                        placeholder="Exemple : d_(\\d+)"
                        value={derivedValue.pattern ?? ''}
                        onChange={(event) => updateDerivedValue(derivedValue.draftId, 'pattern', event.target.value)}
                      />
                      {fieldErrors[`derivedValues.${derivedValue.draftId}.pattern`] ? (
                        <div className="mh-form__field-error">
                          {fieldErrors[`derivedValues.${derivedValue.draftId}.pattern`]}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="scraper-derived-value-card__footer">
                    Cette variable pourra etre reutilisee plus tard dans les autres composants
                    via <code>{`{{${derivedValue.key || 'nomVariable'}}}`}</code>.
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="scraper-config-placeholder">
              Aucune variable definie pour le moment. Tu peux en ajouter une si la fiche contient
              un identifiant, un token ou un chemin utile pour `Pages` ou d&apos;autres blocs.
            </div>
          )}

          <div className="scraper-derived-values__actions">
            <button
              type="button"
              className="secondary"
              onClick={handleAddDerivedValue}
              disabled={validating || saving}
            >
              Ajouter une variable
            </button>
          </div>
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Test</h4>
            <p>
              Fournis une valeur de test, lance la validation et verifie le rendu de la fausse fiche.
            </p>
          </div>

          {currentConfig.urlStrategy === 'template' ? renderField(TEST_VALUE_FIELD) : renderField(TEST_URL_FIELD)}

          <div className="scraper-config-preview">
            <span>URL de test resolue</span>
            <strong>{resolvedTestUrl || 'Complete d\'abord la section URL pour voir l\'aperçu.'}</strong>
          </div>

          <div className="scraper-config-step__actions">
            <button type="button" className="secondary" onClick={onBack} disabled={validating || saving}>
              Retour
            </button>
            <button type="button" className="secondary" onClick={handleValidate} disabled={validating || saving}>
              {validating ? 'Validation en cours...' : 'Valider la fiche'}
            </button>
            <button type="button" className="primary" onClick={handleSave} disabled={validating || saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer la configuration'}
            </button>
          </div>

          {validationResult ? (
            <div className={`scraper-validation-result ${validationResult.ok ? 'is-success' : 'is-error'}`}>
              <div className="scraper-validation-result__title">
                <strong>{validationResult.ok ? 'Validation reussie' : 'Validation echouee'}</strong>
              </div>

              <div className="scraper-validation-result__grid">
                <div>
                  <span>Etat</span>
                  <strong>{validationPresentation?.summary}</strong>
                </div>
                <div>
                  <span>Verifie le</span>
                  <strong>{new Date(validationResult.checkedAt).toLocaleString()}</strong>
                </div>
              </div>

              {validationPresentation?.details.length ? (
                <div className="scraper-validation-result__list">
                  {validationPresentation.details.map((detail) => (
                    <div key={detail}>{detail}</div>
                  ))}
                </div>
              ) : null}

              {validationPresentation?.warning ? (
                <div className="scraper-validation-result__message is-warning">
                  {validationPresentation.warning}
                </div>
              ) : null}
            </div>
          ) : null}

          {fakePreview ? (
            <div className="scraper-fake-details">
              <div className="scraper-fake-details__media">
                {fakePreview.cover ? (
                  <img src={fakePreview.cover} alt={fakePreview.title || 'Couverture'} />
                ) : (
                  <div className="scraper-fake-details__media-placeholder">Image</div>
                )}
              </div>

              <div className="scraper-fake-details__content">
                <h5>{fakePreview.title || 'Titre non detecte'}</h5>

                <div className="scraper-fake-details__meta">
                  {fakePreview.status ? (
                    <span className="scraper-feature-pill is-not-configured">{fakePreview.status}</span>
                  ) : null}
                  {fakePreview.authors ? (
                    <span className="scraper-feature-pill is-configured">{fakePreview.authors}</span>
                  ) : null}
                  {fakePreview.tags ? (
                    <span className="scraper-feature-pill is-validated">{fakePreview.tags}</span>
                  ) : null}
                </div>

                <p>{fakePreview.description || 'Aucune description detectee sur cette page de test.'}</p>

                {fakePreview.derivedValues.length ? (
                  <div className="scraper-fake-details__variables">
                    <span className="scraper-fake-details__variables-title">Variables extraites</span>
                    <div className="scraper-fake-details__variables-list">
                      {fakePreview.derivedValues.map((derivedValue) => (
                        <div key={derivedValue.key} className="scraper-fake-details__variable">
                          <code>{`{{${derivedValue.key}}}`}</code>
                          <strong>{derivedValue.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {validationUiError ? (
        <div className="scraper-validation-result__message is-error">{validationUiError}</div>
      ) : null}

      {saveMessage ? (
        <div className="scraper-validation-result__message is-success">{saveMessage}</div>
      ) : null}

      {saveError ? (
        <div className="scraper-validation-result__message is-error">{saveError}</div>
      ) : null}
    </section>
  );
}
