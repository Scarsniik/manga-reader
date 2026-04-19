import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FetchScraperDocumentResult,
  ScraperCardListConfig,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import ScraperConfigField from '@/renderer/components/ScraperConfig/shared/ScraperConfigField';
import ScraperFeatureEditorHeader from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorHeader';
import ScraperFeatureMessages from '@/renderer/components/ScraperConfig/shared/ScraperFeatureMessages';
import ScraperTemplateContext from '@/renderer/components/ScraperConfig/shared/ScraperTemplateContext';
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
import SearchFeaturePreview from '@/renderer/components/ScraperConfig/search/SearchFeaturePreview';
import {
  extractScraperSearchPageFromDocument,
  hasAuthorPagePlaceholder,
  resolveScraperAuthorTargetUrl,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import { buildScraperTemplateContextFromValidation } from '@/renderer/utils/scraperTemplateContext';
import {
  AUTHOR_SCRAPING_FIELD_NAMES,
  AuthorFeatureFormState,
  buildAuthorScrapingFields,
  buildAuthorConfig,
  buildDocumentFailure,
  buildValidationPresentation,
  FEATURE_STATUS_META,
  getConfigSignature,
  getInitialConfig,
  getSaveFieldErrors,
  getValidationFieldErrors,
  SCRAPING_FIELDS,
  TEST_URL_FIELD,
  TEST_VALUE_FIELD,
  URL_STRATEGY_FIELD,
  URL_TEMPLATE_FIELD,
} from '@/renderer/components/ScraperConfig/author/authorFeatureEditor.utils';

type Props = {
  feature: ScraperFeatureDefinition;
  onBack: () => void;
};

export default function ScraperAuthorFeatureEditor({
  feature,
  onBack,
}: Props) {
  const { scraper } = useScraperConfig();
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature]);
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
    createTextFieldChangeHandler,
    resetEditorState,
  } = useScraperFeatureEditorState<AuthorFeatureFormState>({
    initialFormValues: initialConfig,
    initialValidationResult: feature.validation,
    initialValidatedSignature: feature.validation?.ok ? getConfigSignature(buildAuthorConfig(initialConfig)) : null,
  });

  useEffect(() => {
    resetEditorState();
    setPreviewPage(null);
    setPreviewVisitedPageUrls([]);
    setPreviewPageIndex(0);
    setPreviewResults([]);
  }, [feature, resetEditorState]);

  const currentStatusMeta = FEATURE_STATUS_META[feature.status];
  const currentConfig = useMemo(() => buildAuthorConfig(formValues), [formValues]);
  const usesTemplatePaging = hasAuthorPagePlaceholder(currentConfig);
  const templateContext = useMemo<Record<string, string | undefined>>(() => (
    buildScraperTemplateContextFromValidation(detailsFeature?.validation)
  ), [detailsFeature?.validation]);
  const copiedSearchScrapingFields = useMemo(() => {
    if (!searchFeature?.config || searchFeature.status === 'not_configured') {
      return null;
    }

    return buildAuthorScrapingFields(searchFeature.config as Partial<ScraperCardListConfig>);
  }, [searchFeature]);
  const canCopySearchSelectors = useMemo(
    () => copiedSearchScrapingFields
      ? AUTHOR_SCRAPING_FIELD_NAMES.some((fieldName) => Boolean(copiedSearchScrapingFields[fieldName]))
      : false,
    [copiedSearchScrapingFields],
  );

  const resolvedTestUrl = useMemo(() => {
    try {
      return resolveScraperAuthorTargetUrl(
        scraper.baseUrl,
        currentConfig,
        currentConfig.urlStrategy === 'template'
          ? currentConfig.testValue || ''
          : currentConfig.testUrl || '',
        {
          pageIndex: 0,
          templateContext,
        },
      );
    } catch {
      return null;
    }
  }, [currentConfig, scraper.baseUrl, templateContext]);

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
            ? `La page auteur a repondu avec le code HTTP ${typedDocumentResult.status}.`
            : 'Impossible de charger la page auteur.'),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(typedDocumentResult.html, 'text/html');
    return extractScraperSearchPageFromDocument(documentNode, currentConfig, {
      requestedUrl: typedDocumentResult.requestedUrl,
      finalUrl: typedDocumentResult.finalUrl,
    });
  }, [currentConfig, scraper.baseUrl]);

  const handleFieldChange = useCallback((fieldName: keyof AuthorFeatureFormState) => (
    createTextFieldChangeHandler(fieldName)
  ), [createTextFieldChangeHandler]);

  const handleCopySearchSelectors = useCallback(() => {
    if (!copiedSearchScrapingFields) {
      return;
    }

    setFormValues((previous) => ({
      ...previous,
      ...copiedSearchScrapingFields,
    }));
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage('Selecteurs copies depuis Recherche. Pense a valider puis enregistrer.');

    setFieldErrors((previous) => {
      const next = { ...previous };
      AUTHOR_SCRAPING_FIELD_NAMES.forEach((fieldName) => {
        delete next[fieldName];
      });
      return next;
    });
  }, [copiedSearchScrapingFields]);

  const handleValidate = useCallback(async () => {
    const config = buildAuthorConfig(formValues);
    const errors = getValidationFieldErrors(config);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setValidationUiError('Complete d\'abord les champs requis pour lancer le test.');
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      setValidationUiError('La validation de la page auteur n\'est pas disponible dans cette version.');
      return;
    }

    let targetUrl = '';
    try {
      targetUrl = resolveScraperAuthorTargetUrl(
        scraper.baseUrl,
        config,
        config.urlStrategy === 'template' ? config.testValue || '' : config.testUrl || '',
        {
          pageIndex: 0,
          templateContext,
        },
      );
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : 'Impossible de construire l\'URL auteur.');
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

      const titles = extractedResults.map((result) => result.title).filter(Boolean);
      const authorUrls = extractedResults.map((result) => result.authorUrl).filter(Boolean) as string[];
      const thumbnails = extractedResults.map((result) => result.thumbnailUrl).filter(Boolean) as string[];
      const summaries = extractedResults.map((result) => result.summary).filter(Boolean) as string[];

      const checks = [
        titles.length > 0
          ? {
            key: 'title' as const,
            selector: config.titleSelector,
            required: true,
            matchedCount: titles.length,
            sample: titles[0],
            samples: titles.slice(0, 12),
          }
          : {
            key: 'title' as const,
            selector: config.titleSelector,
            required: true,
            matchedCount: 0,
            issueCode: 'no_match' as const,
          },
        ...(config.thumbnailSelector
          ? [thumbnails.length > 0
            ? {
              key: 'cover' as const,
              selector: config.thumbnailSelector,
              required: false,
              matchedCount: thumbnails.length,
              sample: thumbnails[0],
              samples: thumbnails.slice(0, 12),
            }
            : {
              key: 'cover' as const,
              selector: config.thumbnailSelector,
              required: false,
              matchedCount: 0,
              issueCode: 'no_match' as const,
            }]
          : []),
        ...(config.authorUrlSelector
          ? [authorUrls.length > 0
            ? {
              key: 'authorUrl' as const,
              selector: config.authorUrlSelector,
              required: false,
              matchedCount: authorUrls.length,
              sample: authorUrls[0],
              samples: authorUrls.slice(0, 12),
            }
            : {
              key: 'authorUrl' as const,
              selector: config.authorUrlSelector,
              required: false,
              matchedCount: 0,
              issueCode: 'no_match' as const,
            }]
          : []),
        ...(config.summarySelector
          ? [summaries.length > 0
            ? {
              key: 'description' as const,
              selector: config.summarySelector,
              required: false,
              matchedCount: summaries.length,
              sample: summaries[0],
              samples: summaries.slice(0, 12),
            }
            : {
              key: 'description' as const,
              selector: config.summarySelector,
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
      setValidationUiError(error instanceof Error ? error.message : 'Echec de la validation de la page auteur.');
    } finally {
      setValidating(false);
    }
  }, [formValues, scraper.baseUrl, templateContext]);

  const handlePreviewNextPage = useCallback(async () => {
    if (!previewPage) {
      return;
    }

    const nextPageIndex = previewPageIndex + 1;
    const nextTargetUrl = usesTemplatePaging
      ? resolveScraperAuthorTargetUrl(
        scraper.baseUrl,
        currentConfig,
        currentConfig.urlStrategy === 'template' ? currentConfig.testValue || '' : currentConfig.testUrl || '',
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
      const nextPage = await fetchPreviewPage(
        currentConfig.urlStrategy === 'template' ? currentConfig.testValue || '' : currentConfig.testUrl || '',
        nextTargetUrl,
      );
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
  }, [currentConfig, fetchPreviewPage, previewPage, previewPageIndex, scraper.baseUrl, templateContext, usesTemplatePaging]);

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
      const previousPage = await fetchPreviewPage(
        currentConfig.urlStrategy === 'template' ? currentConfig.testValue || '' : currentConfig.testUrl || '',
        previousTargetUrl,
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
  }, [currentConfig, fetchPreviewPage, previewPageIndex, previewVisitedPageUrls]);

  const buildSaveConfig = useCallback(() => {
    const config = buildAuthorConfig(formValues);
    return {
      config,
      errors: getSaveFieldErrors(config),
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
        title="Configurer la page auteur"
        description={
          'La page auteur combine deux besoins : construire une URL a partir d\'un nom ou d\'une URL connue, '
          + 'puis parser une liste de cards comme pour la recherche.'
        }
        noteTitle="Connexion avec Recherche et Fiche"
        noteText={
          'Les composants `Recherche` et `Fiche` peuvent remonter une URL auteur optionnelle. '
          + 'Quand elle existe, le runtime ouvrira directement cette page. Sinon, il utilisera le nom '
          + 'de l\'auteur avec le template configure ici, et pourra aussi reutiliser les variables '
          + 'extraites de `Fiche`.'
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
              Definis comment l&apos;application saura ouvrir une page auteur depuis une URL directe
              ou a partir d&apos;un nom / slug.
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
              Placeholders supportes : <code>{'{{value}}'}</code>, <code>{'{{rawValue}}'}</code>,
              <code>{' {{query}}'}</code>, <code>{'{{rawQuery}}'}</code>, ainsi que les variantes
              de pagination <code>{'{{page}}'}</code>, <code>{'{{page3}}'}</code> et
              <code>{' {{pageIndex}}'}</code>. Si `Fiche` est validee, tu peux aussi utiliser
              <code>{' {{requestedUrl}}'}</code>, <code>{'{{finalUrl}}'}</code> et les variables
              extraites via <code>{'{{nomVariable}}'}</code> ou <code>{'{{raw:nomVariable}}'}</code>.
            </div>
          </ScraperUrlTemplateFields>

          {currentConfig.urlStrategy === 'template' ? (
            <ScraperTemplateContext
              templateContext={templateContext}
              emptyMessage={(
                <>
                  Aucune fiche validee n&apos;est disponible pour le moment. Le template `Auteur`
                  peut deja fonctionner avec <code>{'{{value}}'}</code>, mais les variables de
                  `Fiche` ne seront utilisables qu&apos;apres validation de ce composant.
                </>
              )}
            />
          ) : null}
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Scraping</h4>
            <p>
              Definis les selecteurs qui permettent d&apos;extraire la liste de cards retournee par la page auteur.
            </p>
          </div>

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
            fields={SCRAPING_FIELDS}
            getValue={(fieldName) => formValues[fieldName as keyof AuthorFeatureFormState] ?? ''}
            getError={(fieldName) => fieldErrors[fieldName]}
            onFieldChange={(fieldName) => handleFieldChange(fieldName as keyof AuthorFeatureFormState)}
          />
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Test</h4>
            <p>
              Charge une page auteur de test puis verifie l&apos;apercu des cards extraites.
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
            validateLabel="Valider la page auteur"
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
