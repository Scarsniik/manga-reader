import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Field } from '@/renderer/components/utils/Form/types';
import TextField from '@/renderer/components/utils/Form/fields/TextField';
import {
  FetchScraperDocumentResult,
  ScraperFeatureDefinition,
  ScraperFeatureValidationResult,
  ScraperRecord,
  ScraperSearchFeatureConfig,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import {
  extractScraperSearchPageFromDocument,
  hasSearchPagePlaceholder,
  normalizeSelectorInput,
  resolveScraperSearchTargetUrl,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';

type Props = {
  scraper: ScraperRecord;
  feature: ScraperFeatureDefinition;
  onBack: () => void;
  onScraperChange: (scraper: ScraperRecord) => void;
};

const URL_TEMPLATE_FIELD: Field = {
  name: 'urlTemplate',
  label: 'Template d\'URL de recherche',
  type: 'text',
  required: true,
  placeholder: 'Exemple : /?s={{query}}',
};

const TEST_QUERY_FIELD: Field = {
  name: 'testQuery',
  label: 'Requete de test',
  type: 'text',
  placeholder: 'Optionnel : one piece',
};

const SCRAPING_FIELDS: Field[] = [
  {
    name: 'resultListSelector',
    label: 'Conteneur de resultats',
    type: 'text',
    placeholder: 'Optionnel : .search-results',
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
    name: 'nextPageSelector',
    label: 'Selecteur page suivante',
    type: 'text',
    placeholder: 'Optionnel : .next a@href',
  },
];

const DEFAULT_SEARCH_CONFIG: ScraperSearchFeatureConfig = {
  urlTemplate: '',
  testQuery: '',
  resultListSelector: '',
  resultItemSelector: '',
  titleSelector: '',
  detailUrlSelector: '',
  thumbnailSelector: '',
  summarySelector: '',
  nextPageSelector: '',
};

const FEATURE_STATUS_META = {
  not_configured: { label: 'Non configure', className: 'is-not-configured' },
  configured: { label: 'Configure non valide', className: 'is-configured' },
  validated: { label: 'Valide', className: 'is-validated' },
} as const;

const trimOptional = (value: unknown): string | undefined => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

const trimOptionalSelector = (value: unknown): string | undefined => {
  const normalized = normalizeSelectorInput(String(value ?? ''));
  return normalized ? normalized : undefined;
};

const buildSearchConfig = (values: Partial<ScraperSearchFeatureConfig>): ScraperSearchFeatureConfig => ({
  urlTemplate: trimOptional(values.urlTemplate) ?? '',
  testQuery: trimOptional(values.testQuery),
  resultListSelector: trimOptionalSelector(values.resultListSelector),
  resultItemSelector: normalizeSelectorInput(String(values.resultItemSelector ?? '')),
  titleSelector: normalizeSelectorInput(String(values.titleSelector ?? '')),
  detailUrlSelector: trimOptionalSelector(values.detailUrlSelector),
  thumbnailSelector: trimOptionalSelector(values.thumbnailSelector),
  summarySelector: trimOptionalSelector(values.summarySelector),
  nextPageSelector: trimOptionalSelector(values.nextPageSelector),
});

const getInitialConfig = (feature: ScraperFeatureDefinition): ScraperSearchFeatureConfig => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return {
    urlTemplate: trimOptional(raw.urlTemplate) ?? '',
    testQuery: trimOptional(raw.testQuery),
    resultListSelector: trimOptionalSelector(raw.resultListSelector),
    resultItemSelector: normalizeSelectorInput(String(raw.resultItemSelector ?? '')),
    titleSelector: normalizeSelectorInput(String(raw.titleSelector ?? '')),
    detailUrlSelector: trimOptionalSelector(raw.detailUrlSelector),
    thumbnailSelector: trimOptionalSelector(raw.thumbnailSelector),
    summarySelector: trimOptionalSelector(raw.summarySelector),
    nextPageSelector: trimOptionalSelector(raw.nextPageSelector),
  };
};

const getConfigSignature = (config: ScraperSearchFeatureConfig): string => JSON.stringify(config);

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

const getSaveFieldErrors = (config: ScraperSearchFeatureConfig): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (!config.urlTemplate) {
    errors.urlTemplate = 'Le template de recherche est requis.';
  }

  if (!config.resultItemSelector) {
    errors.resultItemSelector = 'Le bloc resultat est requis.';
  }

  if (!config.titleSelector) {
    errors.titleSelector = 'Le selecteur du titre est requis.';
  }

  return errors;
};

const getValidationFieldErrors = (config: ScraperSearchFeatureConfig): Record<string, string> => {
  return getSaveFieldErrors(config);
};

const buildValidationPresentation = (
  validationResult: ScraperFeatureValidationResult,
  previewResults: ScraperSearchResultItem[],
  previewPage: ScraperRuntimeSearchPageResult | null,
): {
  summary: string;
  details: string[];
  warning?: string;
} => {
  const details: string[] = [];
  const warnings: string[] = [];
  const titleCheck = validationResult.checks.find((check) => check.key === 'title');
  const coverCheck = validationResult.checks.find((check) => check.key === 'cover');
  const summaryCheck = validationResult.checks.find((check) => check.key === 'description');

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

  if (titleCheck?.matchedCount) {
    details.push(`Resultats trouves : ${titleCheck.matchedCount}`);
  }

  if (previewResults[0]?.detailUrl) {
    details.push(`Premier lien detecte : ${previewResults[0].detailUrl}`);
  }

  if (coverCheck?.matchedCount) {
    details.push(`Miniatures detectees : ${coverCheck.matchedCount}`);
  }

  if (summaryCheck?.matchedCount) {
    details.push(`Resumes detectes : ${summaryCheck.matchedCount}`);
  }

  if (previewPage?.nextPageUrl) {
    details.push(`Page suivante detectee : ${previewPage.nextPageUrl}`);
  }

  return {
    summary: validationResult.ok
      ? 'La recherche de test renvoie des resultats exploitables.'
      : validationResult.failureCode === 'http_error'
        ? typeof validationResult.status === 'number'
          ? `La page de recherche a repondu avec le code HTTP ${validationResult.status}.`
          : 'La page de recherche a repondu avec une erreur HTTP.'
        : validationResult.failureCode === 'request_failed'
          ? 'Impossible de recuperer la page de recherche.'
          : titleCheck?.issueCode === 'no_match'
            ? 'Aucun resultat exploitable n\'a ete trouve avec la configuration actuelle.'
            : 'La validation de la recherche a echoue.',
    details,
    warning: warnings.length ? warnings.join(' ') : undefined,
  };
};

export default function ScraperSearchFeatureEditor({
  scraper,
  feature,
  onBack,
  onScraperChange,
}: Props) {
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature]);
  const [formValues, setFormValues] = useState<ScraperSearchFeatureConfig>(initialConfig);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationResult, setValidationResult] = useState<ScraperFeatureValidationResult | null>(
    feature.validation,
  );
  const [previewPage, setPreviewPage] = useState<ScraperRuntimeSearchPageResult | null>(null);
  const [previewVisitedPageUrls, setPreviewVisitedPageUrls] = useState<string[]>([]);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewResults, setPreviewResults] = useState<ScraperSearchResultItem[]>([]);
  const [lastValidatedSignature, setLastValidatedSignature] = useState<string | null>(
    feature.validation?.ok ? getConfigSignature(initialConfig) : null,
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
    setLastValidatedSignature(feature.validation?.ok ? getConfigSignature(initialConfig) : null);
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

  const validationPresentation = useMemo(
    () => (validationResult ? buildValidationPresentation(validationResult, previewResults, previewPage) : null),
    [previewPage, previewResults, validationResult],
  );

  const previewCards = useMemo(
    () => previewResults.slice(0, 8),
    [previewResults],
  );

  const fetchPreviewPage = useCallback(async (
    targetUrl: string,
    config: ScraperSearchFeatureConfig,
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

  const handleFieldChange = useCallback((fieldName: keyof ScraperSearchFeatureConfig) => (
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

  const renderField = useCallback((field: Field) => {
    const value = formValues[field.name as keyof ScraperSearchFeatureConfig] ?? '';
    const error = fieldErrors[field.name];

    return (
      <div key={field.name} className="mh-form__field">
        {field.label ? <label htmlFor={field.name}>{field.label}{field.required ? ' *' : ''}</label> : null}
        <TextField
          field={field}
          value={value}
          onChange={handleFieldChange(field.name as keyof ScraperSearchFeatureConfig)}
        />
        {error ? <div className="mh-form__field-error">{error}</div> : null}
      </div>
    );
  }, [fieldErrors, formValues, handleFieldChange]);

  const handleValidate = useCallback(async () => {
    const config = buildSearchConfig(formValues);
    const errors = getValidationFieldErrors(config);
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
  }, [fetchPreviewPage, formValues, scraper.baseUrl]);

  const handlePreviewNextPage = useCallback(async () => {
    const config = buildSearchConfig(formValues);
    if (!previewPage) {
      return;
    }

    const nextTargetUrl = usesTemplatePaging
      ? resolveScraperSearchTargetUrl(scraper.baseUrl, config, config.testQuery || '', {
        pageIndex: previewPageIndex + 1,
      })
      : previewPage.nextPageUrl;

    if (!nextTargetUrl) {
      return;
    }

    setValidating(true);
    setValidationUiError(null);

    try {
      const nextPage = await fetchPreviewPage(nextTargetUrl, config);
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
      setPreviewPageIndex((previous) => previous + 1);
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
      const previousPage = await fetchPreviewPage(previousTargetUrl, config);
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
    const errors = getSaveFieldErrors(config);
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
        <h3>Configurer la recherche</h3>
        <p>
          Definis ici comment lancer une recherche sur le site et comment extraire les cartes de
          resultats qui serviront ensuite dans l&apos;affichage du scraper.
        </p>
      </div>

      <div className="scraper-config-note">
        <strong>Connexion avec la fiche</strong>
        <span>
          Si tu veux ouvrir un resultat directement dans `Fiche`, renseigne le selecteur du lien
          de fiche puis configure simplement le composant `Fiche` pour parser correctement la page.
        </span>
      </div>

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
            {renderField(URL_TEMPLATE_FIELD)}
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
            {SCRAPING_FIELDS.map(renderField)}
          </div>
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Test</h4>
            <p>
              Lance une recherche de test puis verifie l&apos;apercu des resultats extraits.
            </p>
          </div>

          {renderField(TEST_QUERY_FIELD)}

          <div className="scraper-config-preview">
            <span>URL de test resolue</span>
            <strong>{resolvedTestUrl || 'Complete le template pour voir l\'apercu. La requete de test est optionnelle.'}</strong>
          </div>

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

          {previewCards.length ? (
            <>
              {previewPage?.nextPageUrl ? (
                <div className="scraper-config-preview">
                  <span>Page suivante detectee</span>
                  <strong>{previewPage.nextPageUrl}</strong>
                </div>
              ) : null}

              {(usesTemplatePaging || previewPageIndex > 0 || previewPage?.nextPageUrl) ? (
                <div className="scraper-search-preview-pagination">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void handlePreviewPreviousPage()}
                    disabled={validating || previewPageIndex <= 0}
                  >
                    Tester page precedente
                  </button>
                  <span>
                    Page testee : {previewPageIndex + 1}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void handlePreviewNextPage()}
                    disabled={validating || (!usesTemplatePaging && !previewPage?.nextPageUrl)}
                  >
                    Tester page suivante
                  </button>
                </div>
              ) : null}

              <div className="scraper-fake-search-results">
                {previewCards.map((result) => (
                  <article
                    key={`${result.detailUrl ?? result.title}-${result.title}`}
                    className="scraper-fake-search-card"
                  >
                    <div className="scraper-fake-search-card__media">
                      {result.thumbnailUrl ? (
                        <img src={result.thumbnailUrl} alt={result.title} />
                      ) : (
                        <div className="scraper-fake-search-card__media-placeholder">Image</div>
                      )}
                    </div>

                    <div className="scraper-fake-search-card__content">
                      <h5>{result.title}</h5>
                      {result.summary ? <p>{result.summary}</p> : null}
                      {result.detailUrl ? (
                        <div className="scraper-fake-search-card__meta">Lien de fiche detecte</div>
                      ) : (
                        <div className="scraper-fake-search-card__meta is-muted">Aucun lien de fiche detecte</div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
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
