import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FetchScraperDocumentResult,
  ScraperDetailsDerivedValueResult,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
  ScraperRecord,
} from '@/shared/scraper';
import ScraperConfigField from '@/renderer/components/ScraperConfig/shared/ScraperConfigField';
import ScraperFeatureEditorHeader from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorHeader';
import ScraperFeatureMessages from '@/renderer/components/ScraperConfig/shared/ScraperFeatureMessages';
import ScraperValidationSummary from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import DetailsDerivedValuesSection from '@/renderer/components/ScraperConfig/details/DetailsDerivedValuesSection';
import FakeDetailsPreview from '@/renderer/components/ScraperConfig/details/FakeDetailsPreview';
import {
  buildDetailsConfig,
  buildDocumentFailure,
  buildPreviewFromValidation,
  buildValidationPresentation,
  createDerivedValueFormItem,
  createFormStateFromConfig,
  DetailsFormState,
  DerivedValueFormItem,
  extractSelectorValues,
  FEATURE_STATUS_META,
  getConfigSignature,
  getInitialConfig,
  getSaveFieldErrors,
  getValidationFieldErrors,
  isFieldKey,
  resolveTestTargetUrl,
  SELECTOR_FIELDS,
  TEST_URL_FIELD,
  TEST_VALUE_FIELD,
  URL_STRATEGY_FIELD,
  URL_TEMPLATE_FIELD,
} from '@/renderer/components/ScraperConfig/details/detailsFeatureEditor.utils';

type Props = {
  scraper: ScraperRecord;
  feature: ScraperFeatureDefinition;
  onBack: () => void;
  onScraperChange: (scraper: ScraperRecord) => void;
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
        if (!selector) {
          return;
        }

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
      <ScraperFeatureEditorHeader
        title="Configurer la fiche manga"
        description={
          'La configuration est maintenant separee en quatre blocs : construction de l\'URL, '
          + 'extraction par selecteurs, variables extraites, puis test avec apercu de la fiche.'
        }
        noteTitle="Validation facultative"
        noteText={
          'L\'enregistrement reste possible sans test reussi. Dans ce cas, le composant reste '
          + 'marque en jaune jusqu\'a une validation sauvegardee.'
        }
        statusClassName={currentStatusMeta.className}
        statusLabel={currentStatusMeta.label}
        onBack={onBack}
      />

      <div className="mh-form">
        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Construction de l&apos;URL</h4>
            <p>
              Definis comment l&apos;application saura ouvrir une fiche manga.
            </p>
          </div>

          <ScraperConfigField
            field={URL_STRATEGY_FIELD}
            value={formValues.urlStrategy}
            error={fieldErrors.urlStrategy}
            onChange={handleFieldChange('urlStrategy')}
          />

          {currentConfig.urlStrategy === 'template' ? (
            <>
              <ScraperConfigField
                field={URL_TEMPLATE_FIELD}
                value={formValues.urlTemplate}
                error={fieldErrors.urlTemplate}
                onChange={handleFieldChange('urlTemplate')}
              />
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
            {SELECTOR_FIELDS.map((field) => {
              const fieldName = field.name as Exclude<keyof DetailsFormState, 'derivedValues'>;

              return (
                <ScraperConfigField
                  key={field.name}
                  field={field}
                  value={formValues[fieldName] ?? ''}
                  error={fieldErrors[field.name]}
                  onChange={handleFieldChange(fieldName)}
                />
              );
            })}
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

          <DetailsDerivedValuesSection
            derivedValues={formValues.derivedValues}
            fieldErrors={fieldErrors}
            validating={validating}
            saving={saving}
            onAdd={handleAddDerivedValue}
            onRemove={handleRemoveDerivedValue}
            onUpdate={updateDerivedValue}
          />
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Test</h4>
            <p>
              Fournis une valeur de test, lance la validation et verifie le rendu de la fausse fiche.
            </p>
          </div>

          {currentConfig.urlStrategy === 'template' ? (
            <ScraperConfigField
              field={TEST_VALUE_FIELD}
              value={formValues.testValue}
              error={fieldErrors.testValue}
              onChange={handleFieldChange('testValue')}
            />
          ) : (
            <ScraperConfigField
              field={TEST_URL_FIELD}
              value={formValues.testUrl}
              error={fieldErrors.testUrl}
              onChange={handleFieldChange('testUrl')}
            />
          )}

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

          <ScraperValidationSummary
            validationResult={validationResult}
            presentation={validationPresentation}
          />

          <FakeDetailsPreview preview={fakePreview} />
        </div>
      </div>

      <ScraperFeatureMessages
        validationUiError={validationUiError}
        saveMessage={saveMessage}
        saveError={saveError}
      />
    </section>
  );
}
