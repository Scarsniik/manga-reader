import React from 'react';
import {
  ScraperFeatureDefinition,
  ScraperTagFeatureConfig,
} from '@/shared/scraper';
import ScraperListingFeatureEditor from '@/renderer/components/ScraperConfig/shared/ScraperListingFeatureEditor';
import { ScraperFeatureActionSurface } from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorSections';
import {
  hasTagPagePlaceholder,
  resolveScraperTagTargetUrl,
} from '@/renderer/utils/scraperRuntime';
import {
  buildDocumentFailure,
  buildTagConfig,
  buildTagScrapingFields,
  buildValidationPresentation,
  getConfigSignature,
  getInitialConfig,
  getSaveFieldErrors,
  getValidationFieldErrors,
  SCRAPING_FIELD_SELECTOR_NAMES,
  SCRAPING_FIELDS,
  TAG_NAME_SELECTOR_FIELD,
  TAG_SCRAPING_FIELD_NAMES,
  TEST_URL_FIELD,
  TEST_VALUE_FIELD,
  URL_STRATEGY_FIELD,
  URL_TEMPLATE_FIELD,
} from '@/renderer/components/ScraperConfig/tag/tagFeatureEditor.utils';

type Props = {
  feature: ScraperFeatureDefinition;
  actionSurface?: ScraperFeatureActionSurface;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onBack: () => void;
};

export default function ScraperTagFeatureEditor({
  feature,
  actionSurface = 'inline',
  onUnsavedChangesChange,
  onBack,
}: Props) {
  return (
    <ScraperListingFeatureEditor<ScraperTagFeatureConfig>
      feature={feature}
      onBack={onBack}
      actionSurface={actionSurface}
      onUnsavedChangesChange={onUnsavedChangesChange}
      getInitialConfig={getInitialConfig}
      buildConfig={buildTagConfig}
      buildScrapingFields={buildTagScrapingFields}
      getConfigSignature={getConfigSignature}
      getSaveFieldErrors={getSaveFieldErrors}
      getValidationFieldErrors={getValidationFieldErrors}
      buildDocumentFailure={buildDocumentFailure}
      buildValidationPresentation={buildValidationPresentation}
      hasPagePlaceholder={hasTagPagePlaceholder}
      resolveTargetUrl={(baseUrl, config, valueOrUrl, options) => resolveScraperTagTargetUrl(
        baseUrl,
        config,
        valueOrUrl,
        {
          pageIndex: options.pageIndex,
        },
      )}
      getListingNames={(previewPage) => previewPage.listingNames ?? []}
      listingNameSelectorFieldName="tagNameSelector"
      listingNameSelectorField={TAG_NAME_SELECTOR_FIELD}
      listingNameCheckKey="tags"
      scrapingFieldNames={TAG_SCRAPING_FIELD_NAMES}
      scrapingFields={SCRAPING_FIELDS}
      scrapingFieldSelectorNames={SCRAPING_FIELD_SELECTOR_NAMES}
      urlStrategyField={URL_STRATEGY_FIELD}
      urlTemplateField={URL_TEMPLATE_FIELD}
      testUrlField={TEST_URL_FIELD}
      testValueField={TEST_VALUE_FIELD}
      texts={{
        listingLabel: 'tag',
        headerTitle: 'Configurer la page tag',
        headerDescription: 'La page tag construit une URL depuis un tag ou une URL connue, puis parse une liste de cards comme la recherche.',
        noteTitle: 'Connexion avec Recherche',
        noteText: (
          'Le composant `Tag` reutilise le meme modele de cards que `Recherche`. '
          + 'Tu peux copier les selecteurs de recherche et ajuster uniquement ce qui differe sur les pages tag.'
        ),
        urlDescription: (
          'Definis comment l\'application saura ouvrir une page tag depuis une URL directe '
          + 'ou a partir d\'un nom / slug.'
        ),
        scrapingDescription: (
          'Definis les selecteurs qui permettent d\'extraire la liste de cards retournee par la page tag.'
        ),
        templateHint: (
          <>
            Placeholders supportes : <code>{'{{value}}'}</code>, <code>{'{{rawValue}}'}</code>,
            <code>{' {{query}}'}</code>, <code>{'{{rawQuery}}'}</code>, ainsi que les variantes
            de pagination <code>{'{{page}}'}</code>, <code>{'{{page3}}'}</code> et
            <code>{' {{pageIndex}}'}</code>.
          </>
        ),
        testDescription: 'Charge une page tag de test puis verifie l\'apercu des cards extraites.',
        validateLabel: 'Valider la page tag',
      }}
    />
  );
}
