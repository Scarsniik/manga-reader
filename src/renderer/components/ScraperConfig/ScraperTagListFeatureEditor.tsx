import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FetchScraperDocumentResult,
  formatScraperFieldSelectorForDisplay,
  ScraperFeatureDefinition,
  ScraperFeatureValidationCheck,
  ScraperFeatureValidationCheckKey,
  ScraperFeatureValidationResult,
  ScraperFieldSelector,
  ScraperTagListItem,
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
  SCRAPING_FIELDS,
  TAG_LIST_FIELD_SELECTOR_NAMES,
  TagListFeatureFormState,
  URL_TEMPLATE_FIELD,
} from "@/renderer/components/ScraperConfig/tagList/tagListFeatureEditor.utils";
import {
  extractScraperTagListPageFromDocument,
  hasTagListPagePlaceholder,
  resolveScraperTagListTargetUrl,
  ScraperRuntimeTagListPageResult,
} from "@/renderer/utils/scraperRuntime";

type Props = {
  feature: ScraperFeatureDefinition;
  actionSurface?: ScraperFeatureActionSurface;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onBack: () => void;
};

type FormValueRecord = Record<string, string | ScraperFieldSelector | undefined>;

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

export default function ScraperTagListFeatureEditor({
  feature,
  actionSurface = "inline",
  onUnsavedChangesChange,
  onBack,
}: Props) {
  const { scraper } = useScraperConfig();
  const initialConfig = useMemo(() => getInitialConfig(feature), [feature]);
  const [previewPage, setPreviewPage] = useState<ScraperRuntimeTagListPageResult | null>(null);
  const [previewVisitedPageUrls, setPreviewVisitedPageUrls] = useState<string[]>([]);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewTags, setPreviewTags] = useState<ScraperTagListItem[]>([]);
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
  const usesTemplatePaging = hasTagListPagePlaceholder(currentConfig);

  useEffect(() => {
    onUnsavedChangesChange?.(hasUnsavedChanges);

    return () => {
      onUnsavedChangesChange?.(false);
    };
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  const resolvedTestUrl = useMemo(() => {
    try {
      return resolveScraperTagListTargetUrl(scraper.baseUrl, currentConfig, {
        pageIndex: 0,
      });
    } catch {
      return null;
    }
  }, [currentConfig, scraper.baseUrl]);

  const validationPresentation = useMemo(
    () => validationResult
      ? buildValidationPresentation(validationResult, previewTags, previewPage)
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
            ? `La liste de tags a repondu avec le code HTTP ${typedDocumentResult.status}.`
            : "Impossible de charger la liste de tags."),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(typedDocumentResult.html, "text/html");
    return extractScraperTagListPageFromDocument(documentNode, config, {
      requestedUrl: typedDocumentResult.requestedUrl,
      finalUrl: typedDocumentResult.finalUrl,
    });
  }, [currentConfig, scraper.baseUrl]);

  const handleBack = useCallback(() => {
    requestLeave(onBack);
  }, [onBack, requestLeave]);

  const handleFieldChange = useCallback((fieldName: keyof TagListFeatureFormState & string) => (
    createTextFieldChangeHandler(fieldName)
  ), [createTextFieldChangeHandler]);

  const handleFieldSelectorChange = useCallback((fieldName: keyof TagListFeatureFormState & string) => (
    nextValue: ScraperFieldSelector,
  ) => {
    setFormValues((previous) => ({
      ...previous,
      [fieldName]: nextValue,
    }));
    clearFieldFeedback(fieldName);
  }, [clearFieldFeedback, setFormValues]);

  const handleValidate = useCallback(async () => {
    const config = buildTagListConfig(formValues);
    const errors = getValidationFieldErrors(config);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setValidationUiError("Complete d'abord les champs requis pour lancer le test.");
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== "function") {
      setValidationUiError("La validation de la liste de tags n'est pas disponible dans cette version.");
      return;
    }

    let targetUrl = "";
    try {
      targetUrl = resolveScraperTagListTargetUrl(scraper.baseUrl, config, {
        pageIndex: 0,
      });
    } catch (error) {
      setValidationUiError(error instanceof Error ? error.message : "Impossible de construire l'URL de liste de tags.");
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
      const extractedPage = extractScraperTagListPageFromDocument(documentNode, config, {
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
        buildSelectorCheck("tags", config.tagNameSelector, true, tagNames),
        ...(config.tagUrlSelector
          ? [buildSelectorCheck("tagUrl", config.tagUrlSelector, false, tagUrls)]
          : []),
        ...(config.tagCountSelector
          ? [buildSelectorCheck("pageCount", config.tagCountSelector, false, tagCounts)]
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
      setValidationUiError(error instanceof Error ? error.message : "Echec de la validation de la liste de tags.");
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
      ? resolveScraperTagListTargetUrl(scraper.baseUrl, currentConfig, {
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
        setValidationUiError("Aucun tag exploitable n'a ete trouve sur la page suivante.");
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
        title="Configurer la liste de tags"
        description="Definis comment charger une page qui expose les tags disponibles sur la source, puis comment extraire chaque tag."
        noteTitle="Pagination complete"
        noteText="La sauvegarde runtime parcourt toutes les pages detectables via le template, le lien suivant et les liens de pagination ou de lettres."
        statusClassName={currentStatusMeta.className}
        statusLabel={currentStatusMeta.label}
        showBackButton={actionSurface !== "modal"}
        onBack={handleBack}
      />

      <div className="mh-form">
        <div className="scraper-config-section">
          <div className="scraper-config-section__header">
            <h4>URL de liste</h4>
            <p>
              Indique la page d&apos;entree de la liste de tags. Si la pagination est numerique,
              ajoute un placeholder comme <code>{"{{page}}"}</code>.
            </p>
          </div>

          <div className="scraper-config-section__grid">
            <ScraperConfigField
              field={URL_TEMPLATE_FIELD}
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
              Definis les selecteurs pour extraire le nom, le lien et le compteur de chaque tag.
            </p>
          </div>

          <ScraperConfigFieldGrid
            fields={SCRAPING_FIELDS}
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
              Charge la premiere page de liste puis verifie les tags et les liens de pagination detectes.
            </p>
          </div>

          <ScraperResolvedUrlPreview
            url={resolvedTestUrl}
            emptyMessage="Complete l'URL de liste pour voir l'apercu."
          />

          <ScraperFeatureActions
            validating={validating}
            saving={saving}
            validateLabel="Valider la liste de tags"
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
            previewTags={previewItems}
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
