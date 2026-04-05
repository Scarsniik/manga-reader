import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Field } from '@/renderer/components/utils/Form/types';
import RadioField from '@/renderer/components/utils/Form/fields/RadioField';
import TextField from '@/renderer/components/utils/Form/fields/TextField';
import {
  buildScraperContextTemplateUrl,
  FetchScraperDocumentResult,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
  ScraperPagesFeatureConfig,
  ScraperRecord,
} from '@/shared/scraper';

type Props = {
  scraper: ScraperRecord;
  feature: ScraperFeatureDefinition;
  onBack: () => void;
  onScraperChange: (scraper: ScraperRecord) => void;
};

const URL_STRATEGY_FIELD: Field = {
  name: 'urlStrategy',
  label: 'Source des pages',
  type: 'radio',
  layout: 'cards',
  required: true,
  options: [
    {
      label: 'Depuis la fiche',
      value: 'details_page',
      description: 'Les pages sont lues directement depuis le HTML de la fiche manga validee.',
    },
    {
      label: 'Depuis un template',
      value: 'template',
      description: 'Les pages sont lues depuis une URL construite avec les variables extraites de la fiche.',
    },
  ],
};

const URL_TEMPLATE_FIELD: Field = {
  name: 'urlTemplate',
  label: 'Template d\'URL des pages',
  type: 'text',
  placeholder: 'Exemple : /reader/{{mangaId}} ou {{raw:imageBasePath}}index.html',
};

const PAGE_IMAGE_SELECTOR_FIELD: Field = {
  name: 'pageImageSelector',
  label: 'Selecteur des pages',
  type: 'text',
  placeholder: 'Exemple : #cif .iw img@src',
};

const DEFAULT_PAGES_CONFIG: ScraperPagesFeatureConfig = {
  urlStrategy: 'details_page',
  urlTemplate: '',
  pageImageSelector: '',
};

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

const normalizeSelectorInput = (input: string): string => input
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const trimOptional = (value: unknown): string | undefined => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

const buildPagesConfig = (values: Partial<ScraperPagesFeatureConfig>): ScraperPagesFeatureConfig => ({
  urlStrategy: values.urlStrategy === 'template' ? 'template' : 'details_page',
  urlTemplate: trimOptional(values.urlTemplate),
  pageImageSelector: trimOptional(normalizeSelectorInput(String(values.pageImageSelector ?? ''))),
});

const getInitialConfig = (feature: ScraperFeatureDefinition): ScraperPagesFeatureConfig => {
  const raw = (feature.config ?? {}) as Record<string, unknown>;

  return {
    urlStrategy: raw.urlStrategy === 'template' ? 'template' : 'details_page',
    urlTemplate: trimOptional(raw.urlTemplate),
    pageImageSelector: trimOptional(normalizeSelectorInput(String(raw.pageImageSelector ?? ''))),
  };
};

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

  return Array.from(doc.querySelectorAll(selector))
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

const toAbsoluteUrl = (value: string, baseUrl: string): string => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

const getConfigSignature = (config: ScraperPagesFeatureConfig): string => JSON.stringify(config);

const getSaveFieldErrors = (config: ScraperPagesFeatureConfig): Record<string, string> => {
  const errors: Record<string, string> = {};

  if (config.urlStrategy === 'details_page' && !config.pageImageSelector) {
    errors.pageImageSelector = 'Le selecteur des pages est requis.';
  }

  if (config.urlStrategy === 'template' && !config.urlTemplate) {
    errors.urlTemplate = 'Le template d\'URL des pages est requis dans ce mode.';
  }

  return errors;
};

const isImageLikeContentType = (contentType: string | undefined): boolean => (
  typeof contentType === 'string' && contentType.toLowerCase().startsWith('image/')
);

const padPageNumber = (value: number, length: number): string => String(value).padStart(length, '0');

const hasPagePlaceholder = (template: string | undefined): boolean => (
  typeof template === 'string' && /{{\s*page(?:Index)?\d*\s*}}/.test(template)
);

const buildValidationPresentation = (validationResult: ScraperFeatureValidationResult): {
  summary: string;
  details: string[];
} => {
  const details: string[] = [];
  const pagesCheck = validationResult.checks.find((check) => check.key === 'pages');

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
  }

  if (pagesCheck?.matchedCount) {
    details.push(`Pages trouvees : ${pagesCheck.matchedCount}`);
  }

  return {
    summary: validationResult.ok
      ? pagesCheck?.selector
        ? 'Les pages de test ont bien ete detectees.'
        : 'La ressource de page directe est bien accessible.'
      : pagesCheck?.issueCode === 'invalid_selector'
        ? `${CHECK_LABELS.pages} : selecteur invalide.`
        : pagesCheck?.issueCode === 'no_match'
          ? `${CHECK_LABELS.pages} : aucune page trouvee.`
          : 'La validation des pages a echoue.',
    details,
  };
};

export default function ScraperPagesFeatureEditor({
  scraper,
  feature,
  onBack,
  onScraperChange,
}: Props) {
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature]);
  const [formValues, setFormValues] = useState<ScraperPagesFeatureConfig>(initialConfig);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationResult, setValidationResult] = useState<ScraperFeatureValidationResult | null>(feature.validation);
  const [lastValidatedSignature, setLastValidatedSignature] = useState<string | null>(
    feature.validation?.ok ? getConfigSignature(initialConfig) : null,
  );
  const [validationUiError, setValidationUiError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    setFormValues(initialConfig);
    setFieldErrors({});
    setValidationResult(feature.validation);
    setLastValidatedSignature(feature.validation?.ok ? getConfigSignature(initialConfig) : null);
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);
  }, [feature, initialConfig]);

  const currentStatusMeta = FEATURE_STATUS_META[feature.status];
  const currentConfig = useMemo(() => buildPagesConfig(formValues), [formValues]);
  const detailsFeature = useMemo(
    () => scraper.features.find((candidate) => candidate.kind === 'details') || null,
    [scraper.features],
  );

  const templateContext = useMemo<Record<string, string | undefined>>(() => {
    if (!detailsFeature?.validation?.ok) {
      return {};
    }

    const checksByKey = new Map(
      detailsFeature.validation.checks.map((check) => [check.key, check.sample]),
    );
    const derivedValues = Object.fromEntries(
      detailsFeature.validation.derivedValues
        .filter((derivedValue) => Boolean(derivedValue.value))
        .map((derivedValue) => [derivedValue.key, derivedValue.value as string]),
    ) as Record<string, string>;

    return {
      requestedUrl: detailsFeature.validation.requestedUrl,
      finalUrl: detailsFeature.validation.finalUrl || detailsFeature.validation.requestedUrl,
      title: checksByKey.get('title'),
      cover: checksByKey.get('cover'),
      description: checksByKey.get('description'),
      authors: checksByKey.get('authors'),
      tags: checksByKey.get('tags'),
      status: checksByKey.get('status'),
      ...derivedValues,
    };
  }, [detailsFeature]);

  const buildTemplateContextForPage = useCallback((pageIndex: number): Record<string, string | undefined> => ({
    ...templateContext,
    page: String(pageIndex + 1),
    page2: padPageNumber(pageIndex + 1, 2),
    page3: padPageNumber(pageIndex + 1, 3),
    page4: padPageNumber(pageIndex + 1, 4),
    pageIndex: String(pageIndex),
    pageIndex2: padPageNumber(pageIndex, 2),
    pageIndex3: padPageNumber(pageIndex, 3),
    pageIndex4: padPageNumber(pageIndex, 4),
  }), [templateContext]);

  const resolvedTestUrl = useMemo(() => {
    if (!detailsFeature?.validation?.ok) {
      return null;
    }

    try {
      if (currentConfig.urlStrategy === 'template') {
        return buildScraperContextTemplateUrl(
          scraper.baseUrl,
          currentConfig.urlTemplate || '',
          buildTemplateContextForPage(0),
        );
      }

      return detailsFeature.validation.finalUrl || detailsFeature.validation.requestedUrl || null;
    } catch {
      return null;
    }
  }, [buildTemplateContextForPage, currentConfig, detailsFeature, scraper.baseUrl]);

  const previewUrls = useMemo(() => {
    const pagesCheck = validationResult?.checks.find((check) => check.key === 'pages' && check.matchedCount > 0);
    if (!pagesCheck) {
      return [];
    }

    if (pagesCheck.samples?.length) {
      return pagesCheck.samples;
    }

    return pagesCheck.sample ? [pagesCheck.sample] : [];
  }, [validationResult]);

  useEffect(() => {
    setPreviewIndex(0);
  }, [validationResult?.checkedAt]);

  const validationPresentation = useMemo(
    () => (validationResult ? buildValidationPresentation(validationResult) : null),
    [validationResult],
  );

  const handleFieldChange = useCallback((fieldName: keyof ScraperPagesFeatureConfig) => (
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
    const value = formValues[field.name as keyof ScraperPagesFeatureConfig] ?? '';
    const error = fieldErrors[field.name];

    return (
      <div key={field.name} className="mh-form__field">
        {field.label ? <label htmlFor={field.name}>{field.label}{field.required ? ' *' : ''}</label> : null}
        {field.type === 'radio' ? (
          <RadioField
            field={field}
            value={value}
            onChange={handleFieldChange(field.name as keyof ScraperPagesFeatureConfig)}
          />
        ) : (
          <TextField
            field={field}
            value={value}
            onChange={handleFieldChange(field.name as keyof ScraperPagesFeatureConfig)}
          />
        )}
        {error ? <div className="mh-form__field-error">{error}</div> : null}
      </div>
    );
  }, [fieldErrors, formValues, handleFieldChange]);

  const handleValidate = useCallback(async () => {
    const config = buildPagesConfig(formValues);
    const errors = getSaveFieldErrors(config);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setValidationUiError('Complete d\'abord les champs requis pour lancer le test.');
      return;
    }

    if (!detailsFeature?.validation?.ok) {
      setValidationUiError('Valide d\'abord le composant Fiche pour tester les pages.');
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      setValidationUiError('La validation des pages n\'est pas disponible dans cette version.');
      return;
    }

    let targetUrl = '';
    try {
      targetUrl = config.urlStrategy === 'template'
        ? buildScraperContextTemplateUrl(scraper.baseUrl, config.urlTemplate || '', buildTemplateContextForPage(0))
        : (detailsFeature.validation.finalUrl || detailsFeature.validation.requestedUrl || '');
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : 'Impossible de construire l\'URL des pages.');
      return;
    }

    if (!targetUrl) {
      setValidationUiError('Impossible de determiner l\'URL de test des pages.');
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
      if (!typedDocumentResult.ok) {
        setValidationResult({
          ok: false,
          checkedAt: typedDocumentResult.checkedAt,
          requestedUrl: typedDocumentResult.requestedUrl,
          finalUrl: typedDocumentResult.finalUrl,
          status: typedDocumentResult.status,
          contentType: typedDocumentResult.contentType,
          failureCode: typeof typedDocumentResult.status === 'number' ? 'http_error' : 'request_failed',
          checks: [],
          derivedValues: [],
        });
        return;
      }

      let pagesCheck: ScraperFeatureValidationCheck;
      if (!config.pageImageSelector) {
        if (config.urlStrategy === 'template' && hasPagePlaceholder(config.urlTemplate)) {
          const directPageUrls: string[] = [];

          for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
            const pageUrl = buildScraperContextTemplateUrl(
              scraper.baseUrl,
              config.urlTemplate || '',
              buildTemplateContextForPage(pageIndex),
            );

            const resourceResult = await (window as any).api.fetchScraperDocument({
              baseUrl: scraper.baseUrl,
              targetUrl: pageUrl,
            }) as FetchScraperDocumentResult;

            if (!resourceResult.ok || !isImageLikeContentType(resourceResult.contentType)) {
              if (pageIndex === 0) {
                directPageUrls.length = 0;
              }
              break;
            }

            directPageUrls.push(resourceResult.finalUrl || resourceResult.requestedUrl);
          }

          pagesCheck = directPageUrls.length > 0
            ? {
              key: 'pages',
              selector: '',
              required: true,
              matchedCount: directPageUrls.length,
              sample: directPageUrls[0],
              samples: directPageUrls,
            }
            : {
              key: 'pages',
              selector: '',
              required: true,
              matchedCount: 0,
              issueCode: 'no_match',
            };
        } else {
          const directPageUrl = typedDocumentResult.finalUrl || typedDocumentResult.requestedUrl;
          pagesCheck = isImageLikeContentType(typedDocumentResult.contentType)
            ? {
              key: 'pages',
              selector: '',
              required: true,
              matchedCount: 1,
              sample: directPageUrl,
              samples: [directPageUrl],
            }
            : {
              key: 'pages',
              selector: '',
              required: true,
              matchedCount: 0,
              issueCode: 'no_match',
            };
        }
      } else if (!typedDocumentResult.html) {
        pagesCheck = {
          key: 'pages',
          selector: config.pageImageSelector,
          required: true,
          matchedCount: 0,
          issueCode: 'no_match',
        };
      } else {
        const parser = new DOMParser();
        const doc = parser.parseFromString(typedDocumentResult.html, 'text/html');

        try {
          const pageDocumentUrl = typedDocumentResult.finalUrl || typedDocumentResult.requestedUrl;
          const values = extractSelectorValues(doc, config.pageImageSelector)
            .map((value) => toAbsoluteUrl(value, pageDocumentUrl));
          pagesCheck = values.length > 0
            ? {
              key: 'pages',
              selector: config.pageImageSelector,
              required: true,
              matchedCount: values.length,
              sample: values[0],
              samples: values.slice(0, 12),
            }
            : {
              key: 'pages',
              selector: config.pageImageSelector,
              required: true,
              matchedCount: 0,
              issueCode: 'no_match',
            };
        } catch {
          pagesCheck = {
            key: 'pages',
            selector: config.pageImageSelector,
            required: true,
            matchedCount: 0,
            issueCode: 'invalid_selector',
          };
        }
      }

      const nextResult: ScraperFeatureValidationResult = {
        ok: pagesCheck.matchedCount > 0,
        checkedAt: new Date().toISOString(),
        requestedUrl: typedDocumentResult.requestedUrl,
        finalUrl: typedDocumentResult.finalUrl,
        status: typedDocumentResult.status,
        contentType: typedDocumentResult.contentType,
        checks: [pagesCheck],
        derivedValues: [],
      };

      setValidationResult(nextResult);
      if (nextResult.ok) {
        setLastValidatedSignature(getConfigSignature(config));
      }
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : 'Echec de la validation des pages.');
    } finally {
      setValidating(false);
    }
  }, [buildTemplateContextForPage, detailsFeature, formValues, scraper.baseUrl]);

  const handleSave = useCallback(async () => {
    const config = buildPagesConfig(formValues);
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

  const currentPreviewUrl = previewUrls[previewIndex] || null;

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
        <h3>Configurer les pages</h3>
        <p>
          Ce composant sait lire les pages directement depuis la fiche, ou depuis une URL
          construite avec les variables extraites du composant `Fiche`.
        </p>
      </div>

      <div className="scraper-config-note">
        <strong>Validation basee sur la fiche</strong>
        <span>
          Le test des pages repose sur la derniere validation reussie de `Fiche`. Cela permet
          d&apos;utiliser directement son URL finale et ses variables derivees.
        </span>
      </div>

      <div className="mh-form">
        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Source des pages</h4>
            <p>Choisis ou l&apos;application doit aller chercher les pages du manga.</p>
          </div>

          {renderField(URL_STRATEGY_FIELD)}

          {currentConfig.urlStrategy === 'template' ? (
            <>
              {renderField(URL_TEMPLATE_FIELD)}
              <div className="scraper-config-hint">
                Variables disponibles depuis `Fiche` : <code>{'{{requestedUrl}}'}</code>,
                <code>{' {{finalUrl}}'}</code> et les variables extraites. Utilise
                <code>{' {{raw:nomVariable}}'}</code> pour inserer une valeur brute sans encodage.
                Pour les pages directes, tu peux aussi utiliser <code>{'{{page}}'}</code>,
                <code>{' {{page3}}'}</code>, <code>{'{{pageIndex}}'}</code> ou
                <code>{' {{pageIndex3}}'}</code>.
              </div>
            </>
          ) : null}

          {Object.keys(templateContext).length > 0 ? (
            <div className="scraper-template-context">
              {Object.entries(templateContext).map(([key, value]) => (
                value ? (
                  <div key={key} className="scraper-template-context__item">
                    <code>{`{{${key}}}`}</code>
                    <span>{value}</span>
                  </div>
                ) : null
              ))}
            </div>
          ) : (
            <div className="scraper-config-placeholder">
              Aucune fiche validee n&apos;est disponible pour le moment. Tu peux enregistrer la
              configuration, mais la validation des pages restera indisponible tant que `Fiche`
              n&apos;aura pas ete validee.
            </div>
          )}
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Scraping</h4>
            <p>
              Indique comment recuperer les URLs des pages depuis le HTML cible. En mode
              `template`, ce selecteur est optionnel si l&apos;URL resolue pointe deja directement
              vers une image.
            </p>
          </div>

          <div className="scraper-config-hint">
            Laisse ce champ vide si ton template retourne directement une image exploitable comme
            page. Dans ce cas, la validation verifiera seulement que la ressource repond bien comme
            une image.
          </div>

          <div className="scraper-config-section__grid">
            {renderField(PAGE_IMAGE_SELECTOR_FIELD)}
          </div>
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Test</h4>
            <p>
              Lance la validation puis verifie un mini lecteur a partir des pages detectees.
            </p>
          </div>

          <div className="scraper-config-preview">
            <span>URL de test resolue</span>
            <strong>{resolvedTestUrl || 'Valide d\'abord la fiche ou complete le template pour voir l\'aperçu.'}</strong>
          </div>

          <div className="scraper-config-step__actions">
            <button type="button" className="secondary" onClick={onBack} disabled={validating || saving}>
              Retour
            </button>
            <button type="button" className="secondary" onClick={handleValidate} disabled={validating || saving}>
              {validating ? 'Validation en cours...' : 'Valider les pages'}
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
            </div>
          ) : null}

          {currentPreviewUrl ? (
            <div className="scraper-fake-reader">
              <div className="scraper-fake-reader__viewport">
                <img src={currentPreviewUrl} alt={`Page ${previewIndex + 1}`} />
              </div>
              <div className="scraper-fake-reader__controls">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPreviewIndex((current) => Math.max(0, current - 1))}
                  disabled={previewIndex <= 0}
                >
                  Precedent
                </button>
                <span>{previewIndex + 1} / {previewUrls.length}</span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPreviewIndex((current) => Math.min(previewUrls.length - 1, current + 1))}
                  disabled={previewIndex >= previewUrls.length - 1}
                >
                  Suivant
                </button>
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
