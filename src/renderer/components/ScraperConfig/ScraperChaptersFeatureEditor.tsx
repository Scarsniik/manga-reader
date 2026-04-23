import React, { useCallback, useEffect, useMemo } from 'react';
import {
  ScraperChapterItem,
  FetchScraperDocumentResult,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationResult,
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
import FakeChaptersPreview from '@/renderer/components/ScraperConfig/chapters/FakeChaptersPreview';
import {
  buildDocumentFailure,
  buildChaptersConfig,
  buildPreviewFromValidation,
  buildValidationPresentation,
  CHAPTER_IMAGE_SELECTOR_FIELD,
  CHAPTER_ITEM_SELECTOR_FIELD,
  CHAPTER_LABEL_SELECTOR_FIELD,
  CHAPTER_LIST_SELECTOR_FIELD,
  CHAPTER_URL_SELECTOR_FIELD,
  FEATURE_STATUS_META,
  getConfigSignature,
  getInitialConfig,
  getSaveFieldErrors,
  REVERSE_ORDER_FIELD,
  TEMPLATE_BASE_FIELD,
  URL_STRATEGY_FIELD,
  URL_TEMPLATE_FIELD,
} from '@/renderer/components/ScraperConfig/chapters/chaptersFeatureEditor.utils';
import { resolveScraperChapters } from '@/renderer/utils/scraperRuntime';
import {
  buildScraperTemplateContextFromValidation,
  hasScraperChapterPagePlaceholder,
  resolveScraperChaptersSourceUrl,
} from '@/renderer/utils/scraperTemplateContext';

type Props = {
  feature: ScraperFeatureDefinition;
  onBack: () => void;
};

export default function ScraperChaptersFeatureEditor({
  feature,
  onBack,
}: Props) {
  const { scraper } = useScraperConfig();
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature]);
  const {
    formValues,
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
    createCheckboxChangeHandler,
    resetEditorState,
  } = useScraperFeatureEditorState({
    initialFormValues: initialConfig,
    initialValidationResult: feature.validation,
    initialValidatedSignature: feature.validation?.ok ? getConfigSignature(initialConfig) : null,
  });

  useEffect(() => {
    resetEditorState();
  }, [feature, resetEditorState]);

  const currentStatusMeta = FEATURE_STATUS_META[feature.status];
  const currentConfig = useMemo(() => buildChaptersConfig(formValues), [formValues]);
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
  const templateContext = useMemo<Record<string, string | undefined>>(() => (
    buildScraperTemplateContextFromValidation(detailsFeature?.validation)
  ), [detailsFeature?.validation]);
  const resolvedTestUrl = useMemo(() => {
    if (!detailsFeature?.validation?.ok || !detailsUrl) {
      return null;
    }

    try {
      return resolveScraperChaptersSourceUrl(
        scraper.baseUrl,
        currentConfig,
        templateContext,
        detailsUrl,
      );
    } catch {
      return null;
    }
  }, [currentConfig, detailsFeature?.validation?.ok, detailsUrl, scraper.baseUrl, templateContext]);
  const validationPresentation = useMemo(
    () => (validationResult ? buildValidationPresentation(validationResult) : null),
    [validationResult],
  );
  const fakePreview = useMemo(
    () => buildPreviewFromValidation(validationResult),
    [validationResult],
  );

  const handleFieldChange = useCallback((fieldName: keyof typeof initialConfig) => (
    createTextFieldChangeHandler(fieldName)
  ), [createTextFieldChangeHandler]);

  const handleCheckboxChange = useCallback((fieldName: keyof typeof initialConfig) => (
    createCheckboxChangeHandler(fieldName)
  ), [createCheckboxChangeHandler]);

  const handleValidate = useCallback(async () => {
    const config = buildChaptersConfig(formValues);
    const errors = getSaveFieldErrors(config);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setValidationUiError('Complete d\'abord les champs requis pour lancer le test.');
      return;
    }

    if (!detailsFeature?.validation?.ok) {
      setValidationUiError('Valide d\'abord le composant Fiche pour tester les chapitres.');
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      setValidationUiError('La validation des chapitres n\'est pas disponible dans cette version.');
      return;
    }

    if (!detailsUrl) {
      setValidationUiError('Impossible de determiner l\'URL de la fiche de test.');
      return;
    }

    try {
      resolveScraperChaptersSourceUrl(
        scraper.baseUrl,
        config,
        templateContext,
        detailsUrl,
      );
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : 'Impossible de construire l\'URL des chapitres.');
      return;
    }

    setValidating(true);
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const chaptersResolution = await resolveScraperChapters(
        scraper.baseUrl,
        detailsUrl,
        config,
        templateContext,
        async (request) => (window as any).api.fetchScraperDocument(request) as Promise<FetchScraperDocumentResult>,
      );
      const typedDocumentResult = chaptersResolution.sourceResult as FetchScraperDocumentResult;
      if (!typedDocumentResult.ok || !typedDocumentResult.html) {
        setValidationResult(buildDocumentFailure(typedDocumentResult));
        return;
      }

      let chaptersCheck: ScraperFeatureValidationCheck;
      let chapters: ScraperChapterItem[] = [];

      try {
        chapters = chaptersResolution.chapters;
        chaptersCheck = chapters.length > 0
          ? {
            key: 'chapters',
            selector: config.chapterItemSelector,
            required: true,
            matchedCount: chapters.length,
            sample: chapters[0].label,
            samples: chapters.slice(0, 8).map((chapter) => chapter.label),
          }
          : {
            key: 'chapters',
            selector: config.chapterItemSelector,
            required: true,
            matchedCount: 0,
            issueCode: 'no_match',
          };
      } catch {
        chaptersCheck = {
          key: 'chapters',
          selector: config.chapterItemSelector,
          required: true,
          matchedCount: 0,
          issueCode: 'invalid_selector',
        };
      }

      const nextResult: ScraperFeatureValidationResult = {
        ok: chaptersCheck.matchedCount > 0,
        checkedAt: new Date().toISOString(),
        requestedUrl: typedDocumentResult.requestedUrl,
        finalUrl: typedDocumentResult.finalUrl,
        status: typedDocumentResult.status,
        contentType: typedDocumentResult.contentType,
        checks: [chaptersCheck],
        derivedValues: [],
        chapters,
      };

      setValidationResult(nextResult);
      if (nextResult.ok) {
        setLastValidatedSignature(getConfigSignature(config));
      }
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : 'Echec de la validation des chapitres.');
    } finally {
      setValidating(false);
    }
  }, [detailsFeature, detailsUrl, formValues, scraper.baseUrl, templateContext]);

  const buildSaveConfig = useCallback(() => {
    const config = buildChaptersConfig(formValues);
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
        title="Configurer les chapitres"
        description={
          'Ce composant lit la liste des chapitres soit depuis la fiche manga validee, '
          + 'soit depuis une URL construite a partir des variables de `Fiche`.'
        }
        noteTitle="Validation basee sur la fiche"
        noteText={
          'Le test des chapitres repose sur la derniere validation reussie de `Fiche`. '
          + 'Cela permet de rejouer exactement la page manga cible et d\'alimenter les templates.'
        }
        statusClassName={currentStatusMeta.className}
        statusLabel={currentStatusMeta.label}
        onBack={onBack}
      />

      <div className="mh-form">
        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Source</h4>
            <p>Choisis si les chapitres sont extraits depuis la fiche ou depuis une URL dediee.</p>
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
            templateBaseField={TEMPLATE_BASE_FIELD}
            templateBaseValue={formValues.templateBase || 'scraper_base'}
            templateBaseError={fieldErrors.templateBase}
            onTemplateBaseChange={handleFieldChange('templateBase')}
          >
            <div className="scraper-config-hint">
              Variables disponibles depuis `Fiche` : <code>{'{{requestedUrl}}'}</code>,
              <code>{' {{finalUrl}}'}</code> et les variables extraites. Utilise
              <code>{' {{raw:nomVariable}}'}</code> pour inserer une valeur brute sans encodage.
              Si le template contient <code>{' {{chapterPage}}'}</code>, les pages de chapitres
              seront enchainees automatiquement jusqu&apos;a ce qu&apos;il n&apos;y ait plus de resultat.
            </div>
          </ScraperUrlTemplateFields>

          <ScraperTemplateContext
            templateContext={templateContext}
            emptyMessage={(
              <>
                Aucune fiche validee n&apos;est disponible pour le moment. Tu peux enregistrer la
                configuration, mais la validation des chapitres restera indisponible tant que
                `Fiche` n&apos;aura pas ete validee.
              </>
            )}
          />
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Scraping</h4>
            <p>Definis ici comment recuperer chaque chapitre et ses informations principales.</p>
          </div>

          <ScraperConfigFieldGrid
            fields={[
              CHAPTER_LIST_SELECTOR_FIELD,
              CHAPTER_ITEM_SELECTOR_FIELD,
              CHAPTER_URL_SELECTOR_FIELD,
              CHAPTER_LABEL_SELECTOR_FIELD,
              CHAPTER_IMAGE_SELECTOR_FIELD,
            ]}
            getValue={(fieldName) => formValues[fieldName as keyof typeof initialConfig] ?? ''}
            getError={(fieldName) => fieldErrors[fieldName]}
            onFieldChange={(fieldName) => handleFieldChange(fieldName as keyof typeof initialConfig)}
          />

          <ScraperConfigField
            field={REVERSE_ORDER_FIELD}
            value={Boolean(formValues.reverseOrder)}
            error={fieldErrors.reverseOrder}
            onChange={handleCheckboxChange('reverseOrder')}
          />

          <div className="scraper-config-hint">
            Active cette option si le site renvoie les chapitres du plus recent au plus ancien et
            que tu veux afficher le chapitre 1 en haut.
          </div>
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Test</h4>
            <p>Lance la validation puis verifie un apercu de la liste de chapitres detectee.</p>
          </div>

          <ScraperResolvedUrlPreview
            url={resolvedTestUrl}
            emptyMessage="Valide d'abord la fiche ou complete l'URL des chapitres."
          />

          {currentConfig.urlStrategy === 'template' && hasScraperChapterPagePlaceholder(currentConfig.urlTemplate) ? (
            <div className="scraper-config-hint">
              Apercu affiche la page <code>{'{{chapterPage}} = 1'}</code>. La validation aggregera
              ensuite toutes les pages de chapitres jusqu&apos;a ce qu&apos;une page ne retourne plus rien.
            </div>
          ) : null}

          <ScraperFeatureActions
            validating={validating}
            saving={saving}
            validateLabel="Valider les chapitres"
            onBack={onBack}
            onValidate={() => void handleValidate()}
            onSave={() => void handleSave()}
          />

          <ScraperValidationSummary
            validationResult={validationResult}
            presentation={validationPresentation}
          />

          <FakeChaptersPreview preview={fakePreview} />
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
