import React from "react";
import type {
  ScraperFeatureDefinition,
  ScraperSourceFeatureConfig,
} from "@/shared/scraper";
import ScraperListingFeatureEditor from "@/renderer/components/ScraperConfig/shared/ScraperListingFeatureEditor";
import type { ScraperFeatureActionSurface } from "@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorSections";
import {
  hasSourcePagePlaceholder,
  resolveScraperSourceTargetUrl,
} from "@/renderer/utils/scraperRuntime";
import {
  buildDocumentFailure,
  buildSourceConfig,
  buildSourceScrapingFields,
  buildValidationPresentation,
  getConfigSignature,
  getInitialConfig,
  getSaveFieldErrors,
  getValidationFieldErrors,
  SCRAPING_FIELD_SELECTOR_NAMES,
  SCRAPING_FIELDS,
  SOURCE_NAME_SELECTOR_FIELD,
  SOURCE_SCRAPING_FIELD_NAMES,
  TEST_URL_FIELD,
  TEST_VALUE_FIELD,
  URL_STRATEGY_FIELD,
  URL_TEMPLATE_FIELD,
} from "@/renderer/components/ScraperConfig/source/sourceFeatureEditor.utils";

type Props = {
  feature: ScraperFeatureDefinition;
  actionSurface?: ScraperFeatureActionSurface;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onBack: () => void;
};

export default function ScraperSourceFeatureEditor({
  feature,
  actionSurface = "inline",
  onUnsavedChangesChange,
  onBack,
}: Props) {
  return (
    <ScraperListingFeatureEditor<ScraperSourceFeatureConfig>
      feature={feature}
      onBack={onBack}
      actionSurface={actionSurface}
      onUnsavedChangesChange={onUnsavedChangesChange}
      getInitialConfig={getInitialConfig}
      buildConfig={buildSourceConfig}
      buildScrapingFields={buildSourceScrapingFields}
      getConfigSignature={getConfigSignature}
      getSaveFieldErrors={getSaveFieldErrors}
      getValidationFieldErrors={getValidationFieldErrors}
      buildDocumentFailure={buildDocumentFailure}
      buildValidationPresentation={buildValidationPresentation}
      hasPagePlaceholder={hasSourcePagePlaceholder}
      resolveTargetUrl={(baseUrl, config, valueOrUrl, options) => resolveScraperSourceTargetUrl(
        baseUrl,
        config,
        valueOrUrl,
        { pageIndex: options.pageIndex },
      )}
      getListingNames={(previewPage) => previewPage.listingNames ?? []}
      listingNameSelectorFieldName="sourceNameSelector"
      listingNameSelectorField={SOURCE_NAME_SELECTOR_FIELD}
      listingNameCheckKey="sources"
      scrapingFieldNames={SOURCE_SCRAPING_FIELD_NAMES}
      scrapingFields={SCRAPING_FIELDS}
      scrapingFieldSelectorNames={SCRAPING_FIELD_SELECTOR_NAMES}
      urlStrategyField={URL_STRATEGY_FIELD}
      urlTemplateField={URL_TEMPLATE_FIELD}
      testUrlField={TEST_URL_FIELD}
      testValueField={TEST_VALUE_FIELD}
      texts={{
        listingLabel: "source",
        headerTitle: "Configurer la page source",
        headerDescription: "La page source ouvre l'oeuvre d'origine d'un doujin et parse les cards associees.",
        noteTitle: "Connexion avec les cards et la fiche",
        noteText: (
          "Les liens extraits par le selecteur de source sur les cards ou la fiche ouvrent ce composant. "
          + "Les selecteurs de resultats suivent le meme modele que Recherche et Tag."
        ),
        urlDescription: "Definis comment ouvrir une page source depuis un lien, un nom ou un slug.",
        scrapingDescription: "Definis les selecteurs des cards retournees par la page source.",
        templateHint: (
          <>
            Placeholders supportes : <code>{"{{value}}"}</code>, <code>{"{{rawValue}}"}</code>,
            <code>{" {{query}}"}</code>, <code>{"{{rawQuery}}"}</code>, ainsi que
            <code>{" {{page}}"}</code>, <code>{"{{page3}}"}</code> et <code>{"{{pageIndex}}"}</code>.
          </>
        ),
        testDescription: "Charge une page source de test puis verifie les cards extraites.",
        validateLabel: "Valider la page source",
      }}
    />
  );
}
