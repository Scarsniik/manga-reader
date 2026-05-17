import React from 'react';
import {
  ScraperAuthorFeatureConfig,
  ScraperFeatureDefinition,
} from '@/shared/scraper';
import ScraperListingFeatureEditor from '@/renderer/components/ScraperConfig/shared/ScraperListingFeatureEditor';
import { ScraperFeatureActionSurface } from '@/renderer/components/ScraperConfig/shared/ScraperFeatureEditorSections';
import {
  hasAuthorPagePlaceholder,
  resolveScraperAuthorTargetUrl,
} from '@/renderer/utils/scraperRuntime';
import {
  AUTHOR_NAME_SELECTOR_FIELD,
  AUTHOR_SCRAPING_FIELD_NAMES,
  buildAuthorConfig,
  buildAuthorScrapingFields,
  buildDocumentFailure,
  buildValidationPresentation,
  getConfigSignature,
  getInitialConfig,
  getSaveFieldErrors,
  getValidationFieldErrors,
  SCRAPING_FIELD_SELECTOR_NAMES,
  SCRAPING_FIELDS,
  TEST_URL_FIELD,
  TEST_VALUE_FIELD,
  URL_STRATEGY_FIELD,
  URL_TEMPLATE_FIELD,
} from '@/renderer/components/ScraperConfig/author/authorFeatureEditor.utils';

type Props = {
  feature: ScraperFeatureDefinition;
  actionSurface?: ScraperFeatureActionSurface;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  onBack: () => void;
};

export default function ScraperAuthorFeatureEditor({
  feature,
  actionSurface = 'inline',
  onUnsavedChangesChange,
  onBack,
}: Props) {
  return (
    <ScraperListingFeatureEditor<ScraperAuthorFeatureConfig>
      feature={feature}
      onBack={onBack}
      actionSurface={actionSurface}
      onUnsavedChangesChange={onUnsavedChangesChange}
      getInitialConfig={getInitialConfig}
      buildConfig={buildAuthorConfig}
      buildScrapingFields={buildAuthorScrapingFields}
      getConfigSignature={getConfigSignature}
      getSaveFieldErrors={getSaveFieldErrors}
      getValidationFieldErrors={getValidationFieldErrors}
      buildDocumentFailure={buildDocumentFailure}
      buildValidationPresentation={buildValidationPresentation}
      hasPagePlaceholder={hasAuthorPagePlaceholder}
      resolveTargetUrl={(baseUrl, config, valueOrUrl, options) => resolveScraperAuthorTargetUrl(
        baseUrl,
        config,
        valueOrUrl,
        {
          pageIndex: options.pageIndex,
          templateContext: options.templateContext,
        },
      )}
      getListingNames={(previewPage) => previewPage.authorNames ?? []}
      listingNameSelectorFieldName="authorNameSelector"
      listingNameSelectorField={AUTHOR_NAME_SELECTOR_FIELD}
      listingNameCheckKey="authors"
      scrapingFieldNames={AUTHOR_SCRAPING_FIELD_NAMES}
      scrapingFields={SCRAPING_FIELDS}
      scrapingFieldSelectorNames={SCRAPING_FIELD_SELECTOR_NAMES}
      urlStrategyField={URL_STRATEGY_FIELD}
      urlTemplateField={URL_TEMPLATE_FIELD}
      testUrlField={TEST_URL_FIELD}
      testValueField={TEST_VALUE_FIELD}
      texts={{
        listingLabel: 'auteur',
        headerTitle: 'Configurer la page auteur',
        headerDescription: (
          'La page auteur combine deux besoins : construire une URL a partir d\'un nom ou d\'une URL connue, '
          + 'puis parser une liste de cards comme pour la recherche.'
        ),
        noteTitle: 'Connexion avec Recherche et Fiche',
        noteText: (
          'Les composants `Recherche` et `Fiche` peuvent remonter une URL auteur optionnelle. '
          + 'Quand elle existe, le runtime ouvrira directement cette page. Sinon, il utilisera le nom '
          + 'de l\'auteur avec le template configure ici, et pourra aussi reutiliser les variables '
          + 'extraites de `Fiche`.'
        ),
        urlDescription: (
          'Definis comment l\'application saura ouvrir une page auteur depuis une URL directe '
          + 'ou a partir d\'un nom / slug.'
        ),
        scrapingDescription: (
          'Definis les selecteurs qui permettent d\'extraire la liste de cards retournee par la page auteur.'
        ),
        templateHint: (
          <>
            Placeholders supportes : <code>{'{{value}}'}</code>, <code>{'{{rawValue}}'}</code>,
            <code>{' {{query}}'}</code>, <code>{'{{rawQuery}}'}</code>, ainsi que les variantes
            de pagination <code>{'{{page}}'}</code>, <code>{'{{page3}}'}</code> et
            <code>{' {{pageIndex}}'}</code>. Si `Fiche` est validee, tu peux aussi utiliser
            <code>{' {{requestedUrl}}'}</code>, <code>{'{{finalUrl}}'}</code> et les variables
            extraites via <code>{'{{nomVariable}}'}</code> ou <code>{'{{raw:nomVariable}}'}</code>.
          </>
        ),
        templateContextEmptyMessage: (
          <>
            Aucune fiche validee n&apos;est disponible pour le moment. Le template `Auteur`
            peut deja fonctionner avec <code>{'{{value}}'}</code>, mais les variables de
            `Fiche` ne seront utilisables qu&apos;apres validation de ce composant.
          </>
        ),
        testDescription: 'Charge une page auteur de test puis verifie l\'apercu des cards extraites.',
        validateLabel: 'Valider la page auteur',
      }}
    />
  );
}
