import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FetchScraperDocumentResult,
  formatScraperFieldSelectorForDisplay,
  ScraperCardListConfig,
  ScraperDetailsUrlStrategy,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationCheckKey,
  ScraperFeatureValidationResult,
  ScraperFieldSelector,
  ScraperLanguageDetectionConfig,
  ScraperLanguageValueMapping,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import ScraperConfigField from '@/renderer/components/ScraperConfig/shared/ScraperConfigField';
import ScraperFeatureEditorHeader from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorHeader';
import ScraperFeatureMessages from '@/renderer/components/ScraperConfig/shared/ScraperFeatureMessages';
import ScraperFieldSelectorField from '@/renderer/components/ScraperConfig/shared/ScraperFieldSelectorField';
import ScraperLanguageDetectionSection from '@/renderer/components/ScraperConfig/shared/ScraperLanguageDetectionSection';
import ScraperTemplateContext from '@/renderer/components/ScraperConfig/shared/ScraperTemplateContext';
import ScraperValidationSummary, {
  ScraperValidationPresentation,
} from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import {
  ScraperConfigFieldGrid,
  ScraperFeatureActions,
  ScraperResolvedUrlPreview,
  ScraperUrlTemplateFields,
} from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorSections';
import { useScraperConfig } from '@/renderer/components/ScraperConfig/shared/ScraperConfigContext';
import {
  buildLanguageDetectionConfig,
  FEATURE_STATUS_META,
} from '@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils';
import useSaveScraperFeatureConfig from '@/renderer/components/ScraperConfig/shared/useSaveScraperFeatureConfig';
import useScraperFeatureEditorState from '@/renderer/components/ScraperConfig/shared/useScraperFeatureEditorState';
import SearchFeaturePreview from '@/renderer/components/ScraperConfig/search/SearchFeaturePreview';
import {
  extractScraperSearchPageFromDocument,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import { buildScraperTemplateContextFromValidation } from '@/renderer/utils/scraperTemplateContext';
import { Field } from '@/renderer/components/utils/Form/types';

type ListingFeatureConfig = ScraperCardListConfig & {
  urlStrategy: ScraperDetailsUrlStrategy;
  urlTemplate?: string;
  testUrl?: string;
  testValue?: string;
};

type ListingFeatureTexts = {
  listingLabel: string;
  headerTitle: string;
  headerDescription: React.ReactNode;
  noteTitle: string;
  noteText: React.ReactNode;
  urlDescription: React.ReactNode;
  scrapingDescription: React.ReactNode;
  templateHint: React.ReactNode;
  templateContextEmptyMessage?: React.ReactNode;
  testDescription: React.ReactNode;
  validateLabel: string;
};

type ResolveListingTargetUrl<TConfig extends ListingFeatureConfig> = (
  baseUrl: string,
  config: TConfig,
  valueOrUrl: string,
  options: {
    pageIndex: number;
    templateContext: Record<string, string | undefined>;
  },
) => string;

type Props<TConfig extends ListingFeatureConfig> = {
  feature: ScraperFeatureDefinition;
  onBack: () => void;
  getInitialConfig: (feature: ScraperFeatureDefinition) => TConfig;
  buildConfig: (values: Partial<TConfig>) => TConfig;
  buildScrapingFields: (values: Partial<ScraperCardListConfig>) => Partial<TConfig>;
  getConfigSignature: (config: TConfig) => string;
  getSaveFieldErrors: (config: TConfig) => Record<string, string>;
  getValidationFieldErrors: (config: TConfig) => Record<string, string>;
  buildDocumentFailure: (result: FetchScraperDocumentResult) => ScraperFeatureValidationResult;
  buildValidationPresentation: (
    validationResult: ScraperFeatureValidationResult,
    previewResults: ScraperSearchResultItem[],
    previewPage: ScraperRuntimeSearchPageResult | null,
  ) => ScraperValidationPresentation;
  hasPagePlaceholder: (config: TConfig) => boolean;
  resolveTargetUrl: ResolveListingTargetUrl<TConfig>;
  getListingNames: (previewPage: ScraperRuntimeSearchPageResult) => string[];
  listingNameSelectorFieldName: keyof TConfig & string;
  listingNameSelectorField: Field;
  listingNameCheckKey: ScraperFeatureValidationCheckKey;
  scrapingFieldNames: readonly (keyof TConfig & string)[];
  scrapingFields: Field[];
  scrapingFieldSelectorNames: readonly string[];
  urlStrategyField: Field;
  urlTemplateField: Field;
  testUrlField: Field;
  testValueField: Field;
  texts: ListingFeatureTexts;
};

type FormValueRecord = Record<string, string | boolean | ScraperFieldSelector | undefined>;

const getFormValueRecord = <TConfig extends ListingFeatureConfig>(
  values: TConfig,
): FormValueRecord => values as unknown as FormValueRecord;

const getTestInput = <TConfig extends ListingFeatureConfig>(config: TConfig): string => (
  config.urlStrategy === 'template' ? config.testValue || '' : config.testUrl || ''
);

const buildSelectorCheck = (
  key: ScraperFeatureValidationCheckKey,
  selector: ScraperFieldSelector | string,
  required: boolean,
  samples: string[],
): ScraperFeatureValidationCheck => (
  samples.length > 0
    ? {
      key,
      selector: typeof selector === 'string' ? selector : formatScraperFieldSelectorForDisplay(selector),
      required,
      matchedCount: samples.length,
      sample: samples[0],
      samples: samples.slice(0, 12),
    }
    : {
      key,
      selector: typeof selector === 'string' ? selector : formatScraperFieldSelectorForDisplay(selector),
      required,
      matchedCount: 0,
      issueCode: 'no_match',
    }
);

export default function ScraperListingFeatureEditor<TConfig extends ListingFeatureConfig>({
  feature,
  onBack,
  getInitialConfig,
  buildConfig,
  buildScrapingFields,
  getConfigSignature,
  getSaveFieldErrors,
  getValidationFieldErrors,
  buildDocumentFailure,
  buildValidationPresentation,
  hasPagePlaceholder,
  resolveTargetUrl,
  getListingNames,
  listingNameSelectorFieldName,
  listingNameSelectorField,
  listingNameCheckKey,
  scrapingFieldNames,
  scrapingFields,
  scrapingFieldSelectorNames,
  urlStrategyField,
  urlTemplateField,
  testUrlField,
  testValueField,
  texts,
}: Props<TConfig>) {
  const { scraper } = useScraperConfig();
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature, getInitialConfig]);
  const detailsFeature = useMemo(
    () => scraper.features.find((candidate) => candidate.kind === 'details') || null,
    [scraper.features],
  );
  const searchFeature = useMemo(
    () => scraper.features.find((candidate) => candidate.kind === 'search') || null,
    [scraper.features],
  );
  const [previewPage, setPreviewPage] = useState<ScraperRuntimeSearchPageResult | null>(null);
  const [previewVisitedPageUrls, setPreviewVisitedPageUrls] = useState<string[]>([]);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewResults, setPreviewResults] = useState<ScraperSearchResultItem[]>([]);
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
    clearFieldErrorsByPrefix,
    clearFieldFeedback,
    createTextFieldChangeHandler,
    resetEditorState,
  } = useScraperFeatureEditorState<TConfig>({
    initialFormValues: initialConfig,
    initialValidationResult: feature.validation,
    initialValidatedSignature: feature.validation?.ok ? getConfigSignature(buildConfig(initialConfig)) : null,
  });

  useEffect(() => {
    resetEditorState();
    setPreviewPage(null);
    setPreviewVisitedPageUrls([]);
    setPreviewPageIndex(0);
    setPreviewResults([]);
  }, [feature, resetEditorState]);

  const currentStatusMeta = FEATURE_STATUS_META[feature.status];
  const currentConfig = useMemo(() => buildConfig(formValues), [buildConfig, formValues]);
  const usesTemplatePaging = hasPagePlaceholder(currentConfig);
  const templateContext = useMemo<Record<string, string | undefined>>(() => (
    texts.templateContextEmptyMessage
      ? buildScraperTemplateContextFromValidation(detailsFeature?.validation)
      : {}
  ), [detailsFeature?.validation, texts.templateContextEmptyMessage]);
  const copiedSearchScrapingFields = useMemo(() => {
    if (!searchFeature?.config || searchFeature.status === 'not_configured') {
      return null;
    }

    return buildScrapingFields(searchFeature.config as Partial<ScraperCardListConfig>);
  }, [buildScrapingFields, searchFeature]);
  const canCopySearchSelectors = useMemo(
    () => copiedSearchScrapingFields
      ? scrapingFieldNames.some((fieldName) => Boolean(getFormValueRecord(copiedSearchScrapingFields as TConfig)[fieldName]))
      : false,
    [copiedSearchScrapingFields, scrapingFieldNames],
  );
  const copiedSearchLanguageDetection = useMemo(() => {
    if (!searchFeature?.config || searchFeature.status === 'not_configured') {
      return null;
    }

    const searchConfig = searchFeature.config as Partial<ScraperCardListConfig>;
    const languageDetection = buildLanguageDetectionConfig(
      searchConfig.languageDetection as Partial<ScraperLanguageDetectionConfig> | null | undefined,
    );
    const hasLanguageDetection = Boolean(
      languageDetection.detectFromTitle
      || languageDetection.languageSelector
      || languageDetection.processedLanguageSelector
      || languageDetection.valueMappings?.length,
    );

    return hasLanguageDetection ? languageDetection : null;
  }, [searchFeature]);
  const canCopySearchLanguageDetection = Boolean(copiedSearchLanguageDetection);

  const resolvedTestUrl = useMemo(() => {
    try {
      return resolveTargetUrl(
        scraper.baseUrl,
        currentConfig,
        getTestInput(currentConfig),
        {
          pageIndex: 0,
          templateContext,
        },
      );
    } catch {
      return null;
    }
  }, [currentConfig, resolveTargetUrl, scraper.baseUrl, templateContext]);

  const validationPresentation = useMemo(
    () => (validationResult ? buildValidationPresentation(validationResult, previewResults, previewPage) : null),
    [buildValidationPresentation, previewPage, previewResults, validationResult],
  );

  const previewCards = useMemo(
    () => previewResults.slice(0, 8),
    [previewResults],
  );

  const fetchPreviewPage = useCallback(async (
    targetUrl: string,
    config: TConfig = currentConfig,
  ): Promise<ScraperRuntimeSearchPageResult> => {
    const documentResult = await (window as any).api.fetchScraperDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    const typedDocumentResult = documentResult as FetchScraperDocumentResult;
    if (!typedDocumentResult.ok || !typedDocumentResult.html) {
      throw new Error(
        typedDocumentResult.error
          || (typeof typedDocumentResult.status === 'number'
            ? `La page ${texts.listingLabel} a repondu avec le code HTTP ${typedDocumentResult.status}.`
            : `Impossible de charger la page ${texts.listingLabel}.`),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(typedDocumentResult.html, 'text/html');
    return extractScraperSearchPageFromDocument(documentNode, config, {
      requestedUrl: typedDocumentResult.requestedUrl,
      finalUrl: typedDocumentResult.finalUrl,
    });
  }, [currentConfig, scraper.baseUrl, texts.listingLabel]);

  const handleFieldChange = useCallback((fieldName: keyof TConfig & string) => (
    createTextFieldChangeHandler(fieldName)
  ), [createTextFieldChangeHandler]);

  const handleFieldSelectorChange = useCallback((fieldName: keyof TConfig & string) => (
    nextValue: ScraperFieldSelector,
  ) => {
    setFormValues((previous) => ({
      ...previous,
      [fieldName]: nextValue,
    }) as TConfig);
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

  const handleLanguageValueMappingsChange = useCallback((valueMappings: ScraperLanguageValueMapping[]) => {
    setFormValues((previous) => ({
      ...previous,
      languageDetection: {
        ...previous.languageDetection,
        valueMappings,
      },
    }));
    clearFeedback();
    clearFieldErrorsByPrefix('languageDetection.valueMappings.');
  }, [clearFeedback, clearFieldErrorsByPrefix, setFormValues]);

  const handleCopySearchSelectors = useCallback(() => {
    if (!copiedSearchScrapingFields) {
      return;
    }

    setFormValues((previous) => ({
      ...previous,
      ...copiedSearchScrapingFields,
    }) as TConfig);
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage('Selecteurs copies depuis Recherche. Pense a valider puis enregistrer.');

    setFieldErrors((previous) => {
      const next = { ...previous };
      scrapingFieldNames.forEach((fieldName) => {
        delete next[fieldName];
      });
      return next;
    });
  }, [
    copiedSearchScrapingFields,
    scrapingFieldNames,
    setFieldErrors,
    setFormValues,
    setSaveError,
    setSaveMessage,
    setValidationUiError,
  ]);

  const handleCopySearchLanguageDetection = useCallback(() => {
    if (!copiedSearchLanguageDetection) {
      return;
    }

    setFormValues((previous) => ({
      ...previous,
      languageDetection: {
        ...copiedSearchLanguageDetection,
        valueMappings: copiedSearchLanguageDetection.valueMappings?.map((mapping) => ({ ...mapping })) ?? [],
      },
    }));
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage('Configuration langue copiee depuis Recherche. Pense a valider puis enregistrer.');
    clearFieldErrorsByPrefix('languageDetection.');
  }, [
    clearFieldErrorsByPrefix,
    copiedSearchLanguageDetection,
    setFormValues,
    setSaveError,
    setSaveMessage,
    setValidationUiError,
  ]);

  const handleValidate = useCallback(async () => {
    const config = buildConfig(formValues);
    const errors = getValidationFieldErrors(config);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setValidationUiError('Complete d\'abord les champs requis pour lancer le test.');
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      setValidationUiError(`La validation de la page ${texts.listingLabel} n'est pas disponible dans cette version.`);
      return;
    }

    let targetUrl = '';
    try {
      targetUrl = resolveTargetUrl(
        scraper.baseUrl,
        config,
        getTestInput(config),
        {
          pageIndex: 0,
          templateContext,
        },
      );
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : `Impossible de construire l'URL ${texts.listingLabel}.`);
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
        setPreviewPage(null);
        setPreviewVisitedPageUrls([]);
        setPreviewPageIndex(0);
        setPreviewResults([]);
        setValidationResult(buildDocumentFailure(typedDocumentResult));
        return;
      }

      const parser = new DOMParser();
      const documentNode = parser.parseFromString(typedDocumentResult.html, 'text/html');
      const extractedPage = extractScraperSearchPageFromDocument(documentNode, config, {
        requestedUrl: typedDocumentResult.requestedUrl,
        finalUrl: typedDocumentResult.finalUrl,
      });
      const extractedResults = extractedPage.items;
      const formValueRecord = getFormValueRecord(config);

      const titles = extractedResults.map((result) => result.title).filter(Boolean);
      const listingNames = getListingNames(extractedPage);
      const authorUrls = extractedResults.map((result) => result.authorUrl).filter(Boolean) as string[];
      const thumbnails = extractedResults.map((result) => result.thumbnailUrl).filter(Boolean) as string[];
      const summaries = extractedResults.map((result) => result.summary).filter(Boolean) as string[];
      const pageCounts = extractedResults.map((result) => result.pageCount).filter(Boolean) as string[];
      const languageCodes = Array.from(new Set(
        extractedResults.flatMap((result) => result.languageCodes ?? []),
      ));
      const listingNameSelector = formValueRecord[listingNameSelectorFieldName] as ScraperFieldSelector | undefined;

      const checks = [
        buildSelectorCheck('title', config.titleSelector, true, titles),
        ...(listingNameSelector
          ? [buildSelectorCheck(listingNameCheckKey, listingNameSelector, false, listingNames)]
          : []),
        ...(config.thumbnailSelector
          ? [buildSelectorCheck('cover', config.thumbnailSelector, false, thumbnails)]
          : []),
        ...(config.authorUrlSelector
          ? [buildSelectorCheck('authorUrl', config.authorUrlSelector, false, authorUrls)]
          : []),
        ...(config.summarySelector
          ? [buildSelectorCheck('description', config.summarySelector, false, summaries)]
          : []),
        ...(config.pageCountSelector
          ? [buildSelectorCheck('pageCount', config.pageCountSelector, false, pageCounts)]
          : []),
        ...(config.languageDetection?.detectFromTitle
          || config.languageDetection?.languageSelector
          || config.languageDetection?.processedLanguageSelector
          ? [buildSelectorCheck('language', 'Langue', false, languageCodes)]
          : []),
      ];

      const nextResult: ScraperFeatureValidationResult = {
        ok: titles.length > 0,
        checkedAt: new Date().toISOString(),
        requestedUrl: typedDocumentResult.requestedUrl,
        finalUrl: typedDocumentResult.finalUrl,
        status: typedDocumentResult.status,
        contentType: typedDocumentResult.contentType,
        checks,
        derivedValues: [],
      };

      setPreviewPage(extractedPage);
      setPreviewVisitedPageUrls([extractedPage.currentPageUrl]);
      setPreviewPageIndex(0);
      setPreviewResults(extractedResults);
      setValidationResult(nextResult);
      if (nextResult.ok) {
        setLastValidatedSignature(getConfigSignature(config));
      }
    } catch (error) {
      setPreviewPage(null);
      setPreviewVisitedPageUrls([]);
      setPreviewPageIndex(0);
      setPreviewResults([]);
      setValidationUiError(error instanceof Error ? error.message : `Echec de la validation de la page ${texts.listingLabel}.`);
    } finally {
      setValidating(false);
    }
  }, [
    buildConfig,
    buildDocumentFailure,
    formValues,
    getConfigSignature,
    getListingNames,
    getValidationFieldErrors,
    listingNameCheckKey,
    listingNameSelectorFieldName,
    resolveTargetUrl,
    scraper.baseUrl,
    setFieldErrors,
    setLastValidatedSignature,
    setPreviewPage,
    setPreviewResults,
    setPreviewVisitedPageUrls,
    setValidationResult,
    setValidationUiError,
    setValidating,
    setSaveError,
    setSaveMessage,
    templateContext,
    texts.listingLabel,
  ]);

  const handlePreviewNextPage = useCallback(async () => {
    if (!previewPage) {
      return;
    }

    const nextPageIndex = previewPageIndex + 1;
    const nextTargetUrl = usesTemplatePaging
      ? resolveTargetUrl(
        scraper.baseUrl,
        currentConfig,
        getTestInput(currentConfig),
        {
          pageIndex: nextPageIndex,
          templateContext,
        },
      )
      : previewPage.nextPageUrl;

    if (!nextTargetUrl) {
      return;
    }

    setValidating(true);
    setValidationUiError(null);

    try {
      const nextPage = await fetchPreviewPage(nextTargetUrl);
      if (!nextPage.items.length) {
        setValidationUiError('Aucune card exploitable n\'a ete trouvee sur la page suivante.');
        return;
      }

      setPreviewPage(nextPage);
      setPreviewResults(nextPage.items);
      setPreviewVisitedPageUrls((previous) => {
        const trimmedHistory = previous.slice(0, previewPageIndex + 1);
        return [...trimmedHistory, nextPage.currentPageUrl];
      });
      setPreviewPageIndex(nextPageIndex);
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : 'Impossible de charger la page suivante.');
    } finally {
      setValidating(false);
    }
  }, [
    currentConfig,
    fetchPreviewPage,
    previewPage,
    previewPageIndex,
    resolveTargetUrl,
    scraper.baseUrl,
    setValidating,
    setValidationUiError,
    templateContext,
    usesTemplatePaging,
  ]);

  const handlePreviewPreviousPage = useCallback(async () => {
    if (previewPageIndex <= 0) {
      return;
    }

    const previousTargetUrl = previewVisitedPageUrls[previewPageIndex - 1];
    if (!previousTargetUrl) {
      return;
    }

    setValidating(true);
    setValidationUiError(null);

    try {
      const previousPage = await fetchPreviewPage(previousTargetUrl);
      setPreviewPage(previousPage);
      setPreviewResults(previousPage.items);
      setPreviewPageIndex((previous) => Math.max(0, previous - 1));
      setPreviewVisitedPageUrls((currentHistory) => {
        const nextHistory = [...currentHistory];
        nextHistory[previewPageIndex - 1] = previousPage.currentPageUrl;
        return nextHistory;
      });
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : 'Impossible de charger la page precedente.');
    } finally {
      setValidating(false);
    }
  }, [
    fetchPreviewPage,
    previewPageIndex,
    previewVisitedPageUrls,
    setValidating,
    setValidationUiError,
  ]);

  const buildSaveConfig = useCallback(() => {
    const config = buildConfig(formValues);
    return {
      config,
      errors: getSaveFieldErrors(config),
      signature: getConfigSignature(config),
    };
  }, [buildConfig, formValues, getConfigSignature, getSaveFieldErrors]);

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
        title={texts.headerTitle}
        description={texts.headerDescription}
        noteTitle={texts.noteTitle}
        noteText={texts.noteText}
        statusClassName={currentStatusMeta.className}
        statusLabel={currentStatusMeta.label}
        onBack={onBack}
      />

      <div className="mh-form">
        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Construction de l&apos;URL</h4>
            <p>{texts.urlDescription}</p>
          </div>

          <ScraperUrlTemplateFields
            strategyField={urlStrategyField}
            strategyValue={formValues.urlStrategy}
            strategyError={fieldErrors.urlStrategy}
            onStrategyChange={handleFieldChange('urlStrategy')}
            showTemplateFields={currentConfig.urlStrategy === 'template'}
            templateField={urlTemplateField}
            templateValue={formValues.urlTemplate}
            templateError={fieldErrors.urlTemplate}
            onTemplateChange={handleFieldChange('urlTemplate')}
          >
            <div className="scraper-config-hint">
              {texts.templateHint}
            </div>
          </ScraperUrlTemplateFields>

          {currentConfig.urlStrategy === 'template' && texts.templateContextEmptyMessage ? (
            <ScraperTemplateContext
              templateContext={templateContext}
              emptyMessage={texts.templateContextEmptyMessage}
            />
          ) : null}
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Scraping</h4>
            <p>{texts.scrapingDescription}</p>
          </div>

          <ScraperFieldSelectorField
            field={listingNameSelectorField}
            value={getFormValueRecord(formValues)[listingNameSelectorFieldName] as ScraperFieldSelector | string | undefined}
            error={fieldErrors[listingNameSelectorFieldName]}
            onChange={handleFieldSelectorChange(listingNameSelectorFieldName)}
          />

          {canCopySearchSelectors ? (
            <div className="scraper-config-section__actions">
              <button
                type="button"
                className="secondary"
                onClick={handleCopySearchSelectors}
                disabled={validating || saving}
              >
                Copier les selecteurs de Recherche
              </button>
            </div>
          ) : null}

          <ScraperConfigFieldGrid
            fields={scrapingFields}
            fieldSelectorNames={scrapingFieldSelectorNames}
            getValue={(fieldName) => getFormValueRecord(formValues)[fieldName]}
            getError={(fieldName) => fieldErrors[fieldName]}
            onFieldChange={(fieldName) => handleFieldChange(fieldName as keyof TConfig & string)}
            onFieldSelectorChange={(fieldName) => (
              handleFieldSelectorChange(fieldName as keyof TConfig & string)
            )}
          />
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Langue</h4>
            <p>
              Configure comment detecter la langue de chaque card extraite.
            </p>
          </div>

          {canCopySearchLanguageDetection ? (
            <div className="scraper-config-section__actions">
              <button
                type="button"
                className="secondary"
                onClick={handleCopySearchLanguageDetection}
                disabled={validating || saving}
              >
                Copier la langue de Recherche
              </button>
            </div>
          ) : null}

          <ScraperLanguageDetectionSection
            value={formValues.languageDetection}
            fieldErrors={fieldErrors}
            onDetectFromTitleChange={handleLanguageDetectFromTitleChange}
            onFieldSelectorChange={handleLanguageFieldSelectorChange}
            onValueMappingsChange={handleLanguageValueMappingsChange}
            disabled={validating || saving}
          />
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Test</h4>
            <p>{texts.testDescription}</p>
          </div>

          {currentConfig.urlStrategy === 'template' ? (
            <ScraperConfigField
              field={testValueField}
              value={formValues.testValue}
              error={fieldErrors.testValue}
              onChange={handleFieldChange('testValue')}
            />
          ) : (
            <ScraperConfigField
              field={testUrlField}
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
            validateLabel={texts.validateLabel}
            onBack={onBack}
            onValidate={() => void handleValidate()}
            onSave={() => void handleSave()}
          />

          <ScraperValidationSummary
            validationResult={validationResult}
            presentation={validationPresentation}
          />

          <SearchFeaturePreview
            previewCards={previewCards}
            previewPage={previewPage}
            previewPageIndex={previewPageIndex}
            usesTemplatePaging={usesTemplatePaging}
            validating={validating}
            onPreviousPage={() => void handlePreviewPreviousPage()}
            onNextPage={() => void handlePreviewNextPage()}
          />
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
