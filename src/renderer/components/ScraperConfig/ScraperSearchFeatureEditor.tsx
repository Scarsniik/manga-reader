import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FetchScraperDocumentResult,
  formatScraperFieldSelectorForDisplay,
  ScraperFieldSelector,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperLanguageValueMapping,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import {
  extractScraperSearchPageFromDocument,
  hasSearchPagePlaceholder,
  resolveScraperSearchRequestConfig,
  resolveScraperSearchTargetUrl,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import ScraperConfigField from '@/renderer/components/ScraperConfig/shared/ScraperConfigField';
import ScraperFeatureEditorHeader from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorHeader';
import ScraperFeatureMessages from '@/renderer/components/ScraperConfig/shared/ScraperFeatureMessages';
import ScraperLanguageDetectionSection from '@/renderer/components/ScraperConfig/shared/ScraperLanguageDetectionSection';
import ScraperValidationSummary from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import {
  ScraperConfigFieldGrid,
  ScraperFeatureActions,
  ScraperResolvedUrlPreview,
} from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorSections';
import { useScraperConfig } from '@/renderer/components/ScraperConfig/shared/ScraperConfigContext';
import useSaveScraperFeatureConfig from '@/renderer/components/ScraperConfig/shared/useSaveScraperFeatureConfig';
import useScraperFeatureEditorState from '@/renderer/components/ScraperConfig/shared/useScraperFeatureEditorState';
import SearchFeaturePreview from '@/renderer/components/ScraperConfig/search/SearchFeaturePreview';
import SearchRequestSection from '@/renderer/components/ScraperConfig/search/SearchRequestSection';
import {
  buildDocumentFailure,
  buildSearchConfig,
  buildValidationPresentation,
  createSearchRequestFieldFormItem,
  FEATURE_STATUS_META,
  getConfigSignature,
  getInitialConfig,
  getSaveFieldErrors,
  getValidationFieldErrors,
  SCRAPING_FIELD_SELECTOR_NAMES,
  SCRAPING_FIELDS,
  SearchFeatureFormState,
  TEST_QUERY_FIELD,
  URL_TEMPLATE_FIELD,
} from '@/renderer/components/ScraperConfig/search/searchFeatureEditor.utils';

type Props = {
  feature: ScraperFeatureDefinition;
  onBack: () => void;
};

export default function ScraperSearchFeatureEditor({
  feature,
  onBack,
}: Props) {
  const { scraper } = useScraperConfig();
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature]);
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
    clearFieldError,
    clearFieldErrorsByPrefix,
    clearFieldFeedback,
    createTextFieldChangeHandler,
    resetEditorState,
  } = useScraperFeatureEditorState<SearchFeatureFormState>({
    initialFormValues: initialConfig,
    initialValidationResult: feature.validation,
    initialValidatedSignature: feature.validation?.ok ? getConfigSignature(buildSearchConfig(initialConfig)) : null,
  });

  useEffect(() => {
    resetEditorState();
    setPreviewPage(null);
    setPreviewVisitedPageUrls([]);
    setPreviewPageIndex(0);
    setPreviewResults([]);
  }, [feature, resetEditorState]);

  const currentStatusMeta = FEATURE_STATUS_META[feature.status];
  const currentConfig = useMemo(() => buildSearchConfig(formValues), [formValues]);
  const usesTemplatePaging = hasSearchPagePlaceholder(currentConfig);

  const resolvedTestUrl = useMemo(() => {
    try {
      return resolveScraperSearchTargetUrl(scraper.baseUrl, currentConfig, currentConfig.testQuery || '', {
        pageIndex: 0,
      });
    } catch {
      return null;
    }
  }, [currentConfig, scraper.baseUrl]);

  const resolvedTestRequestConfig = useMemo(() => {
    try {
      return resolveScraperSearchRequestConfig(currentConfig, currentConfig.testQuery || '', {
        pageIndex: 0,
      });
    } catch {
      return null;
    }
  }, [currentConfig]);

  const validationPresentation = useMemo(
    () => (validationResult ? buildValidationPresentation(validationResult, previewResults, previewPage) : null),
    [previewPage, previewResults, validationResult],
  );

  const previewCards = useMemo(
    () => previewResults.slice(0, 8),
    [previewResults],
  );

  const fetchPreviewPage = useCallback(async (
    query: string,
    targetUrl: string,
    config: ReturnType<typeof buildSearchConfig>,
    pageIndex: number,
  ): Promise<ScraperRuntimeSearchPageResult> => {
    const documentResult = await (window as any).api.fetchScraperDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
      requestConfig: resolveScraperSearchRequestConfig(config, query, { pageIndex }),
    });

    const typedDocumentResult = documentResult as FetchScraperDocumentResult;
    if (!typedDocumentResult.ok || !typedDocumentResult.html) {
      throw new Error(
        typedDocumentResult.error
          || (typeof typedDocumentResult.status === 'number'
            ? `La recherche a repondu avec le code HTTP ${typedDocumentResult.status}.`
            : 'Impossible de charger la page de recherche.'),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(typedDocumentResult.html, 'text/html');
    return extractScraperSearchPageFromDocument(documentNode, config, {
      requestedUrl: typedDocumentResult.requestedUrl,
      finalUrl: typedDocumentResult.finalUrl,
    });
  }, [scraper.baseUrl]);

  const handleFieldChange = useCallback((fieldName: Exclude<keyof SearchFeatureFormState, 'request' | 'languageDetection'>) => (
    createTextFieldChangeHandler(fieldName)
  ), [createTextFieldChangeHandler]);

  const handleFieldSelectorChange = useCallback((
    fieldName: Exclude<keyof SearchFeatureFormState, 'request' | 'languageDetection'>,
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

  const handleRequestMethodChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextMethod = event.target.value === 'POST' ? 'POST' : 'GET';
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        method: nextMethod,
      },
    }));
    clearFeedback();
    clearFieldErrorsByPrefix('request.');
  }, [clearFeedback, clearFieldErrorsByPrefix, setFormValues]);

  const handleRequestBodyModeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextBodyMode = event.target.value === 'raw' ? 'raw' : 'form';
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        bodyMode: nextBodyMode,
      },
    }));
    clearFeedback();
    clearFieldErrorsByPrefix('request.');
  }, [clearFeedback, clearFieldErrorsByPrefix, setFormValues]);

  const handleAddRequestField = useCallback(() => {
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        bodyFields: [
          ...previous.request.bodyFields,
          createSearchRequestFieldFormItem(),
        ],
      },
    }));
    clearFeedback();
  }, [clearFeedback, setFormValues]);

  const handleRemoveRequestField = useCallback((draftId: string) => {
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        bodyFields: previous.request.bodyFields.filter((field) => field.draftId !== draftId),
      },
    }));
    clearFeedback();
    clearFieldErrorsByPrefix(`request.bodyFields.${draftId}.`);
  }, [clearFeedback, clearFieldErrorsByPrefix, setFormValues]);

  const handleUpdateRequestField = useCallback((
    draftId: string,
    fieldName: 'key' | 'value',
    nextValue: string,
  ) => {
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        bodyFields: previous.request.bodyFields.map((field) => (
          field.draftId === draftId
            ? {
              ...field,
              [fieldName]: nextValue,
            }
            : field
        )),
      },
    }));
    clearFeedback();
    clearFieldError(`request.bodyFields.${draftId}.${fieldName}`);
  }, [clearFeedback, clearFieldError, setFormValues]);

  const handleRequestBodyChange = useCallback((nextValue: string) => {
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        body: nextValue,
      },
    }));
    clearFeedback();
  }, [clearFeedback, setFormValues]);

  const handleRequestContentTypeChange = useCallback((nextValue: string) => {
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        contentType: nextValue,
      },
    }));
    clearFeedback();
  }, [clearFeedback, setFormValues]);

  const handleValidate = useCallback(async () => {
    const config = buildSearchConfig(formValues);
    const errors = getValidationFieldErrors(formValues, config);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setValidationUiError('Complete d\'abord les champs requis pour lancer le test.');
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      setValidationUiError('La validation de la recherche n\'est pas disponible dans cette version.');
      return;
    }

    let targetUrl = '';
    try {
      targetUrl = resolveScraperSearchTargetUrl(scraper.baseUrl, config, config.testQuery || '', {
        pageIndex: 0,
      });
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : 'Impossible de construire l\'URL de recherche.');
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
        requestConfig: resolveScraperSearchRequestConfig(config, config.testQuery || '', {
          pageIndex: 0,
        }),
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

      const titles = extractedResults.map((result) => result.title).filter(Boolean);
      const authorUrls = extractedResults.map((result) => result.authorUrl).filter(Boolean) as string[];
      const thumbnails = extractedResults.map((result) => result.thumbnailUrl).filter(Boolean) as string[];
      const summaries = extractedResults.map((result) => result.summary).filter(Boolean) as string[];
      const pageCounts = extractedResults.map((result) => result.pageCount).filter(Boolean) as string[];
      const languageCodes = Array.from(new Set(
        extractedResults.flatMap((result) => result.languageCodes ?? []),
      ));

      const checks = [
        titles.length > 0
          ? {
            key: 'title' as const,
            selector: formatScraperFieldSelectorForDisplay(config.titleSelector),
            required: true,
            matchedCount: titles.length,
            sample: titles[0],
            samples: titles.slice(0, 12),
          }
          : {
            key: 'title' as const,
            selector: formatScraperFieldSelectorForDisplay(config.titleSelector),
            required: true,
            matchedCount: 0,
            issueCode: 'no_match' as const,
          },
        ...(config.thumbnailSelector
          ? [thumbnails.length > 0
            ? {
              key: 'cover' as const,
              selector: formatScraperFieldSelectorForDisplay(config.thumbnailSelector),
              required: false,
              matchedCount: thumbnails.length,
              sample: thumbnails[0],
              samples: thumbnails.slice(0, 12),
            }
            : {
              key: 'cover' as const,
              selector: formatScraperFieldSelectorForDisplay(config.thumbnailSelector),
              required: false,
              matchedCount: 0,
              issueCode: 'no_match' as const,
            }]
          : []),
        ...(config.authorUrlSelector
          ? [authorUrls.length > 0
            ? {
              key: 'authorUrl' as const,
              selector: formatScraperFieldSelectorForDisplay(config.authorUrlSelector),
              required: false,
              matchedCount: authorUrls.length,
              sample: authorUrls[0],
              samples: authorUrls.slice(0, 12),
            }
            : {
              key: 'authorUrl' as const,
              selector: formatScraperFieldSelectorForDisplay(config.authorUrlSelector),
              required: false,
              matchedCount: 0,
              issueCode: 'no_match' as const,
            }]
          : []),
        ...(config.summarySelector
          ? [summaries.length > 0
            ? {
              key: 'description' as const,
              selector: formatScraperFieldSelectorForDisplay(config.summarySelector),
              required: false,
              matchedCount: summaries.length,
              sample: summaries[0],
              samples: summaries.slice(0, 12),
            }
            : {
              key: 'description' as const,
              selector: formatScraperFieldSelectorForDisplay(config.summarySelector),
              required: false,
              matchedCount: 0,
              issueCode: 'no_match' as const,
            }]
          : []),
        ...(config.pageCountSelector
          ? [pageCounts.length > 0
            ? {
              key: 'pageCount' as const,
              selector: formatScraperFieldSelectorForDisplay(config.pageCountSelector),
              required: false,
              matchedCount: pageCounts.length,
              sample: pageCounts[0],
              samples: pageCounts.slice(0, 12),
            }
            : {
              key: 'pageCount' as const,
              selector: formatScraperFieldSelectorForDisplay(config.pageCountSelector),
              required: false,
              matchedCount: 0,
              issueCode: 'no_match' as const,
            }]
          : []),
        ...(config.languageDetection?.detectFromTitle
          || config.languageDetection?.languageSelector
          || config.languageDetection?.processedLanguageSelector
          ? [languageCodes.length > 0
            ? {
              key: 'language' as const,
              selector: 'Langue',
              required: false,
              matchedCount: languageCodes.length,
              sample: languageCodes[0],
              samples: languageCodes,
            }
            : {
              key: 'language' as const,
              selector: 'Langue',
              required: false,
              matchedCount: 0,
              issueCode: 'no_match' as const,
            }]
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
      setValidationUiError(error instanceof Error ? error.message : 'Echec de la validation de la recherche.');
    } finally {
      setValidating(false);
    }
  }, [formValues, scraper.baseUrl]);

  const handlePreviewNextPage = useCallback(async () => {
    const config = buildSearchConfig(formValues);
    if (!previewPage) {
      return;
    }

    const nextPageIndex = previewPageIndex + 1;
    const nextTargetUrl = usesTemplatePaging
      ? resolveScraperSearchTargetUrl(scraper.baseUrl, config, config.testQuery || '', {
        pageIndex: nextPageIndex,
      })
      : previewPage.nextPageUrl;

    if (!nextTargetUrl) {
      return;
    }

    setValidating(true);
    setValidationUiError(null);

    try {
      const nextPage = await fetchPreviewPage(config.testQuery || '', nextTargetUrl, config, nextPageIndex);
      if (!nextPage.items.length) {
        setValidationUiError('Aucun resultat exploitable n\'a ete trouve sur la page suivante.');
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
  }, [fetchPreviewPage, formValues, previewPage, previewPageIndex, scraper.baseUrl, usesTemplatePaging]);

  const handlePreviewPreviousPage = useCallback(async () => {
    const config = buildSearchConfig(formValues);
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
      const previousPage = await fetchPreviewPage(
        config.testQuery || '',
        previousTargetUrl,
        config,
        previewPageIndex - 1,
      );
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
  }, [fetchPreviewPage, formValues, previewPageIndex, previewVisitedPageUrls]);

  const buildSaveConfig = useCallback(() => {
    const config = buildSearchConfig(formValues);
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
        title="Configurer la recherche"
        description={
          'Definis ici comment lancer une recherche sur le site et comment extraire les cartes de '
          + 'resultats qui serviront ensuite dans l\'affichage du scraper.'
        }
        noteTitle="Connexion avec la fiche"
        noteText={
          'Si tu veux ouvrir un resultat directement dans `Fiche`, renseigne le selecteur du lien '
          + 'de fiche puis configure simplement le composant `Fiche` pour parser correctement la page.'
        }
        statusClassName={currentStatusMeta.className}
        statusLabel={currentStatusMeta.label}
        onBack={onBack}
      />

      <div className="mh-form">
        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>URL de recherche</h4>
            <p>
              Indique comment l&apos;application construit l&apos;URL a partir de la requete du user.
              La requete peut rester vide si le site accepte une recherche globale.
            </p>
          </div>

          <div className="scraper-config-section__grid">
            <ScraperConfigField
              field={URL_TEMPLATE_FIELD}
              value={formValues.urlTemplate}
              error={fieldErrors.urlTemplate}
              onChange={handleFieldChange('urlTemplate')}
            />
          </div>

          <div className="scraper-config-hint">
            Placeholders supportes : <code>{'{{query}}'}</code>, <code>{'{{rawQuery}}'}</code>,
            <code>{' {{page}}'}</code>, <code>{'{{page3}}'}</code>, <code>{'{{pageIndex}}'}</code>.
            Les variantes <code>{'{{value}}'}</code> et <code>{'{{rawValue}}'}</code> restent
            aussi acceptees pour garder la meme logique que les autres composants.
          </div>
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Requete HTTP</h4>
            <p>
              Choisis si la recherche doit etre envoyee en `GET` ou en `POST`, puis configure le
              body si le site attend un formulaire ou une charge utile specifique.
            </p>
          </div>

          <SearchRequestSection
            request={formValues.request}
            fieldErrors={fieldErrors}
            validating={validating}
            saving={saving}
            onMethodChange={handleRequestMethodChange}
            onBodyModeChange={handleRequestBodyModeChange}
            onBodyChange={handleRequestBodyChange}
            onContentTypeChange={handleRequestContentTypeChange}
            onAddField={handleAddRequestField}
            onRemoveField={handleRemoveRequestField}
            onUpdateField={handleUpdateRequestField}
          />
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Scraping</h4>
            <p>
              Definis les selecteurs a utiliser pour parcourir les cartes de resultats et extraire
              les informations utiles.
            </p>
          </div>

          <div className="scraper-config-hint">
            Le conteneur de resultats est optionnel. Il sert surtout a limiter la zone de parsing
            si la page contient plusieurs listes ou des cartes hors recherche. Si le site est
            pagine, tu peux soit utiliser <code>{'{{page}}'}</code> dans l&apos;URL, soit renseigner
            le selecteur de page suivante, soit combiner les deux.
          </div>

          <ScraperConfigFieldGrid
            fields={SCRAPING_FIELDS}
            fieldSelectorNames={SCRAPING_FIELD_SELECTOR_NAMES}
            getValue={(fieldName) => (
              formValues[fieldName as Exclude<keyof SearchFeatureFormState, 'request' | 'languageDetection'>] ?? ''
            )}
            getError={(fieldName) => fieldErrors[fieldName]}
            onFieldChange={(fieldName) => (
              handleFieldChange(fieldName as Exclude<keyof SearchFeatureFormState, 'request' | 'languageDetection'>)
            )}
            onFieldSelectorChange={(fieldName) => (
              handleFieldSelectorChange(fieldName as Exclude<keyof SearchFeatureFormState, 'request' | 'languageDetection'>)
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
            <p>
              Lance une recherche de test puis verifie l&apos;apercu des resultats extraits.
            </p>
          </div>

          <ScraperConfigField
            field={TEST_QUERY_FIELD}
            value={formValues.testQuery}
            error={fieldErrors.testQuery}
            onChange={handleFieldChange('testQuery')}
          />

          <ScraperResolvedUrlPreview
            url={resolvedTestUrl}
            emptyMessage="Complete le template pour voir l'apercu. La requete de test est optionnelle."
          />

          {resolvedTestRequestConfig?.method === 'POST' ? (
            <div className="scraper-config-preview">
              <span>Requete de test resolue</span>
              <strong>
                {resolvedTestRequestConfig.bodyMode === 'raw'
                  ? resolvedTestRequestConfig.contentType
                    ? `POST (${resolvedTestRequestConfig.contentType})`
                    : 'POST'
                  : `POST formulaire avec ${(resolvedTestRequestConfig.bodyFields ?? []).length} champ(s)`}
              </strong>
              {resolvedTestRequestConfig.bodyMode === 'raw' ? (
                <code>{resolvedTestRequestConfig.body || '(body vide)'}</code>
              ) : (
                <code>
                  {(resolvedTestRequestConfig.bodyFields ?? [])
                    .map((field) => `${field.key}=${field.value}`)
                    .join('&') || '(aucun champ)'}
                </code>
              )}
            </div>
          ) : null}

          <ScraperFeatureActions
            validating={validating}
            saving={saving}
            validateLabel="Valider la recherche"
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
