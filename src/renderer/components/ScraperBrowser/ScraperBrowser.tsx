import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ScraperRecord, ScraperSearchResultItem } from '@/shared/scraper';
import { useModal } from '@/renderer/hooks/useModal';
import buildScraperConfigModal from '@/renderer/components/Modal/modales/ScraperConfigModal';
import buildScraperImagePreviewModal from '@/renderer/components/Modal/modales/ScraperImagePreviewModal';
import ScraperSearchPagination from '@/renderer/components/ScraperBrowser/ScraperSearchPagination';
import {
  parseScraperRouteState,
  type ScraperRouteState,
  writeScraperRouteState,
} from '@/renderer/utils/scraperBrowserNavigation';
import {
  createScraperMangaId,
  extractScraperDetailsFromDocument,
  extractScraperSearchPageFromDocument,
  formatScraperValueForDisplay,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  getScraperSearchFeatureConfig,
  hasSearchPagePlaceholder,
  hasRenderableDetails,
  isScraperFeatureConfigured,
  resolveScraperDetailsTargetUrl,
  resolveScraperPageUrls,
  resolveScraperSearchTargetUrl,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import './style.scss';

type Props = {
  scraper: ScraperRecord;
  initialState?: {
    query: string;
    detailsResult: ScraperRuntimeDetailsResult;
  } | null;
};

type ScraperBrowseMode = 'search' | 'manga';

type ScraperSearchReturnState = {
  hasExecutedSearch: boolean;
  query: string;
  page: ScraperRuntimeSearchPageResult | null;
  visitedPageUrls: string[];
  pageIndex: number;
  results: ScraperSearchResultItem[];
};

const FEATURE_STATUS_LABELS = {
  not_configured: 'Non configure',
  configured: 'Configure',
  validated: 'Valide',
} as const;

const MAX_VISIBLE_SEARCH_RESULTS = 18;

const buildSearchReturnStateFromRoute = (
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
    }
    : null
);

const buildQueryPlaceholder = (
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

export default function ScraperBrowser({ scraper, initialState = null }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { openModal } = useModal();
  const searchFeature = useMemo(() => getScraperFeature(scraper, 'search'), [scraper]);
  const detailsFeature = useMemo(() => getScraperFeature(scraper, 'details'), [scraper]);
  const pagesFeature = useMemo(() => getScraperFeature(scraper, 'pages'), [scraper]);
  const searchConfig = useMemo(() => getScraperSearchFeatureConfig(searchFeature), [searchFeature]);
  const detailsConfig = useMemo(() => getScraperDetailsFeatureConfig(detailsFeature), [detailsFeature]);
  const pagesConfig = useMemo(() => getScraperPagesFeatureConfig(pagesFeature), [pagesFeature]);

  const hasSearch = isScraperFeatureConfigured(searchFeature);
  const hasDetails = isScraperFeatureConfigured(detailsFeature);
  const hasPages = isScraperFeatureConfigured(pagesFeature);
  const availableModes = useMemo<ScraperBrowseMode[]>(() => {
    const nextModes: ScraperBrowseMode[] = [];
    if (hasSearch) {
      nextModes.push('search');
    }
    if (hasDetails) {
      nextModes.push('manga');
    }
    return nextModes;
  }, [hasDetails, hasSearch]);

  const defaultMode = useMemo<ScraperBrowseMode>(() => {
    if (initialState?.detailsResult && availableModes.includes('manga')) {
      return 'manga';
    }

    if (availableModes.includes('search')) {
      return 'search';
    }

    return availableModes[0] ?? 'manga';
  }, [availableModes, initialState?.detailsResult]);

  const canOpenSearchResultsAsDetails = Boolean(
    hasDetails && detailsConfig?.titleSelector,
  );
  const usesSearchTemplatePaging = hasSearchPagePlaceholder(searchConfig);
  const hasConfiguredHomeSearch = useMemo(
    () => Boolean(scraper.globalConfig.homeSearch.enabled && hasSearch),
    [hasSearch, scraper.globalConfig.homeSearch.enabled],
  );
  const homeSearchQuery = useMemo(
    () => scraper.globalConfig.homeSearch.query || '',
    [scraper.globalConfig.homeSearch.query],
  );

  const [mode, setMode] = useState<ScraperBrowseMode>(defaultMode);
  const [query, setQuery] = useState('');
  const [searchPage, setSearchPage] = useState<ScraperRuntimeSearchPageResult | null>(null);
  const [searchVisitedPageUrls, setSearchVisitedPageUrls] = useState<string[]>([]);
  const [searchPageIndex, setSearchPageIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<ScraperSearchResultItem[]>([]);
  const [hasExecutedSearch, setHasExecutedSearch] = useState(false);
  const [searchReturnState, setSearchReturnState] = useState<ScraperSearchReturnState | null>(null);
  const [detailsResult, setDetailsResult] = useState<ScraperRuntimeDetailsResult | null>(null);
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [openingReader, setOpeningReader] = useState(false);
  const [urlRestoreReady, setUrlRestoreReady] = useState(false);
  const lastInternalSearchRef = useRef<string | null>(null);
  const lastRestoredRouteSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    setMode((previous) => (availableModes.includes(previous) ? previous : defaultMode));
  }, [availableModes, defaultMode]);

  useEffect(() => {
    setQuery(formatScraperValueForDisplay(initialState?.query ?? ''));
    setSearchPage(null);
    setSearchVisitedPageUrls([]);
    setSearchPageIndex(0);
    setSearchResults([]);
    setHasExecutedSearch(false);
    setSearchReturnState(null);
    setDetailsResult(initialState?.detailsResult ?? null);
    setRuntimeMessage(null);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
    setLoading(false);
    setDownloading(false);
    setOpeningReader(false);
    setUrlRestoreReady(false);
    lastInternalSearchRef.current = null;
    lastRestoredRouteSignatureRef.current = null;
  }, [initialState, scraper.id]);

  const routeState = useMemo(
    () => parseScraperRouteState(location.search),
    [location.search],
  );
  const routeStateSignature = useMemo(
    () => JSON.stringify(routeState),
    [routeState],
  );
  const currentDetailsUrl = useMemo(
    () => detailsResult?.finalUrl || detailsResult?.requestedUrl || '',
    [detailsResult],
  );

  const loadDetailsFromTargetUrl = useCallback(async (targetUrl: string) => {
    setRuntimeMessage(null);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
    setSearchPage(null);
    setSearchVisitedPageUrls([]);
    setSearchPageIndex(0);
    setSearchResults([]);
    setHasExecutedSearch(false);
    setDetailsResult(null);

    if (!detailsConfig || !detailsConfig.titleSelector) {
      setRuntimeError('Le composant Fiche n\'est pas encore suffisamment configure pour etre execute.');
      return;
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      setRuntimeError('Le runtime du scrapper n\'est pas disponible dans cette version.');
      return;
    }

    setLoading(true);

    try {
      const documentResult = await (window as any).api.fetchScraperDocument({
        baseUrl: scraper.baseUrl,
        targetUrl,
      });

      if (!documentResult?.ok || !documentResult.html) {
        setRuntimeError(
          documentResult?.error
            || (typeof documentResult?.status === 'number'
              ? `La fiche a repondu avec le code HTTP ${documentResult.status}.`
              : 'Impossible de charger la fiche demandee.'),
        );
        return;
      }

      const parser = new DOMParser();
      const documentNode = parser.parseFromString(documentResult.html, 'text/html');
      const extractedDetails = extractScraperDetailsFromDocument(documentNode, detailsConfig, {
        requestedUrl: documentResult.requestedUrl,
        finalUrl: documentResult.finalUrl,
        status: documentResult.status,
        contentType: documentResult.contentType,
      });

      if (!hasRenderableDetails(extractedDetails)) {
        setRuntimeError('La fiche a bien ete chargee, mais aucun contenu exploitable n\'a ete extrait avec la configuration actuelle.');
        return;
      }

      setDetailsResult(extractedDetails);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Echec temporaire du scrapper.');
    } finally {
      setLoading(false);
    }
  }, [detailsConfig, scraper.baseUrl]);

  const runDetailsLookup = useCallback(async (nextQuery: string) => {
    setSearchReturnState(null);

    if (!detailsConfig || !detailsConfig.titleSelector) {
      setRuntimeError('Le composant Fiche n\'est pas encore suffisamment configure pour etre execute.');
      return;
    }

    let targetUrl = '';
    try {
      targetUrl = resolveScraperDetailsTargetUrl(scraper.baseUrl, detailsConfig, nextQuery);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de construire l\'URL de la fiche.');
      return;
    }

    await loadDetailsFromTargetUrl(targetUrl);
  }, [detailsConfig, loadDetailsFromTargetUrl, scraper.baseUrl]);

  const fetchSearchPage = useCallback(async (targetUrl: string): Promise<ScraperRuntimeSearchPageResult> => {
    if (!searchConfig?.urlTemplate || !searchConfig.resultItemSelector || !searchConfig.titleSelector) {
      throw new Error('Le composant Recherche n\'est pas encore suffisamment configure pour etre execute.');
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      throw new Error('Le runtime du scrapper n\'est pas disponible dans cette version.');
    }

    const documentResult = await (window as any).api.fetchScraperDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!documentResult?.ok || !documentResult.html) {
      throw new Error(
        documentResult?.error
          || (typeof documentResult?.status === 'number'
            ? `La recherche a repondu avec le code HTTP ${documentResult.status}.`
            : 'Impossible de charger la page de recherche.'),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(documentResult.html, 'text/html');
    return extractScraperSearchPageFromDocument(documentNode, searchConfig, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    });
  }, [scraper.baseUrl, searchConfig]);

  const loadSearchResultsPage = useCallback(async (
    nextQuery: string,
    targetPageIndex = 0,
  ): Promise<{
    page: ScraperRuntimeSearchPageResult;
    visitedPageUrls: string[];
    pageIndex: number;
    items: ScraperSearchResultItem[];
  }> => {
    const normalizedTargetPageIndex = Math.max(0, targetPageIndex);

    if (usesSearchTemplatePaging) {
      const targetUrl = resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig!, nextQuery, {
        pageIndex: normalizedTargetPageIndex,
      });
      const page = await fetchSearchPage(targetUrl);
      const visitedPageUrls = Array.from({ length: normalizedTargetPageIndex + 1 }, (_, index) => (
        resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig!, nextQuery, { pageIndex: index })
      ));

      return {
        page,
        visitedPageUrls,
        pageIndex: normalizedTargetPageIndex,
        items: page.items,
      };
    }

    const firstPage = await fetchSearchPage(
      resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig!, nextQuery),
    );
    const visitedPageUrls = [firstPage.currentPageUrl];
    let currentPage = firstPage;
    let currentPageIndex = 0;

    while (currentPageIndex < normalizedTargetPageIndex && currentPage.nextPageUrl) {
      const nextPage = await fetchSearchPage(currentPage.nextPageUrl);
      if (!nextPage.items.length) {
        break;
      }

      currentPage = nextPage;
      currentPageIndex += 1;
      visitedPageUrls.push(nextPage.currentPageUrl);
    }

    return {
      page: currentPage,
      visitedPageUrls,
      pageIndex: currentPageIndex,
      items: currentPage.items,
    };
  }, [fetchSearchPage, scraper.baseUrl, searchConfig, usesSearchTemplatePaging]);

  const runSearchLookup = useCallback(async (
    nextQuery: string,
    options?: {
      pageIndex?: number;
      preserveSearchReturnState?: boolean;
    },
  ) => {
    setRuntimeMessage(null);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
    setDetailsResult(null);
    setSearchPage(null);
    setSearchVisitedPageUrls([]);
    setSearchPageIndex(0);
    setSearchResults([]);
    setHasExecutedSearch(false);

    if (!options?.preserveSearchReturnState) {
      setSearchReturnState(null);
    }

    if (!searchConfig?.urlTemplate || !searchConfig.resultItemSelector || !searchConfig.titleSelector) {
      setRuntimeError('Le composant Recherche n\'est pas encore suffisamment configure pour etre execute.');
      return;
    }

    setLoading(true);

    try {
      const extractedSearchState = await loadSearchResultsPage(nextQuery, options?.pageIndex ?? 0);
      const extractedPage = extractedSearchState.page;
      const extractedResults = extractedSearchState.items;
      setHasExecutedSearch(true);

      if (!extractedResults.length) {
        setRuntimeMessage('La recherche a bien ete lancee, mais aucun resultat exploitable n\'a ete extrait avec la configuration actuelle.');
        return;
      }

      setSearchPage(extractedPage);
      setSearchVisitedPageUrls(extractedSearchState.visitedPageUrls);
      setSearchPageIndex(extractedSearchState.pageIndex);
      setSearchResults(extractedResults);
      setRuntimeMessage(
        extractedSearchState.pageIndex > 0
          ? `${extractedResults.length} resultat(s) trouves sur la page ${extractedSearchState.pageIndex + 1}.`
          : usesSearchTemplatePaging
          ? `${extractedResults.length} resultat(s) trouve(s). Pagination pilotee par le template de recherche.`
          : extractedPage.nextPageUrl
          ? `${extractedResults.length} resultat(s) trouve(s). Pagination detectee sur cette recherche.`
          : canOpenSearchResultsAsDetails
            ? `${extractedResults.length} resultat(s) trouve(s). Tu peux ouvrir une fiche directement depuis la liste.`
            : `${extractedResults.length} resultat(s) trouve(s).`,
      );
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Echec temporaire de la recherche.');
    } finally {
      setLoading(false);
    }
  }, [canOpenSearchResultsAsDetails, loadSearchResultsPage, searchConfig, usesSearchTemplatePaging]);

  const handleSearchNextPage = useCallback(async () => {
    if (!searchPage) {
      return;
    }

    setLoading(true);
    setRuntimeMessage(null);
    setRuntimeError(null);

    try {
      const nextPageTargetUrl = usesSearchTemplatePaging
        ? resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig!, query, {
          pageIndex: searchPageIndex + 1,
        })
        : searchPage.nextPageUrl;

      if (!nextPageTargetUrl) {
        return;
      }

      const nextPage = await fetchSearchPage(nextPageTargetUrl);
      if (!nextPage.items.length) {
        setRuntimeMessage('Aucun resultat exploitable n\'a ete trouve sur la page suivante.');
        return;
      }

      setSearchPage(nextPage);
      setSearchResults(nextPage.items);
      setHasExecutedSearch(true);
      setSearchVisitedPageUrls((previous) => {
        const trimmedHistory = previous.slice(0, searchPageIndex + 1);
        const nextHistory = [...trimmedHistory, nextPage.currentPageUrl];
        return nextHistory;
      });
      setSearchPageIndex((previous) => previous + 1);
      setRuntimeMessage(
        usesSearchTemplatePaging
          ? `Page ${searchPageIndex + 2} chargee via le template de recherche.`
          : nextPage.nextPageUrl
          ? `Page ${searchPageIndex + 2} chargee. Une page suivante est encore disponible.`
          : `Page ${searchPageIndex + 2} chargee.`,
      );
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de charger la page suivante.');
    } finally {
      setLoading(false);
    }
  }, [fetchSearchPage, query, scraper.baseUrl, searchConfig, searchPage, searchPageIndex, usesSearchTemplatePaging]);

  const handleSearchPreviousPage = useCallback(async () => {
    if (searchPageIndex <= 0) {
      return;
    }

    const previousPageUrl = searchVisitedPageUrls[searchPageIndex - 1];
    if (!previousPageUrl) {
      return;
    }

    setLoading(true);
    setRuntimeMessage(null);
    setRuntimeError(null);

    try {
      const previousPage = await fetchSearchPage(previousPageUrl);
      setSearchPage(previousPage);
      setSearchResults(previousPage.items);
      setHasExecutedSearch(true);
      setSearchPageIndex((current) => Math.max(0, current - 1));
      setSearchVisitedPageUrls((currentHistory) => {
        const nextHistory = [...currentHistory];
        nextHistory[searchPageIndex - 1] = previousPage.currentPageUrl;
        return nextHistory;
      });
      setRuntimeMessage(`Retour a la page ${searchPageIndex}.`);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de revenir a la page precedente.');
    } finally {
      setLoading(false);
    }
  }, [fetchSearchPage, searchPageIndex, searchVisitedPageUrls]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedQuery = query.trim();
    if (mode === 'search') {
      await runSearchLookup(trimmedQuery);
      return;
    }

    if (!trimmedQuery) {
      setRuntimeError('Saisis une valeur avant de lancer le scrapper.');
      return;
    }

    await runDetailsLookup(trimmedQuery);
  }, [mode, query, runDetailsLookup, runSearchLookup]);

  const handleOpenSearchResult = useCallback(async (result: ScraperSearchResultItem) => {
    setRuntimeMessage(null);
    setRuntimeError(null);

    if (!result.detailUrl) {
      setRuntimeError('Ce resultat n\'expose pas de lien de fiche exploitable.');
      return;
    }

    if (!detailsConfig || !detailsConfig.titleSelector) {
      setRuntimeMessage('Pour ouvrir un resultat depuis la recherche, configure d\'abord le composant `Fiche`.');
      return;
    }

    setSearchReturnState({
      hasExecutedSearch,
      query,
      page: searchPage,
      visitedPageUrls: searchVisitedPageUrls,
      pageIndex: searchPageIndex,
      results: searchResults,
    });
    setMode('manga');
    setQuery(formatScraperValueForDisplay(result.detailUrl));
    await loadDetailsFromTargetUrl(result.detailUrl);
  }, [
    detailsConfig,
    loadDetailsFromTargetUrl,
    query,
    searchPage,
    searchPageIndex,
    searchResults,
    searchVisitedPageUrls,
    hasExecutedSearch,
  ]);

  const handleSearchResultKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLElement>,
    result: ScraperSearchResultItem,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    void handleOpenSearchResult(result);
  }, [handleOpenSearchResult]);

  const handleOpenSearchResultAction = useCallback((
    event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>,
    result: ScraperSearchResultItem,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    void handleOpenSearchResult(result);
  }, [handleOpenSearchResult]);

  const handleOpenSearchResultImage = useCallback((
    event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>,
    result: ScraperSearchResultItem,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!result.thumbnailUrl) {
      return;
    }

    openModal(buildScraperImagePreviewModal({
      imageUrl: result.thumbnailUrl,
      title: result.title,
    }));
  }, [openModal]);

  const handleBackToSearch = useCallback(async () => {
    if (!searchReturnState) {
      return;
    }

    setMode('search');
    setQuery(searchReturnState.query);
    setDetailsResult(null);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
    setLoading(false);
    setDownloading(false);
    setOpeningReader(false);

    if (searchReturnState.page && searchReturnState.results.length > 0) {
      setSearchPage(searchReturnState.page);
      setSearchVisitedPageUrls(searchReturnState.visitedPageUrls);
      setSearchPageIndex(searchReturnState.pageIndex);
      setSearchResults(searchReturnState.results);
      setHasExecutedSearch(searchReturnState.hasExecutedSearch);
      setRuntimeMessage('Retour a la derniere recherche.');
      return;
    }

    if (searchReturnState.hasExecutedSearch) {
      await runSearchLookup(searchReturnState.query, {
        pageIndex: searchReturnState.pageIndex,
        preserveSearchReturnState: true,
      });
      return;
    }

    setSearchPage(null);
    setSearchVisitedPageUrls([]);
    setSearchPageIndex(0);
    setSearchResults([]);
    setHasExecutedSearch(false);
    setRuntimeMessage(null);
  }, [runSearchLookup, searchReturnState]);

  const handleGoToHome = useCallback(async () => {
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
    setLoading(false);
    setDownloading(false);
    setOpeningReader(false);
    setSearchReturnState(null);

    if (!hasSearch) {
      setMode(defaultMode);
      setQuery('');
      setDetailsResult(null);
      setSearchPage(null);
      setSearchVisitedPageUrls([]);
      setSearchPageIndex(0);
      setSearchResults([]);
      setHasExecutedSearch(false);
      setRuntimeMessage(null);
      return;
    }

    setMode('search');
    setDetailsResult(null);

    if (hasConfiguredHomeSearch) {
      setQuery(homeSearchQuery);
      await runSearchLookup(homeSearchQuery);
      return;
    }

    setQuery('');
    setSearchPage(null);
    setSearchVisitedPageUrls([]);
    setSearchPageIndex(0);
    setSearchResults([]);
    setHasExecutedSearch(false);
    setRuntimeMessage(null);
  }, [defaultMode, hasConfiguredHomeSearch, hasSearch, homeSearchQuery, runSearchLookup]);

  useEffect(() => {
    if (urlRestoreReady) {
      return;
    }

    if (lastRestoredRouteSignatureRef.current === routeStateSignature) {
      return;
    }

    lastRestoredRouteSignatureRef.current = routeStateSignature;

    const restoredSearchReturnState = buildSearchReturnStateFromRoute(routeState);

    if (initialState?.detailsResult) {
      setMode('manga');
      setQuery(formatScraperValueForDisplay(
        routeState.mangaQuery || routeState.mangaUrl || initialState.query || '',
      ));
      setSearchReturnState(restoredSearchReturnState);
      setUrlRestoreReady(true);
      return;
    }

    if (routeState.scraperId !== scraper.id) {
      setUrlRestoreReady(true);
      return;
    }

    const nextMode = availableModes.includes(routeState.mode)
      ? routeState.mode
      : defaultMode;
    let cancelled = false;

    const finalizeRestore = () => {
      if (cancelled) {
        return;
      }

      setUrlRestoreReady(true);
    };

    const restoreFromRoute = async () => {
      setMode(nextMode);

      if (nextMode === 'search') {
        setQuery(routeState.searchQuery);

        if (routeState.searchActive && hasSearch) {
          await runSearchLookup(routeState.searchQuery, {
            pageIndex: Math.max(0, routeState.searchPage - 1),
          });
          finalizeRestore();
          return;
        }

        if (
          hasConfiguredHomeSearch
          && !routeState.searchActive
          && !routeState.mangaQuery
          && !routeState.mangaUrl
        ) {
          setQuery(homeSearchQuery);
          await runSearchLookup(homeSearchQuery);
          finalizeRestore();
          return;
        }

        setSearchReturnState(null);
        setDetailsResult(null);
        setSearchPage(null);
        setSearchVisitedPageUrls([]);
        setSearchPageIndex(0);
        setSearchResults([]);
        setHasExecutedSearch(false);
        setRuntimeMessage(null);
        setRuntimeError(null);
        setDownloadError(null);
        setDownloadMessage(null);
        finalizeRestore();
        return;
      }

      setQuery(formatScraperValueForDisplay(routeState.mangaQuery || routeState.mangaUrl || ''));
      setSearchReturnState(restoredSearchReturnState);

      if (hasDetails && routeState.mangaUrl) {
        await loadDetailsFromTargetUrl(routeState.mangaUrl);
        if (!cancelled) {
          setSearchReturnState(restoredSearchReturnState);
        }
        finalizeRestore();
        return;
      }

      if (hasDetails && routeState.mangaQuery) {
        await runDetailsLookup(routeState.mangaQuery);
        if (!cancelled) {
          setSearchReturnState(restoredSearchReturnState);
        }
        finalizeRestore();
        return;
      }

      setDetailsResult(null);
      setSearchPage(null);
      setSearchVisitedPageUrls([]);
      setSearchPageIndex(0);
      setSearchResults([]);
      setHasExecutedSearch(false);
      setRuntimeMessage(null);
      setRuntimeError(null);
      setDownloadError(null);
      setDownloadMessage(null);
      finalizeRestore();
    };

    void restoreFromRoute();

    return () => {
      cancelled = true;
    };
  }, [
    availableModes,
    defaultMode,
    hasDetails,
    hasConfiguredHomeSearch,
    hasSearch,
    homeSearchQuery,
    initialState?.detailsResult,
    loadDetailsFromTargetUrl,
    routeState.mangaQuery,
    routeState.mangaUrl,
    routeState.mode,
    routeState.scraperId,
    routeState.searchActive,
    routeState.searchPage,
    routeState.searchQuery,
    routeStateSignature,
    runDetailsLookup,
    runSearchLookup,
    scraper.id,
    urlRestoreReady,
  ]);

  useEffect(() => {
    if (!urlRestoreReady) {
      return;
    }

    const persistedSearchState = mode === 'search'
      ? {
        active: hasExecutedSearch,
        query,
        page: searchPageIndex + 1,
      }
      : searchReturnState?.hasExecutedSearch
        ? {
          active: true,
          query: searchReturnState.query,
          page: searchReturnState.pageIndex + 1,
        }
        : {
          active: false,
          query: '',
          page: 1,
        };

    const nextSearch = writeScraperRouteState(location.search, {
      scraperId: scraper.id,
      mode,
      searchActive: persistedSearchState.active,
      searchQuery: persistedSearchState.query,
      searchPage: persistedSearchState.page,
      mangaQuery: mode === 'manga' ? query : '',
      mangaUrl: mode === 'manga'
        ? formatScraperValueForDisplay(currentDetailsUrl) || undefined
        : undefined,
    });

    if (nextSearch === location.search) {
      lastInternalSearchRef.current = null;
      return;
    }

    if (lastInternalSearchRef.current === nextSearch) {
      return;
    }

    lastInternalSearchRef.current = nextSearch;
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch,
      },
      { replace: true },
    );
  }, [
    currentDetailsUrl,
    hasExecutedSearch,
    location.pathname,
    location.search,
    mode,
    navigate,
    query,
    scraper.id,
    searchPageIndex,
    searchReturnState,
    urlRestoreReady,
  ]);

  const resolveCurrentPageUrls = useCallback(async (): Promise<string[]> => {
    if (!detailsResult) {
      throw new Error('Charge d\'abord une fiche avant de lire ou telecharger le manga.');
    }

    if (!pagesConfig) {
      throw new Error('Le composant Pages n\'est pas encore configure pour ce scrapper.');
    }

    if (!(window as any).api || typeof (window as any).api.fetchScraperDocument !== 'function') {
      throw new Error('Le runtime du scrapper n\'est pas disponible dans cette version.');
    }

    return resolveScraperPageUrls(
      scraper,
      detailsResult,
      pagesConfig,
      async (request) => (window as any).api.fetchScraperDocument(request),
    );
  }, [detailsResult, pagesConfig, scraper]);

  const handleDownload = useCallback(async () => {
    if (!(window as any).api || typeof (window as any).api.downloadScraperManga !== 'function') {
      setDownloadError('Le telechargement du scrapper n\'est pas disponible dans cette version.');
      return;
    }

    setDownloading(true);
    setDownloadError(null);
    setDownloadMessage(null);

    try {
      const pageUrls = await resolveCurrentPageUrls();

      const downloadResult = await (window as any).api.downloadScraperManga({
        title: detailsResult?.title || query.trim() || 'manga',
        pageUrls,
        refererUrl: detailsResult?.finalUrl || detailsResult?.requestedUrl,
        scraperId: scraper.id,
        sourceUrl: detailsResult?.finalUrl || detailsResult?.requestedUrl,
        defaultTagIds: scraper.globalConfig.defaultTagIds,
        defaultLanguage: scraper.globalConfig.defaultLanguage,
      });
      const hasDefaultMetadata = Boolean(
        scraper.globalConfig.defaultTagIds.length || scraper.globalConfig.defaultLanguage,
      );

      setDownloadMessage(
        hasDefaultMetadata
          ? `${downloadResult.downloadedCount} page(s) telechargee(s) dans ${downloadResult.folderPath}. Le manga a ete ajoute a la bibliotheque avec les reglages par defaut du scrapper.`
          : `${downloadResult.downloadedCount} page(s) telechargee(s) dans ${downloadResult.folderPath}. Le manga a ete ajoute a la bibliotheque.`,
      );
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Le telechargement du manga a echoue.');
    } finally {
      setDownloading(false);
    }
  }, [detailsResult, query, resolveCurrentPageUrls, scraper.globalConfig.defaultLanguage, scraper.globalConfig.defaultTagIds, scraper.id]);

  const handleOpenReader = useCallback(async () => {
    if (!detailsResult) {
      setRuntimeError('Charge d\'abord une fiche avant d\'ouvrir le lecteur.');
      return;
    }

    if (!pagesConfig) {
      setRuntimeError('Le composant Pages n\'est pas encore configure pour ce scrapper.');
      return;
    }

    setOpeningReader(true);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);

    try {
      const pageUrls = await resolveCurrentPageUrls();
      const sourceUrl = detailsResult.finalUrl || detailsResult.requestedUrl;
      const readerMangaId = createScraperMangaId(scraper.id, sourceUrl);
      const savedProgress = (window as any).api && typeof (window as any).api.getScraperReaderProgress === 'function'
        ? await (window as any).api.getScraperReaderProgress(readerMangaId)
        : null;
      const savedPage = typeof savedProgress?.currentPage === 'number' && savedProgress.currentPage > 0
        ? savedProgress.currentPage
        : 1;

      navigate(
        `/reader?id=${encodeURIComponent(readerMangaId)}&page=${encodeURIComponent(String(savedPage))}`,
        {
          state: {
            from: {
              pathname: location.pathname,
              search: location.search,
            },
            mangaId: readerMangaId,
            scraperBrowserReturn: {
              scraperId: scraper.id,
              query,
              detailsResult,
            },
            scraperReader: {
              id: readerMangaId,
              scraperId: scraper.id,
              title: detailsResult.title || query.trim() || 'manga',
              sourceUrl,
              cover: detailsResult.cover,
              pageUrls,
            },
          },
        },
      );
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible d\'ouvrir le lecteur.');
    } finally {
      setOpeningReader(false);
    }
  }, [detailsResult, location.pathname, location.search, navigate, pagesConfig, query, resolveCurrentPageUrls, scraper.id]);

  const activePlaceholder = useMemo(
    () => buildQueryPlaceholder(mode, hasDetails, detailsConfig?.urlStrategy ?? null),
    [detailsConfig?.urlStrategy, hasDetails, mode],
  );

  const capabilities = useMemo(() => ([
    { label: 'Recherche', feature: searchFeature, enabled: hasSearch },
    { label: 'Fiche', feature: detailsFeature, enabled: hasDetails },
    { label: 'Pages', feature: pagesFeature, enabled: hasPages },
  ]), [detailsFeature, hasDetails, hasPages, hasSearch, pagesFeature, searchFeature]);

  const helperText = useMemo(() => {
    if (mode === 'manga') {
      return 'Cette vue charge une fiche a partir de la configuration `Fiche` et affiche un rendu temporaire.';
    }

    if (usesSearchTemplatePaging && searchConfig?.nextPageSelector) {
      return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle, et la pagination peut venir du template `{{page}}` ou du lien HTML de page suivante.';
    }

    if (usesSearchTemplatePaging) {
      return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle et la pagination est pilotee via le template `{{page}}`.';
    }

    if (searchConfig?.nextPageSelector) {
      return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle, la pagination HTML est detectee, et tu peux naviguer entre les pages de resultats.';
    }

    if (canOpenSearchResultsAsDetails) {
      return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle et tu peux ouvrir une fiche directement depuis un resultat.';
    }

    if (hasDetails) {
      return 'La recherche est active et la requete est optionnelle. Configure `Fiche` pour pouvoir ouvrir un resultat directement.';
    }

    return 'Cette vue lance la vraie recherche du scraper. La requete est optionnelle et les resultats extraits s\'affichent ici.';
  }, [canOpenSearchResultsAsDetails, hasDetails, mode, searchConfig?.nextPageSelector, usesSearchTemplatePaging]);

  const visibleSearchResults = useMemo(
    () => searchResults.slice(0, MAX_VISIBLE_SEARCH_RESULTS),
    [searchResults],
  );
  const canReturnToSearch = Boolean(searchReturnState?.hasExecutedSearch);
  const shouldShowSearchPagination = Boolean(
    searchPage && (searchPageIndex > 0 || searchPage.nextPageUrl || usesSearchTemplatePaging),
  );
  const paginationInfoLabel = useMemo(() => (
    usesSearchTemplatePaging
      ? 'La pagination utilise le template de recherche avec `{{page}}`.'
      : searchPage?.nextPageUrl
        ? 'Une page suivante a ete detectee pour cette recherche.'
        : 'Derniere page detectee pour cette recherche.'
  ), [searchPage?.nextPageUrl, usesSearchTemplatePaging]);
  const currentSearchPageLabel = useMemo(
    () => `Page ${searchPageIndex + 1}`,
    [searchPageIndex],
  );

  return (
    <section className="scraper-browser">
      <div className="scraper-browser__hero">
        <div className="scraper-browser__intro">
          <span className="scraper-browser__eyebrow">Scrapper actif</span>
          <h2>
            <button
              type="button"
              className="scraper-browser__home"
              onClick={() => void handleGoToHome()}
              title="Revenir a la page d'accueil du scrapper"
            >
              {scraper.name}
            </button>
          </h2>
          <p>{scraper.description || 'Affichage temporaire pour executer la configuration du scrapper sans passer par la bibliotheque.'}</p>
        </div>

        <div className="scraper-browser__meta">
          <div className="scraper-browser__meta-actions">
            <button
              type="button"
              className="scraper-browser__edit"
              onClick={() => openModal(buildScraperConfigModal({
                kind: 'edit',
                scraperId: scraper.id,
              }))}
            >
              Modifier
            </button>
          </div>
          <span>{scraper.baseUrl}</span>
          <div className="scraper-browser__caps">
            {capabilities.map((capability) => (
              <span
                key={capability.label}
                className={[
                  'scraper-browser__capability',
                  capability.enabled ? 'is-enabled' : 'is-disabled',
                ].join(' ')}
                title={capability.feature ? FEATURE_STATUS_LABELS[capability.feature.status] : 'Non configure'}
              >
                {capability.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {availableModes.length === 0 ? (
        <div className="scraper-browser__panel scraper-browser__message is-warning">
          Aucun composant executable n&apos;est encore configure sur ce scrapper. Configure au moins `Fiche`
          ou `Recherche` pour afficher une vue temporaire ici.
        </div>
      ) : (
        <div className="scraper-browser__panel">
          <form className="scraper-browser__toolbar" onSubmit={handleSubmit}>
            {availableModes.length > 1 ? (
              <select
                className="scraper-browser__mode-select"
                value={mode}
                onChange={(event) => setMode(event.target.value as ScraperBrowseMode)}
              >
                <option value="search">Recherche</option>
                <option value="manga">Manga</option>
              </select>
            ) : null}

            <input
              className="scraper-browser__query"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={activePlaceholder}
            />

            <button type="submit" className="scraper-browser__submit" disabled={loading}>
              {loading ? 'Chargement...' : mode === 'manga' ? 'Ouvrir' : 'Lancer'}
            </button>
          </form>

          <div className="scraper-browser__helper">
            {helperText}
          </div>
        </div>
      )}

      {runtimeMessage ? (
        <div className="scraper-browser__message is-info">{runtimeMessage}</div>
      ) : null}

      {runtimeError ? (
        <div className="scraper-browser__message is-error">{runtimeError}</div>
      ) : null}

      {downloadMessage ? (
        <div className="scraper-browser__message is-success">{downloadMessage}</div>
      ) : null}

      {downloadError ? (
        <div className="scraper-browser__message is-error">{downloadError}</div>
      ) : null}

      {visibleSearchResults.length ? (
        <section className="scraper-browser__results">
          <div className="scraper-browser__results-head">
            <div>
              <h3>Resultats de recherche</h3>
              <p>
                {query.trim()
                  ? (
                    <>
                      {searchResults.length} resultat(s) extrait(s) pour <strong>{query.trim()}</strong>.
                    </>
                  )
                  : (
                    <>
                      {searchResults.length} resultat(s) extrait(s) sans terme de recherche.
                    </>
                  )}
              </p>
            </div>

            <div className="scraper-browser__results-side">
              {searchPage ? (
                <span className="scraper-browser__results-count">
                  Page {searchPageIndex + 1}
                </span>
              ) : null}
              {searchResults.length > visibleSearchResults.length ? (
                <span className="scraper-browser__results-count">
                  {visibleSearchResults.length} / {searchResults.length}
                </span>
              ) : null}
            </div>
          </div>

          {shouldShowSearchPagination ? (
            <ScraperSearchPagination
              currentPageLabel={currentSearchPageLabel}
              infoLabel={paginationInfoLabel}
              onPrevious={() => void handleSearchPreviousPage()}
              onNext={() => void handleSearchNextPage()}
              previousDisabled={loading || searchPageIndex <= 0}
              nextDisabled={loading || (!usesSearchTemplatePaging && !searchPage?.nextPageUrl)}
            />
          ) : null}

          <div className="scraper-browser__results-grid">
            {visibleSearchResults.map((result) => {
              const canOpenResult = Boolean(result.detailUrl && canOpenSearchResultsAsDetails);
              const resultActions = canOpenResult ? (
                <>
                  <button
                    type="button"
                    className="scraper-browser__result-action-button"
                    onClick={(event) => handleOpenSearchResultAction(event, result)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        handleOpenSearchResultAction(event, result);
                      } else {
                        event.stopPropagation();
                      }
                    }}
                    aria-label={`Ouvrir la fiche ${result.title}`}
                  >
                    Ouvrir la fiche
                  </button>
                  {result.thumbnailUrl ? (
                    <button
                      type="button"
                      className="scraper-browser__result-preview-button"
                      onClick={(event) => handleOpenSearchResultImage(event, result)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          handleOpenSearchResultImage(event, result);
                        } else {
                          event.stopPropagation();
                        }
                      }}
                      aria-label={`Agrandir l'image de ${result.title}`}
                    >
                      Agrandir image
                    </button>
                  ) : null}
                </>
              ) : result.detailUrl ? (
                <>
                  <span className="scraper-browser__result-action-hint is-muted">
                    Configure `Fiche` pour ouvrir
                  </span>
                  {result.thumbnailUrl ? (
                    <button
                      type="button"
                      className="scraper-browser__result-preview-button"
                      onClick={(event) => handleOpenSearchResultImage(event, result)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          handleOpenSearchResultImage(event, result);
                        } else {
                          event.stopPropagation();
                        }
                      }}
                      aria-label={`Agrandir l'image de ${result.title}`}
                    >
                      Agrandir image
                    </button>
                  ) : null}
                </>
              ) : result.thumbnailUrl ? (
                <button
                  type="button"
                  className="scraper-browser__result-preview-button"
                  onClick={(event) => handleOpenSearchResultImage(event, result)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      handleOpenSearchResultImage(event, result);
                    } else {
                      event.stopPropagation();
                    }
                  }}
                  aria-label={`Agrandir l'image de ${result.title}`}
                >
                  Agrandir image
                </button>
              ) : null;

              return (
                <article
                  key={`${result.detailUrl ?? result.title}-${result.title}`}
                  className={[
                    'scraper-browser__result-card',
                    canOpenResult ? 'is-actionable' : '',
                  ].join(' ').trim()}
                  onClick={canOpenResult ? () => void handleOpenSearchResult(result) : undefined}
                  onKeyDown={canOpenResult ? (event) => handleSearchResultKeyDown(event, result) : undefined}
                  role={canOpenResult ? 'button' : undefined}
                  tabIndex={canOpenResult ? 0 : undefined}
                  aria-label={canOpenResult ? `Ouvrir la fiche ${result.title}` : undefined}
                >
                <div className="scraper-browser__result-media">
                  {result.thumbnailUrl ? (
                    <img src={result.thumbnailUrl} alt={result.title} />
                  ) : (
                    <div className="scraper-browser__result-placeholder">Pas d&apos;image</div>
                  )}
                </div>

                <div className="scraper-browser__result-body">
                  <h4>{result.title}</h4>
                  {result.summary ? (
                    <p className="scraper-browser__result-summary">{result.summary}</p>
                  ) : (
                    <p className="scraper-browser__result-summary is-muted">
                      Aucun resume extrait pour ce resultat.
                    </p>
                  )}
                </div>

                {resultActions ? (
                  <div className="scraper-browser__result-actions">
                    {resultActions}
                  </div>
                ) : null}
              </article>
              );
            })}
          </div>

          {shouldShowSearchPagination ? (
            <ScraperSearchPagination
              currentPageLabel={currentSearchPageLabel}
              infoLabel={paginationInfoLabel}
              onPrevious={() => void handleSearchPreviousPage()}
              onNext={() => void handleSearchNextPage()}
              previousDisabled={loading || searchPageIndex <= 0}
              nextDisabled={loading || (!usesSearchTemplatePaging && !searchPage?.nextPageUrl)}
            />
          ) : null}
        </section>
      ) : null}

      {detailsResult ? (
        <>
          {canReturnToSearch ? (
            <div className="scraper-browser__details-return">
              <button
                type="button"
                className="scraper-browser__back-to-search"
                onClick={handleBackToSearch}
              >
                Retour a la recherche
              </button>
            </div>
          ) : null}

          <article className="scraper-browser__details">
            <div className="scraper-browser__details-media">
              {detailsResult.cover ? (
                <img src={detailsResult.cover} alt={detailsResult.title || 'Couverture'} />
              ) : (
                <div className="scraper-browser__details-placeholder">Pas d&apos;image</div>
              )}
            </div>

            <div className="scraper-browser__details-body">
              <div className="scraper-browser__details-head">
                <h3>{detailsResult.title || 'Titre non detecte'}</h3>
                <div className="scraper-browser__details-actions">
                  {detailsResult.mangaStatus ? (
                    <span className="scraper-browser__status-pill">{detailsResult.mangaStatus}</span>
                  ) : null}
                  {hasPages ? (
                    <button
                      type="button"
                      className="scraper-browser__read"
                      onClick={() => void handleOpenReader()}
                      disabled={openingReader}
                    >
                      {openingReader ? 'Ouverture...' : 'Lecteur'}
                    </button>
                  ) : null}
                  {hasPages ? (
                    <button
                      type="button"
                      className="scraper-browser__download"
                      onClick={() => void handleDownload()}
                      disabled={downloading}
                    >
                      {downloading ? 'Telechargement...' : 'Telecharger'}
                    </button>
                  ) : null}
                </div>
              </div>

              {detailsResult.authors.length ? (
                <div className="scraper-browser__chips">
                  {detailsResult.authors.map((author) => (
                    <span key={author} className="scraper-browser__chip is-author">{author}</span>
                  ))}
                </div>
              ) : null}

              {detailsResult.tags.length ? (
                <div className="scraper-browser__chips">
                  {detailsResult.tags.map((tag) => (
                    <span key={tag} className="scraper-browser__chip is-tag">{tag}</span>
                  ))}
                </div>
              ) : null}

              <p className="scraper-browser__description">
                {detailsResult.description || 'Aucune description extraite pour cette fiche.'}
              </p>

              <div className="scraper-browser__links">
                <div>
                  <span>URL demandee</span>
                  <strong>{formatScraperValueForDisplay(detailsResult.requestedUrl)}</strong>
                </div>
                {detailsResult.finalUrl && detailsResult.finalUrl !== detailsResult.requestedUrl ? (
                  <div>
                    <span>URL finale</span>
                    <strong>{formatScraperValueForDisplay(detailsResult.finalUrl)}</strong>
                  </div>
                ) : null}
              </div>

              {Object.keys(detailsResult.derivedValues).length ? (
                <div className="scraper-browser__derived">
                  <span className="scraper-browser__derived-title">Variables derivees</span>
                  <div className="scraper-browser__derived-list">
                    {Object.entries(detailsResult.derivedValues).map(([key, value]) => (
                      <div key={key} className="scraper-browser__derived-item">
                        <code>{`{{${key}}}`}</code>
                        <strong>{formatScraperValueForDisplay(value)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        </>
      ) : null}
    </section>
  );
}
