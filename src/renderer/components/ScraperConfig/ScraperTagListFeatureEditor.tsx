import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FetchScraperDocumentResult,
  formatScraperFieldSelectorForDisplay,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationCheckKey,
  ScraperFeatureValidationResult,
  ScraperFieldSelector,
  ScraperEntityListItem,
  ScraperEntityListKind,
} from "@/shared/scraper";
import ScraperConfigField from "@/renderer/components/ScraperConfig/shared/ScraperConfigField";
import ScraperFeatureEditorHeader from "@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorHeader";
import ScraperFeatureMessages from "@/renderer/components/ScraperConfig/shared/ScraperFeatureMessages";
import ScraperValidationSummary from "@/renderer/components/ScraperConfig/shared/ScraperValidationSummary";
import {
  ScraperConfigFieldGrid,
  ScraperFeatureActionSurface,
  ScraperFeatureActions,
  ScraperResolvedUrlPreview,
} from "@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorSections";
import { useScraperConfig } from "@/renderer/components/ScraperConfig/shared/ScraperConfigContext";
import useSaveScraperFeatureConfig from "@/renderer/components/ScraperConfig/shared/useSaveScraperFeatureConfig";
import useScraperFeatureEditorState from "@/renderer/components/ScraperConfig/shared/useScraperFeatureEditorState";
import useScraperUnsavedChangesGuard from "@/renderer/components/ScraperConfig/shared/useScraperUnsavedChangesGuard";
import SelectorAssistantLauncher from "@/renderer/components/ScraperConfig/shared/SelectorAssistantLauncher";
import useSelectorAssistant from "@/renderer/components/ScraperConfig/shared/useSelectorAssistant";
import { buildSelectorAssistantFields } from "@/renderer/components/ScraperConfig/shared/selectorAssistantFields";
import TagListFeaturePreview from "@/renderer/components/ScraperConfig/tagList/TagListFeaturePreview";
import {
  buildDocumentFailure,
  buildTagListConfig,
  buildValidationPresentation,
  FEATURE_STATUS_META,
  getConfigSignature,
  getInitialConfig,
  getSaveFieldErrors,
  getValidationFieldErrors,
  getEntityListScrapingFields,
  getEntityListSourceModeField,
  getEntityListUrlTemplateField,
  TAG_LIST_FIELD_SELECTOR_NAMES,
  TagListSourceMode,
  TagListFeatureFormState,
} from "@/renderer/components/ScraperConfig/tagList/tagListFeatureEditor.utils";
import {
  extractScraperEntityListPageFromDocument,
  hasEntityListPagePlaceholder,
  resolveScraperEntityListTargetUrl,
  ScraperRuntimeTagListPageResult,
} from "@/renderer/utils/scraperRuntime";

type Props = {
  feature: ScraperFeatureDefinition;
  entityKind: ScraperEntityListKind;
  actionSurface?: ScraperFeatureActionSurface;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onBack: () => void;
};

type FormValueRecord = Record<string, string | boolean | ScraperFieldSelector | undefined>;

const getFormValueRecord = (values: TagListFeatureFormState): FormValueRecord => (
  values as unknown as FormValueRecord
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
      selector: typeof selector === "string" ? selector : formatScraperFieldSelectorForDisplay(selector),
      required,
      matchedCount: samples.length,
      sample: samples[0],
      samples: samples.slice(0, 12),
    }
    : {
      key,
      selector: typeof selector === "string" ? selector : formatScraperFieldSelectorForDisplay(selector),
      required,
      matchedCount: 0,
      issueCode: "no_match",
    }
);

const getNextPaginationPreviewUrl = (
  page: ScraperRuntimeTagListPageResult,
  visitedPageUrls: string[],
): string | undefined => (
  page.nextPageUrl
  || page.paginationUrls.find((url) => !visitedPageUrls.includes(url))
);

const buildAutoCollectionValidation = (): ScraperFeatureValidationResult => ({
  ok: true,
  checkedAt: new Date().toISOString(),
  checks: [],
  derivedValues: [],
});

export default function ScraperEntityListFeatureEditor({
  feature,
  entityKind,
  actionSurface = "inline",
  onUnsavedChangesChange,
  onBack,
}: Props) {
  const { scraper } = useScraperConfig();
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature]);
  const [previewPage, setPreviewPage] = useState<ScraperRuntimeTagListPageResult | null>(null);
  const [previewVisitedPageUrls, setPreviewVisitedPageUrls] = useState<string[]>([]);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewTags, setPreviewTags] = useState<ScraperEntityListItem[]>([]);
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
    clearFieldFeedback,
    createTextFieldChangeHandler,
    resetEditorState,
  } = useScraperFeatureEditorState<TagListFeatureFormState>({
    initialFormValues: initialConfig,
    initialValidationResult: feature.validation,
    initialValidatedSignature: feature.validation?.ok ? getConfigSignature(buildTagListConfig(initialConfig)) : null,
  });

  useEffect(() => {
    resetEditorState();
    setPreviewPage(null);
    setPreviewVisitedPageUrls([]);
    setPreviewPageIndex(0);
    setPreviewTags([]);
  }, [feature, resetEditorState]);

  const currentStatusMeta = FEATURE_STATUS_META[feature.status];
  const currentConfig = useMemo(() => buildTagListConfig(formValues), [formValues]);
  const savedConfigSignature = useMemo(
    () => getConfigSignature(buildTagListConfig(initialConfig)),
    [initialConfig],
  );
  const currentConfigSignature = useMemo(
    () => getConfigSignature(currentConfig),
    [currentConfig],
  );
  const hasUnsavedChanges = currentConfigSignature !== savedConfigSignature;
  const { requestLeave } = useScraperUnsavedChangesGuard({ hasUnsavedChanges });
  const usesTemplatePaging = hasEntityListPagePlaceholder(currentConfig);
  const tagListSourceMode: TagListSourceMode = formValues.collectFromDetails === true ? "collect" : "scrape";
  const isAutoCollectionMode = tagListSourceMode === "collect";
  const entityLabel = entityKind === "author" ? "auteur" : "tag";
  const entityPluralLabel = entityKind === "author" ? "auteurs" : "tags";
  const entityListLabel = entityKind === "author" ? "liste d'auteurs" : "liste de tags";
  const scrapingFields = useMemo(() => getEntityListScrapingFields(entityKind), [entityKind]);
  const sourceModeField = useMemo(() => getEntityListSourceModeField(entityKind), [entityKind]);
  const urlTemplateField = useMemo(() => getEntityListUrlTemplateField(entityKind), [entityKind]);

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);

    return () => {
      onUnsavedChangesChange?.(false);
    };
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  const resolvedTestUrl = useMemo(() => {
    if (!currentConfig.urlTemplate.trim()) {
      return null;
    }

    try {
      return resolveScraperEntityListTargetUrl(scraper.baseUrl, currentConfig, {
        pageIndex: 0,
      });
    } catch {
      return null;
    }
  }, [currentConfig, scraper.baseUrl]);

  const validationPresentation = useMemo(
    () => validationResult
      ? buildValidationPresentation(validationResult, previewTags, previewPage, entityKind)
      : null,
    [previewPage, previewTags, validationResult],
  );

  const previewItems = useMemo(() => previewTags.slice(0, 24), [previewTags]);

  const fetchPreviewPage = useCallback(async (
    targetUrl: string,
    config: TagListFeatureFormState = currentConfig,
  ): Promise<ScraperRuntimeTagListPageResult> => {
    const documentResult = await (window as any).api.fetchScraperDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    const typedDocumentResult = documentResult as FetchScraperDocumentResult;
    if (!typedDocumentResult.ok || !typedDocumentResult.html) {
      throw new Error(
        typedDocumentResult.error
          || (typeof typedDocumentResult.status === "number"
            ? `La ${entityListLabel} a repondu avec le code HTTP ${typedDocumentResult.status}.`
            : `Impossible de charger la ${entityListLabel}.`),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(typedDocumentResult.html, "text/html");
    return extractScraperEntityListPageFromDocument(documentNode, config, {
      requestedUrl: typedDocumentResult.requestedUrl,
      finalUrl: typedDocumentResult.finalUrl,
    });
  }, [currentConfig, entityListLabel, scraper.baseUrl]);

  const handleBack = useCallback(() => {
    requestLeave(onBack);
  }, [onBack, requestLeave]);

  const handleFieldChange = useCallback((fieldName: keyof TagListFeatureFormState & string) => (
    createTextFieldChangeHandler(fieldName)
  ), [createTextFieldChangeHandler]);

  const handleSourceModeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const collectFromDetails = event.currentTarget.value === "collect";

    setFormValues((previous) => ({
      ...previous,
      collectFromDetails,
    }));
    setFieldErrors({});
    setValidationUiError(null);
    setSaveError(null);
    setSaveMessage(null);

    if (collectFromDetails) {
      setPreviewPage(null);
      setPreviewVisitedPageUrls([]);
      setPreviewPageIndex(0);
      setPreviewTags([]);
    }
  }, [
    setFieldErrors,
    setFormValues,
    setPreviewPage,
    setPreviewTags,
    setPreviewVisitedPageUrls,
    setSaveError,
    setSaveMessage,
    setValidationUiError,
  ]);

  const handleFieldSelectorChange = useCallback((fieldName: keyof TagListFeatureFormState & string) => (
    nextValue: ScraperFieldSelector,
  ) => {
    setFormValues((previous) => ({
      ...previous,
      [fieldName]: nextValue,
    }));
    clearFieldFeedback(fieldName);
  }, [clearFieldFeedback, setFormValues]);

  const selectorAssistantFields = useMemo(() => buildSelectorAssistantFields({
    fields: scrapingFields,
    valueFieldNames: TAG_LIST_FIELD_SELECTOR_NAMES,
    values: getFormValueRecord(formValues),
    scopeByFieldName: {
      itemSelector: "listSelector",
      nameSelector: "itemSelector",
      urlSelector: "itemSelector",
      countSelector: "itemSelector",
    },
    valueModeByFieldName: {
      urlSelector: "url",
      nextPageSelector: "url",
      paginationLinkSelector: "url",
    },
  }), [formValues, scrapingFields]);
  const handleSelectorAssistantApply = useCallback((fieldName: string, selector: string) => {
    if ((TAG_LIST_FIELD_SELECTOR_NAMES as readonly string[]).includes(fieldName)) {
      handleFieldSelectorChange(fieldName as keyof TagListFeatureFormState & string)(
        { kind: "css", value: selector },
      );
      return;
    }
    setFormValues((previous) => ({ ...previous, [fieldName]: selector }));
    clearFieldFeedback(fieldName);
  }, [clearFieldFeedback, handleFieldSelectorChange, setFormValues]);
  const selectorAssistant = useSelectorAssistant({
    request: !isAutoCollectionMode
      ? {
        scraperName: scraper.name,
        featureKind: feature.kind,
        featureLabel: `Configurer la ${entityListLabel}`,
        pageRequest: {
          baseUrl: scraper.baseUrl,
          targetUrl: resolvedTestUrl || scraper.baseUrl,
        },
        fields: selectorAssistantFields,
        urlPattern: {
          fieldName: "urlTemplate",
          label: `Pattern d'URL de la ${entityListLabel}`,
          value: formValues.urlTemplate,
        },
      }
      : null,
    onApply: handleSelectorAssistantApply,
  });

  const handleValidate = useCallback(async () => {
    const config = buildTagListConfig(formValues);

    if (config.collectFromDetails === true) {
      setValidationUiError("Le mode auto n'a pas de test manuel.");
      return;
    }

    const errors = getValidationFieldErrors(config, entityKind);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setValidationUiError("Complete d'abord les champs requis pour lancer le test.");
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== "function") {
      setValidationUiError(`La validation de la ${entityListLabel} n'est pas disponible dans cette version.`);
      return;
    }

    let targetUrl = "";
    try {
      targetUrl = resolveScraperEntityListTargetUrl(scraper.baseUrl, config, {
        pageIndex: 0,
      });
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : `Impossible de construire l'URL de la ${entityListLabel}.`);
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
        setPreviewTags([]);
        setValidationResult(buildDocumentFailure(typedDocumentResult));
        return;
      }

      const parser = new DOMParser();
      const documentNode = parser.parseFromString(typedDocumentResult.html, "text/html");
      const extractedPage = extractScraperEntityListPageFromDocument(documentNode, config, {
        requestedUrl: typedDocumentResult.requestedUrl,
        finalUrl: typedDocumentResult.finalUrl,
      });
      const extractedTags = extractedPage.items;
      const tagNames = extractedTags.map((tag) => tag.name).filter(Boolean);
      const tagUrls = extractedTags.map((tag) => tag.url).filter(Boolean) as string[];
      const tagCounts = extractedTags.map((tag) => tag.count).filter(Boolean) as string[];
      const paginationUrls = [
        ...extractedPage.paginationUrls,
        ...(extractedPage.nextPageUrl ? [extractedPage.nextPageUrl] : []),
      ];

      const checks: ScraperFeatureValidationCheck[] = [
        buildSelectorCheck(entityKind === "author" ? "authors" : "tags", config.nameSelector, true, tagNames),
        ...(config.urlSelector
          ? [buildSelectorCheck(entityKind === "author" ? "authorUrl" : "tagUrl", config.urlSelector, false, tagUrls)]
          : []),
        ...(config.countSelector
          ? [buildSelectorCheck("pageCount", config.countSelector, false, tagCounts)]
          : []),
        ...(config.nextPageSelector || config.paginationLinkSelector
          ? [buildSelectorCheck(
            "pages",
            [
              config.nextPageSelector ? formatScraperFieldSelectorForDisplay(config.nextPageSelector) : "",
              config.paginationLinkSelector ? formatScraperFieldSelectorForDisplay(config.paginationLinkSelector) : "",
            ].filter(Boolean).join(" / "),
            false,
            paginationUrls,
          )]
          : []),
      ];

      const nextResult: ScraperFeatureValidationResult = {
        ok: tagNames.length > 0,
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
      setPreviewTags(extractedTags);
      setValidationResult(nextResult);
      if (nextResult.ok) {
        setLastValidatedSignature(getConfigSignature(config));
      }
    } catch (error) {
      setPreviewPage(null);
      setPreviewVisitedPageUrls([]);
      setPreviewPageIndex(0);
      setPreviewTags([]);
      setValidationUiError(error instanceof Error ? error.message : `Echec de la validation de la ${entityListLabel}.`);
    } finally {
      setValidating(false);
    }
  }, [
    formValues,
    scraper.baseUrl,
    setFieldErrors,
    setLastValidatedSignature,
    setPreviewPage,
    setPreviewTags,
    setPreviewVisitedPageUrls,
    setValidationResult,
    setValidationUiError,
    setValidating,
    setSaveError,
    setSaveMessage,
  ]);

  const handlePreviewNextPage = useCallback(async () => {
    if (!previewPage) {
      return;
    }

    const nextPageIndex = previewPageIndex + 1;
    const nextTargetUrl = usesTemplatePaging
      ? resolveScraperEntityListTargetUrl(scraper.baseUrl, currentConfig, {
        pageIndex: nextPageIndex,
      })
      : getNextPaginationPreviewUrl(previewPage, previewVisitedPageUrls);

    if (!nextTargetUrl) {
      return;
    }

    setValidating(true);
    setValidationUiError(null);

    try {
      const nextPage = await fetchPreviewPage(nextTargetUrl);
      if (!nextPage.items.length) {
        setValidationUiError(`Aucun ${entityLabel} exploitable n'a ete trouve sur la page suivante.`);
        return;
      }

      setPreviewPage(nextPage);
      setPreviewTags(nextPage.items);
      setPreviewVisitedPageUrls((previous) => {
        const trimmedHistory = previous.slice(0, previewPageIndex + 1);
        return [...trimmedHistory, nextPage.currentPageUrl];
      });
      setPreviewPageIndex(nextPageIndex);
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : "Impossible de charger la page suivante.");
    } finally {
      setValidating(false);
    }
  }, [
    currentConfig,
    fetchPreviewPage,
    previewPage,
    previewPageIndex,
    previewVisitedPageUrls,
    scraper.baseUrl,
    setValidating,
    setValidationUiError,
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
      setPreviewTags(previousPage.items);
      setPreviewPageIndex((previous) => Math.max(0, previous - 1));
      setPreviewVisitedPageUrls((currentHistory) => {
        const nextHistory = [...currentHistory];
        nextHistory[previewPageIndex - 1] = previousPage.currentPageUrl;
        return nextHistory;
      });
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : "Impossible de revenir a la page precedente.");
    } finally {
      setValidating(false);
    }
  }, [fetchPreviewPage, previewPageIndex, previewVisitedPageUrls, setValidating, setValidationUiError]);

  const buildSaveConfig = useCallback(() => {
    const config = buildTagListConfig(formValues);
    return {
      config,
      errors: getSaveFieldErrors(config, entityKind),
      signature: getConfigSignature(config),
    };
  }, [formValues]);

  const getValidationForSave = useCallback(({
    config,
  }: {
    config: ReturnType<typeof buildTagListConfig>;
  }): ScraperFeatureValidationResult | null | undefined => (
    config.collectFromDetails === true
      ? buildAutoCollectionValidation()
      : undefined
  ), []);

  const handleSave = useSaveScraperFeatureConfig({
    featureKind: feature.kind,
    validationResult,
    lastValidatedSignature,
    buildSaveConfig,
    getValidationForSave,
    setFieldErrors,
    setSaving,
    setSaveError,
    setSaveMessage,
  });

  return (
    <section className="scraper-config-step">
      <ScraperFeatureEditorHeader
        title={`Configurer la ${entityListLabel}`}
        description={`Choisis si les ${entityPluralLabel} viennent d'une page de liste scrapee ou des ${entityPluralLabel} rencontres automatiquement dans les fiches.`}
        noteTitle={isAutoCollectionMode ? "Alimentation depuis les fiches" : "Pagination complete"}
        noteText={isAutoCollectionMode
          ? `Quand une fiche est ouverte, ses ${entityPluralLabel} sont ajoutes au cache sans doublons. Le bouton de scraping manuel est masque cote navigateur.`
          : "La sauvegarde runtime parcourt toutes les pages detectables via le template, le lien suivant et les liens de pagination ou de lettres."}
        statusClassName={currentStatusMeta.className}
        statusLabel={currentStatusMeta.label}
        showBackButton={actionSurface !== "modal"}
        onBack={handleBack}
      />

      <div className="mh-form">
        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>Mode d'alimentation</h4>
            <p>
              Selectionne comment le cache de {entityPluralLabel} de ce scrapper doit etre rempli.
            </p>
          </div>

          <ScraperConfigField
            field={sourceModeField}
            value={tagListSourceMode}
            error={fieldErrors.tagListSourceMode}
            onChange={handleSourceModeChange}
          />
        </div>

        {isAutoCollectionMode ? (
          <ScraperFeatureActions
            validating={validating}
            saving={saving}
            validateLabel={`Valider la ${entityListLabel}`}
            showValidate={false}
            actionSurface={actionSurface}
            hasUnsavedChanges={hasUnsavedChanges}
            onBack={onBack}
            onValidate={() => undefined}
            onSave={handleSave}
          />
        ) : (
          <>
            <div className="scraper-config-section">
              <div className="scraper-config-section__header">
                <h4>URL de liste</h4>
                <p>
                  Indique la page d&apos;entree de la {entityListLabel}. Si la pagination est numerique,
                  ajoute un placeholder comme <code>{"{{page}}"}</code>.
                </p>
              </div>

              <div className="scraper-config-section__grid">
                <ScraperConfigField
                  field={urlTemplateField}
                  value={formValues.urlTemplate}
                  error={fieldErrors.urlTemplate}
                  onChange={handleFieldChange("urlTemplate")}
                />
              </div>

              <div className="scraper-config-hint">
                Placeholders supportes : <code>{"{{page}}"}</code>, <code>{"{{page3}}"}</code>,
                <code>{" {{pageIndex}}"}</code>. Les placeholders de recherche sont aussi acceptes,
                mais resolus avec une valeur vide.
              </div>
            </div>

            <div className="scraper-config-section">
              <div className="scraper-config-section__header">
                <h4>Scraping</h4>
                <p>
                  Definis les selecteurs pour extraire le nom, le lien et le compteur de chaque {entityLabel}.
                </p>
              </div>

              <SelectorAssistantLauncher
                opening={selectorAssistant.opening}
                error={selectorAssistant.error}
                disabled={validating || saving}
                onOpen={() => void selectorAssistant.open()}
              />

              <ScraperConfigFieldGrid
                fields={scrapingFields}
                fieldSelectorNames={TAG_LIST_FIELD_SELECTOR_NAMES}
                getValue={(fieldName) => getFormValueRecord(formValues)[fieldName]}
                getError={(fieldName) => fieldErrors[fieldName]}
                onFieldChange={(fieldName) => handleFieldChange(fieldName as keyof TagListFeatureFormState & string)}
                onFieldSelectorChange={(fieldName) => (
                  handleFieldSelectorChange(fieldName as keyof TagListFeatureFormState & string)
                )}
              />
            </div>

            <div className="scraper-config-section">
              <div className="scraper-config-section__header">
                <h4>Test</h4>
                <p>
                  Charge la premiere page de liste puis verifie les {entityPluralLabel} et les liens de pagination detectes.
                </p>
              </div>

              <ScraperResolvedUrlPreview
                url={resolvedTestUrl}
                emptyMessage="Complete l'URL de liste pour voir l'apercu."
              />

              <ScraperFeatureActions
                validating={validating}
                saving={saving}
                validateLabel={`Valider la ${entityListLabel}`}
                actionSurface={actionSurface}
                hasUnsavedChanges={hasUnsavedChanges}
                onBack={onBack}
                onValidate={() => void handleValidate()}
                onSave={handleSave}
              />

              <ScraperValidationSummary
                validationResult={validationResult}
                presentation={validationPresentation}
              />

              <TagListFeaturePreview
                entityKind={entityKind}
                previewItems={previewItems}
                previewPage={previewPage}
                previewPageIndex={previewPageIndex}
                usesTemplatePaging={usesTemplatePaging}
                validating={validating}
                onPreviousPage={() => void handlePreviewPreviousPage()}
                onNextPage={() => void handlePreviewNextPage()}
              />
            </div>
          </>
        )}
      </div>

      <ScraperFeatureMessages
        validationUiError={validationUiError}
        saveMessage={saveMessage}
        saveError={saveError}
      />
    </section>
  );
}
