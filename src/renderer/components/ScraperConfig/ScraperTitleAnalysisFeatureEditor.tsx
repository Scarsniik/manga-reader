import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ScraperFeatureDefinition,
  type ScraperTitleAnalysisConfig,
} from "@/shared/scraper";
import ScraperFeatureEditorHeader from "@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorHeader";
import ScraperFeatureMessages from "@/renderer/components/ScraperConfig/shared/ScraperFeatureMessages";
import ScraperValidationSummary from "@/renderer/components/ScraperConfig/shared/ScraperValidationSummary";
import {
  type ScraperFeatureActionSurface,
  ScraperFeatureActions,
} from "@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorSections";
import { useScraperConfig } from "@/renderer/components/ScraperConfig/shared/ScraperConfigContext";
import useSaveScraperFeatureConfig from "@/renderer/components/ScraperConfig/shared/useSaveScraperFeatureConfig";
import useScraperFeatureEditorState from "@/renderer/components/ScraperConfig/shared/useScraperFeatureEditorState";
import useScraperUnsavedChangesGuard from "@/renderer/components/ScraperConfig/shared/useScraperUnsavedChangesGuard";
import TitleAnalysisSuffixMappingsEditor from "@/renderer/components/ScraperConfig/titleAnalysis/TitleAnalysisSuffixMappingsEditor";
import TitleAnalysisVariantEditor from "@/renderer/components/ScraperConfig/titleAnalysis/TitleAnalysisVariantEditor";
import TitleAnalysisTestPanel from "@/renderer/components/ScraperConfig/titleAnalysis/TitleAnalysisTestPanel";
import {
  buildTitleAnalysisValidationPresentation,
  buildTitleAnalysisValidationResult,
  analyzeTitleSamples,
  getInitialTitleAnalysisConfig,
  getTitleAnalysisConfigSignature,
} from "@/renderer/components/ScraperConfig/titleAnalysis/titleAnalysisEditor.utils";
import { FEATURE_STATUS_META } from "@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils";

type Props = {
  feature: ScraperFeatureDefinition;
  actionSurface?: ScraperFeatureActionSurface;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onBack: () => void;
};

const splitManualTitles = (value: string): string[] => (
  value
    .split(/\r?\n/g)
    .map((title) => title.trim())
    .filter(Boolean)
);

const getSaveFieldErrors = (config: ScraperTitleAnalysisConfig): Record<string, string> => {
  if (!config.enabled) {
    return {};
  }

  if (!config.variants.some((variant) => variant.enabled)) {
    return {
      variants: "Active au moins une variante.",
    };
  }

  if (!config.variants.some((variant) => (
    variant.enabled
    && variant.blocks.some((block) => block.enabled && block.kind === "title")
  ))) {
    return {
      variants: "Au moins une variante active doit contenir un bloc Titre.",
    };
  }

  return {};
};

export default function ScraperTitleAnalysisFeatureEditor({
  feature,
  actionSurface = "inline",
  onUnsavedChangesChange,
  onBack,
}: Props) {
  const { scraper } = useScraperConfig();
  const initialConfig = useMemo(() => getInitialTitleAnalysisConfig(feature.config), [feature.config]);
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
    resetEditorState,
  } = useScraperFeatureEditorState<ScraperTitleAnalysisConfig>({
    initialFormValues: initialConfig,
    initialValidationResult: feature.validation,
    initialValidatedSignature: feature.validation?.ok ? getTitleAnalysisConfigSignature(initialConfig) : null,
  });
  const [activeVariantId, setActiveVariantId] = useState<string | null>(initialConfig.variants[0]?.id ?? null);
  const [searchTestTitles, setSearchTestTitles] = useState<string[]>([]);

  useEffect(() => {
    resetEditorState();
    setActiveVariantId(initialConfig.variants[0]?.id ?? null);
    setSearchTestTitles([]);
  }, [feature, initialConfig.variants, resetEditorState]);

  const savedConfigSignature = useMemo(
    () => getTitleAnalysisConfigSignature(initialConfig),
    [initialConfig],
  );
  const currentConfigSignature = useMemo(
    () => getTitleAnalysisConfigSignature(formValues),
    [formValues],
  );
  const hasUnsavedChanges = currentConfigSignature !== savedConfigSignature;
  const { requestLeave } = useScraperUnsavedChangesGuard({ hasUnsavedChanges });
  const handleBack = useCallback(() => {
    requestLeave(onBack);
  }, [onBack, requestLeave]);

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);

    return () => {
      onUnsavedChangesChange?.(false);
    };
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  const manualTitlesText = useMemo(
    () => formValues.manualTestTitles.join("\n"),
    [formValues.manualTestTitles],
  );
  const testTitles = useMemo(() => (
    Array.from(new Set([
      ...formValues.manualTestTitles,
      ...searchTestTitles,
    ].map((title) => title.trim()).filter(Boolean)))
  ), [formValues.manualTestTitles, searchTestTitles]);
  const testResults = useMemo(
    () => analyzeTitleSamples(testTitles, formValues),
    [formValues, testTitles],
  );
  const validationPresentation = useMemo(
    () => buildTitleAnalysisValidationPresentation(validationResult, testTitles.length),
    [testTitles.length, validationResult],
  );
  const currentStatusMeta = FEATURE_STATUS_META[feature.status];

  const updateConfig = useCallback((nextConfig: ScraperTitleAnalysisConfig) => {
    setFormValues(nextConfig);
    clearFeedback();
    clearFieldError("variants");
  }, [clearFeedback, clearFieldError, setFormValues]);

  const handleManualTitlesTextChange = useCallback((value: string) => {
    updateConfig({
      ...formValues,
      manualTestTitles: splitManualTitles(value),
    });
  }, [formValues, updateConfig]);

  const handleValidate = useCallback(() => {
    const errors = getSaveFieldErrors(formValues);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setValidationUiError("Complete d'abord la configuration avant de lancer le test.");
      return;
    }

    if (!testTitles.length) {
      setValidationUiError("Ajoute au moins un titre de test ou charge des exemples depuis Recherche.");
      return;
    }

    setValidating(true);
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    const nextValidationResult = buildTitleAnalysisValidationResult(
      analyzeTitleSamples(testTitles, formValues),
    );

    setValidationResult(nextValidationResult);
    if (nextValidationResult.ok) {
      setLastValidatedSignature(getTitleAnalysisConfigSignature(formValues));
    }
    setValidating(false);
  }, [
    formValues,
    setFieldErrors,
    setLastValidatedSignature,
    setSaveError,
    setSaveMessage,
    setValidating,
    setValidationResult,
    setValidationUiError,
    testTitles,
  ]);

  const buildSaveConfig = useCallback(() => {
    const errors = getSaveFieldErrors(formValues);
    return {
      config: formValues,
      errors,
      signature: getTitleAnalysisConfigSignature(formValues),
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
        title="Configurer l'analyse des titres"
        description="Definis les variantes de format qui permettent d'extraire un titre principal et des metadonnees structurees depuis les titres du scrapper."
        noteTitle="Pas de nettoyage global"
        noteText="Ce module structure le titre. Les usages decident ensuite quoi faire des champs extraits. Pour la recherche multi-sources, seul le champ Titre est utilise."
        statusClassName={currentStatusMeta.className}
        statusLabel={currentStatusMeta.label}
        showBackButton={actionSurface !== "modal"}
        onBack={handleBack}
      />

      <div className="mh-form">
        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Activation</h4>
            <p>
              Quand le module est actif, les variantes sont testees dans l'ordre jusqu'a trouver
              un format valide. Les chapitres, parties et tomes sont detectes automatiquement dans
              le titre capture.
            </p>
          </div>

          <label className="title-analysis-toggle">
            <input
              type="checkbox"
              checked={formValues.enabled}
              onChange={(event) => updateConfig({
                ...formValues,
                enabled: event.target.checked,
              })}
              disabled={saving || validating}
            />
            <span>Activer l'analyse des titres pour ce scrapper</span>
          </label>

          {fieldErrors.variants ? (
            <div className="scraper-validation-result__message is-error">
              {fieldErrors.variants}
            </div>
          ) : null}
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Variantes de format</h4>
            <p>
              Deplace les variantes pour changer leur priorite. Dans une variante, deplace les
              blocs pour reconstruire la phrase attendue.
            </p>
          </div>

          <TitleAnalysisVariantEditor
            config={formValues}
            activeVariantId={activeVariantId}
            disabled={saving || validating}
            onActiveVariantChange={setActiveVariantId}
            onConfigChange={updateConfig}
          />
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Classification des suffixes</h4>
            <p>
              Les suffixes entre crochets en fin de titre sont classes comme langue, tag ou
              information non reconnue. Un tag final n'empeche pas de trouver une langue avant lui.
            </p>
          </div>

          <TitleAnalysisSuffixMappingsEditor
            suffixMappings={formValues.suffixMappings}
            disabled={saving || validating}
            onChange={(suffixMappings) => updateConfig({
              ...formValues,
              suffixMappings,
            })}
          />
        </div>

        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Test</h4>
            <p>
              Teste la configuration sur des titres manuels ou charge des titres depuis le
              composant Recherche s'il est configure.
            </p>
          </div>

          <TitleAnalysisTestPanel
            scraper={scraper}
            config={formValues}
            manualTitlesText={manualTitlesText}
            results={testResults}
            disabled={saving || validating}
            onManualTitlesTextChange={handleManualTitlesTextChange}
            onConfigChange={updateConfig}
            onSearchTitlesLoaded={setSearchTestTitles}
          />

          <ScraperFeatureActions
            validating={validating}
            saving={saving}
            validateLabel="Tester l'analyse"
            actionSurface={actionSurface}
            hasUnsavedChanges={hasUnsavedChanges}
            onBack={onBack}
            onValidate={handleValidate}
            onSave={handleSave}
          />

          <ScraperValidationSummary
            validationResult={validationResult}
            presentation={validationPresentation}
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
