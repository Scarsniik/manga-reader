import { ScraperFeatureDefinition } from '@/shared/scraper';
import type { ScraperRouteState } from '@/renderer/utils/scraperBrowserNavigation';
import {
  ScraperBrowseMode,
  ScraperCapability,
  ScraperListingReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import {
  ScraperRuntimeChapterResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';

export const MAX_VISIBLE_SEARCH_RESULTS = 18;

export const buildListingReturnStateFromRoute = (
  routeState: ScraperRouteState,
): ScraperListingReturnState | null => (
  routeState.authorActive
    ? {
      mode: 'author',
      hasExecutedListing: true,
      query: routeState.authorQuery,
      page: null,
      visitedPageUrls: [],
      pageIndex: Math.max(0, routeState.authorPage - 1),
      results: [],
      scrollTop: null,
    }
    : routeState.searchActive
    ? {
      mode: 'search',
      hasExecutedListing: true,
      query: routeState.searchQuery,
      page: null,
      visitedPageUrls: [],
      pageIndex: Math.max(0, routeState.searchPage - 1),
      results: [],
      scrollTop: null,
    }
    : null
);

export const buildQueryPlaceholder = (
  mode: ScraperBrowseMode,
  hasDetails: boolean,
  detailsMode: 'template' | 'result_url' | null,
  hasAuthor: boolean,
  authorMode: 'template' | 'result_url' | null,
): string => {
  if (mode === 'search') {
    return 'Optionnel : rechercher un manga ou laisser vide pour tout afficher';
  }

  if (mode === 'author') {
    if (!hasAuthor) {
      return 'La page auteur n\'est pas encore configuree.';
    }

    if (authorMode === 'template') {
      return 'Exemple : nom d\'auteur, slug ou URL auteur detectee';
    }

    return 'Exemple : URL auteur complete, chemin relatif ou lien detecte';
  }

  if (!hasDetails) {
    return 'La fiche n\'est pas encore configuree.';
  }

  if (detailsMode === 'template') {
    return 'Exemple : slug, id ou valeur attendue par le template';
  }

  return 'Exemple : URL complete, chemin relatif ou slug';
};

export const buildSearchResultsMessage = (options: {
  resultsCount: number;
  pageIndex: number;
  usesSearchTemplatePaging: boolean;
  hasNextPage: boolean;
  canOpenSearchResultsAsDetails: boolean;
}): string => {
  const {
    resultsCount,
    pageIndex,
    usesSearchTemplatePaging,
    hasNextPage,
    canOpenSearchResultsAsDetails,
  } = options;

  if (pageIndex > 0) {
    return `${resultsCount} resultat(s) trouves sur la page ${pageIndex + 1}.`;
  }

  if (usesSearchTemplatePaging) {
    return `${resultsCount} resultat(s) trouve(s). Pagination pilotee par le template de recherche.`;
  }

  if (hasNextPage) {
    return `${resultsCount} resultat(s) trouve(s). Pagination detectee sur cette recherche.`;
  }

  if (canOpenSearchResultsAsDetails) {
    return `${resultsCount} resultat(s) trouve(s). Tu peux ouvrir une fiche directement depuis la liste.`;
  }

  return `${resultsCount} resultat(s) trouve(s).`;
};

export const buildSearchPageLoadedMessage = (
  nextPageIndex: number,
  usesSearchTemplatePaging: boolean,
  hasNextPage: boolean,
): string => {
  if (usesSearchTemplatePaging) {
    return `Page ${nextPageIndex + 1} chargee via le template de recherche.`;
  }

  if (hasNextPage) {
    return `Page ${nextPageIndex + 1} chargee. Une page suivante est encore disponible.`;
  }

  return `Page ${nextPageIndex + 1} chargee.`;
};

export const buildScraperBrowserHelperText = (options: {
  mode: ScraperBrowseMode;
  usesSearchTemplatePaging: boolean;
  usesAuthorTemplatePaging: boolean;
  hasSearchNextPageSelector: boolean;
  hasAuthorNextPageSelector: boolean;
  canOpenSearchResultsAsDetails: boolean;
  canOpenSearchResultsAsAuthor: boolean;
  hasDetails: boolean;
  hasAuthor: boolean;
}): string => {
  const {
    mode,
    usesSearchTemplatePaging,
    usesAuthorTemplatePaging,
    hasSearchNextPageSelector,
    hasAuthorNextPageSelector,
    canOpenSearchResultsAsDetails,
    canOpenSearchResultsAsAuthor,
    hasDetails,
    hasAuthor,
  } = options;

  if (mode === 'manga') {
    return 'Cette vue charge une fiche a partir de la configuration `Fiche` et affiche un rendu temporaire.';
  }

  if (mode === 'author') {
    if (usesAuthorTemplatePaging && hasAuthorNextPageSelector) {
      return 'Cette vue ouvre une page auteur. Tu peux saisir une URL auteur complete ou un nom d\'auteur, et la pagination peut venir du template `{{page}}` ou du lien HTML de page suivante.';
    }

    if (usesAuthorTemplatePaging) {
      return 'Cette vue ouvre une page auteur a partir d\'une URL ou d\'un nom. La pagination est pilotee via le template `{{page}}`.';
    }

    if (hasAuthorNextPageSelector) {
      return 'Cette vue ouvre une page auteur a partir d\'une URL ou d\'un nom. La pagination HTML est detectee pour parcourir plusieurs pages d\'archive.';
    }

    if (hasDetails) {
      return 'Cette vue charge une page auteur et affiche les cards extraites. Tu peux ouvrir une fiche manga directement depuis les resultats.';
    }

    if (hasAuthor) {
      return 'Cette vue charge une page auteur et affiche les cards extraites a partir de la configuration `Auteur`.';
    }
  }

  if (usesSearchTemplatePaging && hasSearchNextPageSelector) {
    return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle, et la pagination peut venir du template `{{page}}` ou du lien HTML de page suivante.';
  }

  if (usesSearchTemplatePaging) {
    return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle et la pagination est pilotee via le template `{{page}}`.';
  }

  if (hasSearchNextPageSelector) {
    return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle, la pagination HTML est detectee, et tu peux naviguer entre les pages de resultats.';
  }

  if (canOpenSearchResultsAsDetails) {
    return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle et tu peux ouvrir une fiche directement depuis un resultat.';
  }

  if (canOpenSearchResultsAsAuthor) {
    return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle et tu peux aussi ouvrir une page auteur quand un lien auteur est detecte.';
  }

  if (hasDetails) {
    return 'La recherche est active et la requete est optionnelle. Configure `Fiche` pour pouvoir ouvrir un resultat directement.';
  }

  return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle et les resultats extraits s\'affichent ici.';
};

export const buildScraperCapabilities = (options: {
  searchFeature: ScraperFeatureDefinition | null;
  detailsFeature: ScraperFeatureDefinition | null;
  authorFeature: ScraperFeatureDefinition | null;
  chaptersFeature: ScraperFeatureDefinition | null;
  pagesFeature: ScraperFeatureDefinition | null;
  hasSearch: boolean;
  hasDetails: boolean;
  hasAuthor: boolean;
  hasChapters: boolean;
  hasPages: boolean;
}): ScraperCapability[] => {
  const {
    searchFeature,
    detailsFeature,
    authorFeature,
    chaptersFeature,
    pagesFeature,
    hasSearch,
    hasDetails,
    hasAuthor,
    hasChapters,
    hasPages,
  } = options;

  return [
    { label: 'Recherche', feature: searchFeature, enabled: hasSearch },
    { label: 'Fiche', feature: detailsFeature, enabled: hasDetails },
    { label: 'Auteur', feature: authorFeature, enabled: hasAuthor },
    { label: 'Chapitres', feature: chaptersFeature, enabled: hasChapters },
    { label: 'Pages', feature: pagesFeature, enabled: hasPages },
  ];
};

export const buildPaginationInfoLabel = (
  searchPage: ScraperRuntimeSearchPageResult | null,
  usesSearchTemplatePaging: boolean,
  listingLabel = 'liste',
): string => {
  if (usesSearchTemplatePaging) {
    return `La pagination utilise le template de ${listingLabel} avec \`{{page}}\`.`;
  }

  if (searchPage?.nextPageUrl) {
    return `Une page suivante a ete detectee pour cette ${listingLabel}.`;
  }

  return `Derniere page detectee pour cette ${listingLabel}.`;
};

export const isScraperRuntimeChapterResult = (
  value: unknown,
): value is ScraperRuntimeChapterResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ScraperRuntimeChapterResult>;
  return typeof candidate.url === 'string' && typeof candidate.label === 'string';
};
