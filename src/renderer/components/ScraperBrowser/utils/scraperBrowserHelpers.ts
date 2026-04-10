import { ScraperFeatureDefinition } from '@/shared/scraper';
import type { ScraperRouteState } from '@/renderer/utils/scraperBrowserNavigation';
import {
  ScraperBrowseMode,
  ScraperCapability,
  ScraperSearchReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import {
  ScraperRuntimeChapterResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';

export const MAX_VISIBLE_SEARCH_RESULTS = 18;

export const buildSearchReturnStateFromRoute = (
  routeState: ScraperRouteState,
): ScraperSearchReturnState | null => (
  routeState.searchActive
    ? {
      hasExecutedSearch: true,
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
): string => {
  if (mode === 'search') {
    return 'Optionnel : rechercher un manga ou laisser vide pour tout afficher';
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
  hasSearchNextPageSelector: boolean;
  canOpenSearchResultsAsDetails: boolean;
  hasDetails: boolean;
}): string => {
  const {
    mode,
    usesSearchTemplatePaging,
    hasSearchNextPageSelector,
    canOpenSearchResultsAsDetails,
    hasDetails,
  } = options;

  if (mode === 'manga') {
    return 'Cette vue charge une fiche a partir de la configuration `Fiche` et affiche un rendu temporaire.';
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

  if (hasDetails) {
    return 'La recherche est active et la requete est optionnelle. Configure `Fiche` pour pouvoir ouvrir un resultat directement.';
  }

  return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle et les resultats extraits s\'affichent ici.';
};

export const buildScraperCapabilities = (options: {
  searchFeature: ScraperFeatureDefinition | null;
  detailsFeature: ScraperFeatureDefinition | null;
  chaptersFeature: ScraperFeatureDefinition | null;
  pagesFeature: ScraperFeatureDefinition | null;
  hasSearch: boolean;
  hasDetails: boolean;
  hasChapters: boolean;
  hasPages: boolean;
}): ScraperCapability[] => {
  const {
    searchFeature,
    detailsFeature,
    chaptersFeature,
    pagesFeature,
    hasSearch,
    hasDetails,
    hasChapters,
    hasPages,
  } = options;

  return [
    { label: 'Recherche', feature: searchFeature, enabled: hasSearch },
    { label: 'Fiche', feature: detailsFeature, enabled: hasDetails },
    { label: 'Chapitres', feature: chaptersFeature, enabled: hasChapters },
    { label: 'Pages', feature: pagesFeature, enabled: hasPages },
  ];
};

export const buildPaginationInfoLabel = (
  searchPage: ScraperRuntimeSearchPageResult | null,
  usesSearchTemplatePaging: boolean,
): string => {
  if (usesSearchTemplatePaging) {
    return 'La pagination utilise le template de recherche avec `{{page}}`.';
  }

  if (searchPage?.nextPageUrl) {
    return 'Une page suivante a ete detectee pour cette recherche.';
  }

  return 'Derniere page detectee pour cette recherche.';
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
