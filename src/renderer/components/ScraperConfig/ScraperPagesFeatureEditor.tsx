import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FetchScraperDocumentResult,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
  ScraperPagesFeatureConfig,
  ScraperRecord,
} from '@/shared/scraper';
import ScraperConfigField from '@/renderer/components/ScraperConfig/shared/ScraperConfigField';
import ScraperFeatureEditorHeader from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorHeader';
import ScraperFeatureMessages from '@/renderer/components/ScraperConfig/shared/ScraperFeatureMessages';
import ScraperTemplateContext from '@/renderer/components/ScraperConfig/shared/ScraperTemplateContext';
import ScraperValidationSummary from '@/renderer/components/ScraperConfig/shared/ScraperValidationSummary';
import { formatDisplayUrl } from '@/renderer/components/ScraperConfig/shared/validationDisplay';
import FakeReaderPreview from '@/renderer/components/ScraperConfig/pages/FakeReaderPreview';
import {
  buildDocumentFailure,
  buildPagesConfig,
  buildTemplatePageUrl,
  buildValidationPresentation,
  extractSelectorValues,
  FEATURE_STATUS_META,
  getConfigSignature,
  getInitialConfig,
  getSaveFieldErrors,
  hasPagePlaceholder,
  isImageLikeContentType,
  LINKED_TO_CHAPTERS_FIELD,
  padPageNumber,
  PAGE_IMAGE_SELECTOR_FIELD,
  resolveTemplateBaseUrl,
  TEMPLATE_BASE_FIELD,
  toAbsoluteUrl,
  URL_STRATEGY_FIELD,
  URL_TEMPLATE_FIELD,
} from '@/renderer/components/ScraperConfig/pages/pagesFeatureEditor.utils';
import {
  usesScraperPagesChapterSource,
  usesScraperPagesChapters,
  usesScraperPagesTemplateChapterContext,
} from '@/renderer/utils/scraperPages';
import { buildScraperTemplateContextFromValidation } from '@/renderer/utils/scraperTemplateContext';

type Props = {
  scraper: ScraperRecord;
  feature: ScraperFeatureDefinition;
  onBack: () => void;
  onScraperChange: (scraper: ScraperRecord) => void;
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
  const usesChapterSource = useMemo(
    () => usesScraperPagesChapterSource(currentConfig),
    [currentConfig],
  );
  const usesTemplateChapterContext = useMemo(
    () => usesScraperPagesTemplateChapterContext(currentConfig),
    [currentConfig],
  );
  const usesChaptersForPages = useMemo(
    () => usesScraperPagesChapters(currentConfig),
    [currentConfig],
  );
  const detailsFeature = useMemo(
    () => scraper.features.find((candidate) => candidate.kind === 'details') || null,
    [scraper.features],
  );
  const detailsUrl = useMemo(
    () => detailsFeature?.validation?.ok
      ? (detailsFeature.validation.finalUrl || detailsFeature.validation.requestedUrl || '')
      : '',
    [detailsFeature],
  );
  const chaptersFeature = useMemo(
    () => scraper.features.find((candidate) => candidate.kind === 'chapters') || null,
    [scraper.features],
  );
  const selectedValidationChapter = useMemo(
    () => usesChaptersForPages
      ? chaptersFeature?.validation?.chapters?.[0] || null
      : null,
    [chaptersFeature, usesChaptersForPages],
  );

  const templateContext = useMemo<Record<string, string | undefined>>(() => (
    buildScraperTemplateContextFromValidation(detailsFeature?.validation, {
      chapterUrl: usesChaptersForPages ? selectedValidationChapter?.url : undefined,
    })
  ), [detailsFeature?.validation, selectedValidationChapter?.url, usesChaptersForPages]);

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

    if (usesChaptersForPages && !selectedValidationChapter?.url) {
      return null;
    }

    try {
      if (currentConfig.urlStrategy === 'template') {
        return buildTemplatePageUrl(
          scraper.baseUrl,
          currentConfig.urlTemplate || '',
          buildTemplateContextForPage,
          0,
          {
            relativeToUrl: resolveTemplateBaseUrl(
              scraper.baseUrl,
              currentConfig,
              usesTemplateChapterContext
                ? selectedValidationChapter?.url || detailsUrl
                : detailsUrl,
            ),
          },
        );
      }

      return usesChapterSource
        ? selectedValidationChapter?.url || null
        : detailsUrl || null;
    } catch {
      return null;
    }
  }, [
    buildTemplateContextForPage,
    currentConfig,
    detailsFeature?.validation?.ok,
    detailsUrl,
    scraper.baseUrl,
    selectedValidationChapter,
    usesChapterSource,
    usesChaptersForPages,
    usesTemplateChapterContext,
  ]);

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

  const handleCheckboxChange = useCallback((fieldName: keyof ScraperPagesFeatureConfig) => (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const nextValue = event.target.checked;
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

    if (usesScraperPagesChapters(config) && !chaptersFeature?.validation?.ok) {
      setValidationUiError('Valide d\'abord le composant Chapitres pour tester des pages liees a un chapitre.');
      return;
    }

    if (usesScraperPagesChapters(config) && !selectedValidationChapter?.url) {
      setValidationUiError(
        config.urlStrategy === 'template'
          ? 'Aucun chapitre de test n\'est disponible pour alimenter la variable {{chapter}}.'
          : 'Aucun chapitre de test n\'est disponible pour cette configuration.',
      );
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      setValidationUiError('La validation des pages n\'est pas disponible dans cette version.');
      return;
    }

    let targetUrl = '';
    try {
      const templateBaseUrl = resolveTemplateBaseUrl(
        scraper.baseUrl,
        config,
        usesScraperPagesTemplateChapterContext(config)
          ? selectedValidationChapter?.url || detailsFeature.validation.finalUrl || detailsFeature.validation.requestedUrl
          : detailsFeature.validation.finalUrl || detailsFeature.validation.requestedUrl,
      );

      targetUrl = config.urlStrategy === 'template'
        ? buildTemplatePageUrl(scraper.baseUrl, config.urlTemplate || '', buildTemplateContextForPage, 0, {
          relativeToUrl: templateBaseUrl,
        })
        : (
          config.urlStrategy === 'chapter_page'
            ? selectedValidationChapter?.url || ''
            : detailsFeature.validation.finalUrl || detailsFeature.validation.requestedUrl || ''
        );
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
        setValidationResult(buildDocumentFailure(typedDocumentResult));
        return;
      }

      let pagesCheck: ScraperFeatureValidationCheck;
      if (!config.pageImageSelector) {
        if (config.urlStrategy === 'template' && hasPagePlaceholder(config.urlTemplate)) {
          const directPageUrls: string[] = [];
          const templateBaseUrl = resolveTemplateBaseUrl(
            scraper.baseUrl,
            config,
            usesScraperPagesTemplateChapterContext(config)
              ? selectedValidationChapter?.url || detailsFeature.validation.finalUrl || detailsFeature.validation.requestedUrl
              : detailsFeature.validation.finalUrl || detailsFeature.validation.requestedUrl,
          );

          for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
            const pageUrl = buildTemplatePageUrl(
              scraper.baseUrl,
              config.urlTemplate || '',
              buildTemplateContextForPage,
              pageIndex,
              {
                relativeToUrl: templateBaseUrl,
              },
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
  }, [buildTemplateContextForPage, chaptersFeature, detailsFeature, formValues, scraper.baseUrl, selectedValidationChapter]);

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
      <ScraperFeatureEditorHeader
        title="Configurer les pages"
        description={
          'Ce composant sait lire les pages depuis la fiche, depuis un chapitre, '
          + 'ou depuis une URL construite avec les variables extraites du composant `Fiche`.'
        }
        noteTitle="Validation basee sur la fiche"
        noteText={
          'Le test des pages repose sur la derniere validation reussie de `Fiche`. Cela permet '
          + 'd\'utiliser directement son URL finale, ses variables derivees et, si besoin, les chapitres valides.'
        }
        statusClassName={currentStatusMeta.className}
        statusLabel={currentStatusMeta.label}
        onBack={onBack}
      />

      <div className="mh-form">
        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Source des pages</h4>
            <p>Choisis ou l&apos;application doit aller chercher les pages du manga.</p>
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
              <ScraperConfigField
                field={TEMPLATE_BASE_FIELD}
                value={formValues.templateBase || 'scraper_base'}
                error={fieldErrors.templateBase}
                onChange={handleFieldChange('templateBase')}
              />
              <div className="scraper-config-hint">
                Variables disponibles depuis `Fiche` : <code>{'{{requestedUrl}}'}</code>,
                <code>{' {{finalUrl}}'}</code> et les variables extraites. Utilise
                <code>{' {{raw:nomVariable}}'}</code> pour inserer une valeur brute sans encodage.
                Les variables URL sont encodees par defaut, et la base relative du template peut
                partir soit du scraper, soit de la fiche validee ou du chapitre courant. Pour les pages directes, tu peux
                aussi utiliser <code>{'{{page}}'}</code>,
                <code>{' {{page3}}'}</code>, <code>{'{{pageIndex}}'}</code> ou
                <code>{' {{pageIndex3}}'}</code>.
                {usesTemplateChapterContext ? (
                  <> La variable <code>{'{{chapter}}'}</code> contient l&apos;URL du premier chapitre valide detecte.</>
                ) : null}
              </div>
            </>
          ) : null}

          <ScraperTemplateContext
            templateContext={templateContext}
            emptyMessage={(
              <>
                Aucune fiche validee n&apos;est disponible pour le moment. Tu peux enregistrer la
                configuration, mais la validation des pages restera indisponible tant que `Fiche`
                n&apos;aura pas ete validee.
              </>
            )}
          />
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Scraping</h4>
            <p>
              Indique comment recuperer les URLs des pages depuis le HTML cible. En mode
              `Depuis un template`, ce selecteur est optionnel si l&apos;URL resolue pointe deja directement
              vers une image.
            </p>
          </div>

          {currentConfig.urlStrategy === 'template' ? (
            <>
              <ScraperConfigField
                field={LINKED_TO_CHAPTERS_FIELD}
                value={Boolean(formValues.linkedToChapters)}
                error={fieldErrors.linkedToChapters}
                onChange={handleCheckboxChange('linkedToChapters')}
              />

              {usesTemplateChapterContext ? (
                <div className="scraper-config-hint">
                  Les pages seront resolues chapitre par chapitre. Le composant `Chapitres`
                  doit etre valide pour fournir la variable <code>{'{{chapter}}'}</code>.
                  {selectedValidationChapter?.label ? (
                    <> Le chapitre de test courant est <strong>{selectedValidationChapter.label}</strong>.</>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {usesChapterSource ? (
            <div className="scraper-config-hint">
              Les pages seront lues directement depuis la page du chapitre choisi. Le composant
              `Chapitres` doit etre valide pour fournir un chapitre de test et les actions de lecture.
              {selectedValidationChapter?.label ? (
                <> Le chapitre de test courant est <strong>{selectedValidationChapter.label}</strong>.</>
              ) : null}
            </div>
          ) : null}

          <div className="scraper-config-hint">
            En mode `Depuis la fiche` ou `Depuis un chapitre`, ce selecteur lit le HTML de la
            source choisie. Laisse ce champ vide seulement si ton template retourne directement
            une image exploitable comme page. Dans ce cas, la validation verifiera seulement que
            la ressource repond bien comme une image.
          </div>

          <div className="scraper-config-section__grid">
            <ScraperConfigField
              field={PAGE_IMAGE_SELECTOR_FIELD}
              value={formValues.pageImageSelector}
              error={fieldErrors.pageImageSelector}
              onChange={handleFieldChange('pageImageSelector')}
            />
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
            <strong>{resolvedTestUrl ? formatDisplayUrl(resolvedTestUrl) : 'Valide d\'abord la fiche ou complete le template pour voir l\'aperçu.'}</strong>
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

          <ScraperValidationSummary
            validationResult={validationResult}
            presentation={validationPresentation}
          />

          <FakeReaderPreview
            currentPreviewUrl={currentPreviewUrl}
            previewIndex={previewIndex}
            previewUrls={previewUrls}
            onPrevious={() => setPreviewIndex((current) => Math.max(0, current - 1))}
            onNext={() => setPreviewIndex((current) => Math.min(previewUrls.length - 1, current + 1))}
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
