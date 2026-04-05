import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FetchScraperDocumentResult,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperRecord,
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
import ScraperValidationSummary from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
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
  SCRAPING_FIELDS,
  SearchFeatureFormState,
  TEST_QUERY_FIELD,
  URL_TEMPLATE_FIELD,
} from '@/renderer/components/ScraperConfig/search/searchFeatureEditor.utils';

type Props = {
  scraper: ScraperRecord;
  feature: ScraperFeatureDefinition;
  onBack: () => void;
  onScraperChange: (scraper: ScraperRecord) => void;
};

export default function ScraperSearchFeatureEditor({
  scraper,
  feature,
  onBack,
  onScraperChange,
}: Props) {
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature]);
  const [formValues, setFormValues] = useState<SearchFeatureFormState>(initialConfig);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationResult, setValidationResult] = useState<ScraperFeatureValidationResult | null>(
    feature.validation,
  );
  const [previewPage, setPreviewPage] = useState<ScraperRuntimeSearchPageResult | null>(null);
  const [previewVisitedPageUrls, setPreviewVisitedPageUrls] = useState<string[]>([]);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewResults, setPreviewResults] = useState<ScraperSearchResultItem[]>([]);
  const [lastValidatedSignature, setLastValidatedSignature] = useState<string | null>(
    feature.validation?.ok ? getConfigSignature(buildSearchConfig(initialConfig)) : null,
  );
  const [validationUiError, setValidationUiError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setFormValues(initialConfig);
    setFieldErrors({});
    setValidationResult(feature.validation);
    setPreviewPage(null);
    setPreviewVisitedPageUrls([]);
    setPreviewPageIndex(0);
    setPreviewResults([]);
    setLastValidatedSignature(feature.validation?.ok ? getConfigSignature(buildSearchConfig(initialConfig)) : null);
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);
  }, [feature, initialConfig]);

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

  const handleFieldChange = useCallback((fieldName: Exclude<keyof SearchFeatureFormState, 'request'>) => (
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

  const handleRequestMethodChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextMethod = event.target.value === 'POST' ? 'POST' : 'GET';
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        method: nextMethod,
      },
    }));
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    setFieldErrors((previous) => {
      const next = { ...previous };
      Object.keys(next)
        .filter((key) => key.startsWith('request.'))
        .forEach((key) => {
          delete next[key];
        });
      return next;
    });
  }, []);

  const handleRequestBodyModeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextBodyMode = event.target.value === 'raw' ? 'raw' : 'form';
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        bodyMode: nextBodyMode,
      },
    }));
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    setFieldErrors((previous) => {
      const next = { ...previous };
      Object.keys(next)
        .filter((key) => key.startsWith('request.'))
        .forEach((key) => {
          delete next[key];
        });
      return next;
    });
  }, []);

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
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);
  }, []);

  const handleRemoveRequestField = useCallback((draftId: string) => {
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        bodyFields: previous.request.bodyFields.filter((field) => field.draftId !== draftId),
      },
    }));
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    setFieldErrors((previous) => {
      const next = { ...previous };
      Object.keys(next)
        .filter((key) => key.startsWith(`request.bodyFields.${draftId}.`))
        .forEach((key) => {
          delete next[key];
        });
      return next;
    });
  }, []);

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
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[`request.bodyFields.${draftId}.${fieldName}`];
      return next;
    });
  }, []);

  const handleRequestBodyChange = useCallback((nextValue: string) => {
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        body: nextValue,
      },
    }));
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);
  }, []);

  const handleRequestContentTypeChange = useCallback((nextValue: string) => {
    setFormValues((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        contentType: nextValue,
      },
    }));
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);
  }, []);

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

  const handleSave = useCallback(async () => {
    const config = buildSearchConfig(formValues);
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

          <div className="scraper-config-section__grid">
            {SCRAPING_FIELDS.map((field) => (
              <ScraperConfigField
                key={field.name}
                field={field}
                value={formValues[field.name as Exclude<keyof SearchFeatureFormState, 'request'>] ?? ''}
                error={fieldErrors[field.name]}
                onChange={handleFieldChange(field.name as Exclude<keyof SearchFeatureFormState, 'request'>)}
              />
            ))}
          </div>
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

          <div className="scraper-config-preview">
            <span>URL de test resolue</span>
            <strong>{resolvedTestUrl || 'Complete le template pour voir l\'apercu. La requete de test est optionnelle.'}</strong>
          </div>

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

          <div className="scraper-config-step__actions">
            <button type="button" className="secondary" onClick={onBack} disabled={validating || saving}>
              Retour
            </button>
            <button type="button" className="secondary" onClick={handleValidate} disabled={validating || saving}>
              {validating ? 'Validation en cours...' : 'Valider la recherche'}
            </button>
            <button type="button" className="primary" onClick={handleSave} disabled={validating || saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer la configuration'}
            </button>
          </div>

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
