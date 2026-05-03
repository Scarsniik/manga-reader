import React, { useCallback, useEffect, useMemo } from 'react';
import {
  FetchScraperDocumentResult,
  formatScraperFieldSelectorForDisplay,
  ScraperDetailsDerivedValueResult,
  ScraperFieldSelector,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
} from '@/shared/scraper';
import ScraperConfigField from '@/renderer/components/ScraperConfig/shared/ScraperConfigField';
import ScraperFeatureEditorHeader from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorHeader';
import ScraperFeatureMessages from '@/renderer/components/ScraperConfig/shared/ScraperFeatureMessages';
import ScraperLanguageDetectionSection from '@/renderer/components/ScraperConfig/shared/ScraperLanguageDetectionSection';
import ScraperValidationSummary from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import {
  ScraperConfigFieldGrid,
  ScraperFeatureActions,
  ScraperResolvedUrlPreview,
  ScraperUrlTemplateFields,
} from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorSections';
import { useScraperConfig } from '@/renderer/components/ScraperConfig/shared/ScraperConfigContext';
import useSaveScraperFeatureConfig from '@/renderer/components/ScraperConfig/shared/useSaveScraperFeatureConfig';
import useScraperFeatureEditorState from '@/renderer/components/ScraperConfig/shared/useScraperFeatureEditorState';
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
  FIELD_SELECTOR_FIELD_NAMES,
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
import {
  extractScraperAuthorUrlsFromDocument,
  extractScraperDetailsDerivedValueResults,
  extractScraperDetailsFieldValues,
  extractScraperDetailsThumbnailsFromDocument,
  extractScraperDetailsThumbnailsPageFromDocument,
  extractScraperLanguageCodesFromRoot,
} from '@/renderer/utils/scraperRuntime';

type Props = {
  feature: ScraperFeatureDefinition;
  onBack: () => void;
};

export default function ScraperDetailsFeatureEditor({
  feature,
  onBack,
}: Props) {
  const { scraper } = useScraperConfig();
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature]);
  const initialFormState = useMemo(
    () => createFormStateFromConfig(initialConfig),
    [initialConfig],
  );
  const {
    formValues,
    setFormValues,
    fieldErrors,
    setFieldErrors,
    validationResult,
    setValidationResult,
    lastValidatedSignature,
    setLastValidatedSignature,
    validationUiError,
    setValidationUiError,
    validating,
    setValidating,
    saving,
    setSaving,
    saveError,
    setSaveError,
    saveMessage,
    setSaveMessage,
    clearFeedback,
    clearFieldError,
    clearFieldErrorsByPrefix,
    clearFieldErrorsWhere,
    clearFieldFeedback,
    createTextFieldChangeHandler,
    resetEditorState,
  } = useScraperFeatureEditorState<DetailsFormState>({
    initialFormValues: initialFormState,
    initialValidationResult: feature.validation,
    initialValidatedSignature: feature.validation?.ok ? getConfigSignature(initialConfig) : null,
  });

  useEffect(() => {
    resetEditorState();
  }, [feature, resetEditorState]);

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

  const handleFieldChange = useCallback((fieldName: Exclude<keyof DetailsFormState, 'derivedValues' | 'languageDetection'>) => (
    createTextFieldChangeHandler(fieldName)
  ), [createTextFieldChangeHandler]);

  const handleFieldSelectorChange = useCallback((
    fieldName: Exclude<keyof DetailsFormState, 'derivedValues' | 'languageDetection'>,
  ) => (
    nextValue: ScraperFieldSelector,
  ) => {
    setFormValues((previous) => ({
      ...previous,
      [fieldName]: nextValue,
    }));
    clearFieldFeedback(fieldName);
  }, [clearFieldFeedback, setFormValues]);

  const handleLanguageDetectFromTitleChange = useCallback((enabled: boolean) => {
    setFormValues((previous) => ({
      ...previous,
      languageDetection: {
        ...previous.languageDetection,
        detectFromTitle: enabled,
      },
    }));
    clearFieldFeedback('languageDetection.detectFromTitle');
  }, [clearFieldFeedback, setFormValues]);

  const handleLanguageFieldSelectorChange = useCallback((
    fieldName: 'languageSelector' | 'processedLanguageSelector',
  ) => (
    nextValue: ScraperFieldSelector,
  ) => {
    setFormValues((previous) => ({
      ...previous,
      languageDetection: {
        ...previous.languageDetection,
        [fieldName]: nextValue,
      },
    }));
    clearFieldFeedback(`languageDetection.${fieldName}`);
  }, [clearFieldFeedback, setFormValues]);

  const updateDerivedValue = useCallback((
    draftId: string,
    field: keyof Omit<DerivedValueFormItem, 'draftId'>,
    nextValue: string | ScraperFieldSelector,
  ) => {
    setFormValues((previous) => ({
      ...previous,
      derivedValues: previous.derivedValues.map((item) => {
        if (item.draftId !== draftId) {
          return item;
        }

        if (field === 'sourceType') {
          const normalizedSourceType = nextValue === 'selector'
            || nextValue === 'html'
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
            sourceField: typeof nextValue === 'string' && isFieldKey(nextValue) ? nextValue : undefined,
          };
        }

        return {
          ...item,
          [field]: nextValue,
        };
      }),
    }));

    clearFeedback();
    clearFieldError(`derivedValues.${draftId}.${field}`);

    if (field === 'sourceType') {
      clearFieldErrorsWhere((fieldName) => (
        fieldName === `derivedValues.${draftId}.sourceField`
        || fieldName === `derivedValues.${draftId}.selector`
      ));
    }
  }, [clearFeedback, clearFieldError, clearFieldErrorsWhere, setFormValues]);

  const handleAddDerivedValue = useCallback(() => {
    setFormValues((previous) => ({
      ...previous,
      derivedValues: [
        ...previous.derivedValues,
        createDerivedValueFormItem(),
      ],
    }));
    clearFeedback();
  }, [clearFeedback, setFormValues]);

  const handleRemoveDerivedValue = useCallback((draftId: string) => {
    setFormValues((previous) => ({
      ...previous,
      derivedValues: previous.derivedValues.filter((item) => item.draftId !== draftId),
    }));
    clearFeedback();
    clearFieldErrorsByPrefix(`derivedValues.${draftId}.`);
  }, [clearFeedback, clearFieldErrorsByPrefix, setFormValues]);

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
      const extractedValuesByKey = extractScraperDetailsFieldValues(doc, config, {
        requestedUrl: typedDocumentResult.requestedUrl,
        finalUrl: typedDocumentResult.finalUrl,
      });

      const testSelector = (
        key: ScraperFeatureValidationCheck['key'],
        selector: ScraperFieldSelector | undefined,
        required: boolean,
      ) => {
        if (!selector) {
          return;
        }

        try {
          const values = extractSelectorValues(doc, selector);
          if (values.length > 0) {
            if (isFieldKey(key)) {
              extractedValuesByKey[key] = values;
            }
            checks.push({
              key,
              selector: formatScraperFieldSelectorForDisplay(selector),
              required,
              matchedCount: values.length,
              sample: values[0],
            });
            return;
          }

          checks.push({
            key,
            selector: formatScraperFieldSelectorForDisplay(selector),
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
            selector: formatScraperFieldSelectorForDisplay(selector),
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
      if (config.authorUrlSelector) {
        try {
          const authorUrls = extractScraperAuthorUrlsFromDocument(doc, config.authorUrlSelector, {
            requestedUrl: typedDocumentResult.requestedUrl,
            finalUrl: typedDocumentResult.finalUrl,
          });
          if (authorUrls.length > 0) {
            checks.push({
              key: 'authorUrl',
              selector: formatScraperFieldSelectorForDisplay(config.authorUrlSelector),
              required: false,
              matchedCount: authorUrls.length,
              sample: authorUrls[0],
            });
          } else {
            checks.push({
              key: 'authorUrl',
              selector: formatScraperFieldSelectorForDisplay(config.authorUrlSelector),
              required: false,
              matchedCount: 0,
              issueCode: 'no_match',
            });
          }
        } catch {
          checks.push({
            key: 'authorUrl',
            selector: formatScraperFieldSelectorForDisplay(config.authorUrlSelector),
            required: false,
            matchedCount: 0,
            issueCode: 'invalid_selector',
          });
        }
      }
      testSelector('tags', config.tagsSelector, false);
      testSelector('status', config.statusSelector, false);
      testSelector('pageCount', config.pageCountSelector, false);
      if (
        config.languageDetection?.detectFromTitle
        || config.languageDetection?.languageSelector
        || config.languageDetection?.processedLanguageSelector
      ) {
        try {
          const languageCodes = extractScraperLanguageCodesFromRoot(
            doc,
            config.languageDetection,
            extractedValuesByKey.title?.[0],
          );

          checks.push({
            key: 'language',
            selector: 'Langue',
            required: false,
            matchedCount: languageCodes.length,
            sample: languageCodes[0],
            samples: languageCodes,
            issueCode: languageCodes.length > 0 ? undefined : 'no_match',
          });
        } catch {
          checks.push({
            key: 'language',
            selector: 'Langue',
            required: false,
            matchedCount: 0,
            issueCode: 'invalid_selector',
          });
        }
      }
      if (config.thumbnailsSelector) {
        const thumbnailsSelectorLabel = formatScraperFieldSelectorForDisplay(config.thumbnailsSelector);
        const selectorLabel = config.thumbnailsListSelector
          ? `${config.thumbnailsListSelector} -> ${thumbnailsSelectorLabel}`
          : thumbnailsSelectorLabel;

        try {
          const thumbnails = extractScraperDetailsThumbnailsFromDocument(doc, {
            thumbnailsListSelector: config.thumbnailsListSelector,
            thumbnailsSelector: config.thumbnailsSelector,
          }, {
            requestedUrl: typedDocumentResult.requestedUrl,
            finalUrl: typedDocumentResult.finalUrl,
          });

          checks.push({
            key: 'thumbnails',
            selector: selectorLabel,
            required: false,
            matchedCount: thumbnails.length,
            sample: thumbnails[0],
            samples: thumbnails.slice(0, 12),
            issueCode: thumbnails.length > 0 ? undefined : 'no_match',
          });
        } catch {
          checks.push({
            key: 'thumbnails',
            selector: selectorLabel,
            required: false,
            matchedCount: 0,
            issueCode: 'invalid_selector',
          });
        }
      }
      if (config.thumbnailsNextPageSelector) {
        try {
          const thumbnailsPage = extractScraperDetailsThumbnailsPageFromDocument(doc, {
            thumbnailsNextPageSelector: config.thumbnailsNextPageSelector,
          }, {
            requestedUrl: typedDocumentResult.requestedUrl,
            finalUrl: typedDocumentResult.finalUrl,
          });

          checks.push({
            key: 'thumbnailsNextPage',
            selector: formatScraperFieldSelectorForDisplay(config.thumbnailsNextPageSelector),
            required: false,
            matchedCount: thumbnailsPage.nextPageUrl ? 1 : 0,
            sample: thumbnailsPage.nextPageUrl,
            issueCode: thumbnailsPage.nextPageUrl ? undefined : 'no_match',
          });
        } catch {
          checks.push({
            key: 'thumbnailsNextPage',
            selector: formatScraperFieldSelectorForDisplay(config.thumbnailsNextPageSelector),
            required: false,
            matchedCount: 0,
            issueCode: 'invalid_selector',
          });
        }
      }

      const derivedValues: ScraperDetailsDerivedValueResult[] = extractScraperDetailsDerivedValueResults(
        doc,
        config,
        {
          requestedUrl: typedDocumentResult.requestedUrl,
          finalUrl: typedDocumentResult.finalUrl,
          status: typedDocumentResult.status,
          contentType: typedDocumentResult.contentType,
          html: typedDocumentResult.html,
        },
        extractedValuesByKey,
      );

      derivedValues.forEach((derivedValue) => {
        if (derivedValue.issueCode) {
          errorsForValidation.push(`derived:${derivedValue.key}`);
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

  const buildSaveConfig = useCallback(() => {
    const config = buildDetailsConfig(formValues);
    return {
      config,
      errors: getSaveFieldErrors(formValues, config),
      signature: getConfigSignature(config),
    };
  }, [formValues]);

  const handleSave = useSaveScraperFeatureConfig({
    featureKind: feature.kind,
    validationResult,
    lastValidatedSignature,
    buildSaveConfig,
    setFieldErrors,
    setSaving,
    setSaveError,
    setSaveMessage,
  });

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

          <ScraperUrlTemplateFields
            strategyField={URL_STRATEGY_FIELD}
            strategyValue={formValues.urlStrategy}
            strategyError={fieldErrors.urlStrategy}
            onStrategyChange={handleFieldChange('urlStrategy')}
            showTemplateFields={currentConfig.urlStrategy === 'template'}
            templateField={URL_TEMPLATE_FIELD}
            templateValue={formValues.urlTemplate}
            templateError={fieldErrors.urlTemplate}
            onTemplateChange={handleFieldChange('urlTemplate')}
          >
            <div className="scraper-config-hint">
              Placeholders supportes : <code>{'{{id}}'}</code>, <code>{'{{slug}}'}</code>,
              <code>{' {{value}}'}</code>, ainsi que leurs variantes brutes
              <code>{' {{rawId}}'}</code>, <code>{'{{rawSlug}}'}</code> et <code>{'{{rawValue}}'}</code>.
            </div>
          </ScraperUrlTemplateFields>
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Scraping</h4>
            <p>
              Indique les selecteurs qui permettent d&apos;extraire les donnees utiles de la fiche.
            </p>
          </div>

          <ScraperConfigFieldGrid
            fields={SELECTOR_FIELDS}
            fieldSelectorNames={FIELD_SELECTOR_FIELD_NAMES}
            getValue={(fieldName) => (
              formValues[fieldName as Exclude<keyof DetailsFormState, 'derivedValues' | 'languageDetection'>] ?? ''
            )}
            getError={(fieldName) => fieldErrors[fieldName]}
            onFieldChange={(fieldName) => (
              handleFieldChange(fieldName as Exclude<keyof DetailsFormState, 'derivedValues' | 'languageDetection'>)
            )}
            onFieldSelectorChange={(fieldName) => (
              handleFieldSelectorChange(fieldName as Exclude<keyof DetailsFormState, 'derivedValues' | 'languageDetection'>)
            )}
          />
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Langue</h4>
            <p>
              Configure comment detecter la langue de la fiche.
            </p>
          </div>

          <ScraperLanguageDetectionSection
            value={formValues.languageDetection}
            fieldErrors={fieldErrors}
            onDetectFromTitleChange={handleLanguageDetectFromTitleChange}
            onFieldSelectorChange={handleLanguageFieldSelectorChange}
          />
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
            <code>{' d_(\\d+)'}</code>. Pour des cas plus tordus, choisis aussi
            <code>{' Regex sur le HTML brut'}</code>.
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

          <ScraperResolvedUrlPreview
            url={resolvedTestUrl}
            emptyMessage="Complete d'abord la section URL pour voir l'aperçu."
          />

          <ScraperFeatureActions
            validating={validating}
            saving={saving}
            validateLabel="Valider la fiche"
            onBack={onBack}
            onValidate={() => void handleValidate()}
            onSave={() => void handleSave()}
          />

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
