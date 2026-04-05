import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ScraperRecord, ScraperSearchResultItem } from '@/shared/scraper';
import { useModal } from '@/renderer/hooks/useModal';
import buildScraperConfigModal from '@/renderer/components/Modal/modales/ScraperConfigModal';
import buildScraperImagePreviewModal from '@/renderer/components/Modal/modales/ScraperImagePreviewModal';
import ScraperBrowserHero from '@/renderer/components/ScraperBrowser/components/ScraperBrowserHero';
import ScraperBrowserMessages from '@/renderer/components/ScraperBrowser/components/ScraperBrowserMessages';
import ScraperBrowserToolbar from '@/renderer/components/ScraperBrowser/components/ScraperBrowserToolbar';
import ScraperDetailsPanel from '@/renderer/components/ScraperBrowser/components/ScraperDetailsPanel';
import ScraperSearchResultsSection from '@/renderer/components/ScraperBrowser/components/ScraperSearchResultsSection';
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
import {
  ScraperBrowseMode,
  ScraperCapability,
  ScraperSearchReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import './style.scss';

type Props = {
  scraper: ScraperRecord;
  initialState?: {
    query: string;
    detailsResult: ScraperRuntimeDetailsResult;
    searchReturnState?: ScraperSearchReturnState | null;
  } | null;
};

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
      scrollTop: null,
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
  const browserRootRef = useRef<HTMLElement | null>(null);
  const lastInternalSearchRef = useRef<string | null>(null);
  const lastRestoredRouteSignatureRef = useRef<string | null>(null);
  const scrollRestoreFrameRef = useRef<number | null>(null);
  const nestedScrollRestoreFrameRef = useRef<number | null>(null);

  const cancelScheduledScrollRestore = useCallback(() => {
    if (scrollRestoreFrameRef.current !== null) {
      cancelAnimationFrame(scrollRestoreFrameRef.current);
      scrollRestoreFrameRef.current = null;
    }

    if (nestedScrollRestoreFrameRef.current !== null) {
      cancelAnimationFrame(nestedScrollRestoreFrameRef.current);
      nestedScrollRestoreFrameRef.current = null;
    }
  }, []);

  const getCurrentScrollTop = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return 0;
    }

    const windowScrollTop = window.scrollY || window.pageYOffset || 0;
    const documentScrollTop = document.scrollingElement?.scrollTop
      ?? document.documentElement.scrollTop
      ?? document.body?.scrollTop
      ?? 0;

    return Math.max(windowScrollTop, documentScrollTop);
  }, []);

  const restoreSearchScrollPosition = useCallback((scrollTop: number | null | undefined) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (typeof scrollTop !== 'number' || !Number.isFinite(scrollTop)) {
      return;
    }

    cancelScheduledScrollRestore();

    const nextScrollTop = Math.max(0, scrollTop);
    scrollRestoreFrameRef.current = requestAnimationFrame(() => {
      scrollRestoreFrameRef.current = null;
      nestedScrollRestoreFrameRef.current = requestAnimationFrame(() => {
        nestedScrollRestoreFrameRef.current = null;
        window.scrollTo({ top: nextScrollTop, left: 0, behavior: 'auto' });
      });
    });
  }, [cancelScheduledScrollRestore]);

  const scrollToBrowserTop = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    cancelScheduledScrollRestore();

    scrollRestoreFrameRef.current = requestAnimationFrame(() => {
      scrollRestoreFrameRef.current = null;
      nestedScrollRestoreFrameRef.current = requestAnimationFrame(() => {
        nestedScrollRestoreFrameRef.current = null;
        const top = browserRootRef.current
          ? browserRootRef.current.getBoundingClientRect().top + window.scrollY
          : 0;

        window.scrollTo({
          top: Math.max(0, top),
          left: 0,
          behavior: 'auto',
        });
      });
    });
  }, [cancelScheduledScrollRestore]);

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
    setSearchReturnState(initialState?.searchReturnState ?? null);
    setDetailsResult(initialState?.detailsResult ?? null);
    setRuntimeMessage(null);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
    setLoading(false);
    setDownloading(false);
    setOpeningReader(false);
    setUrlRestoreReady(false);
    cancelScheduledScrollRestore();
    lastInternalSearchRef.current = null;
    lastRestoredRouteSignatureRef.current = null;
  }, [cancelScheduledScrollRestore, initialState, scraper.id]);

  useEffect(() => (
    () => {
      cancelScheduledScrollRestore();
    }
  ), [cancelScheduledScrollRestore]);

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
      scrollToBrowserTop();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de charger la page suivante.');
    } finally {
      setLoading(false);
    }
  }, [fetchSearchPage, query, scraper.baseUrl, scrollToBrowserTop, searchConfig, searchPage, searchPageIndex, usesSearchTemplatePaging]);

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
      scrollToBrowserTop();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de revenir a la page precedente.');
    } finally {
      setLoading(false);
    }
  }, [fetchSearchPage, scrollToBrowserTop, searchPageIndex, searchVisitedPageUrls]);

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
      scrollTop: getCurrentScrollTop(),
    });
    setMode('manga');
    setQuery(formatScraperValueForDisplay(result.detailUrl));
    await loadDetailsFromTargetUrl(result.detailUrl);
  }, [
    detailsConfig,
    getCurrentScrollTop,
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
      restoreSearchScrollPosition(searchReturnState.scrollTop);
      return;
    }

    if (searchReturnState.hasExecutedSearch) {
      await runSearchLookup(searchReturnState.query, {
        pageIndex: searchReturnState.pageIndex,
        preserveSearchReturnState: true,
      });
      restoreSearchScrollPosition(searchReturnState.scrollTop);
      return;
    }

    setSearchPage(null);
    setSearchVisitedPageUrls([]);
    setSearchPageIndex(0);
    setSearchResults([]);
    setHasExecutedSearch(false);
    setRuntimeMessage(null);
  }, [restoreSearchScrollPosition, runSearchLookup, searchReturnState]);

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

  const handleModeChange = useCallback(async (nextMode: ScraperBrowseMode) => {
    if (nextMode === mode) {
      return;
    }

    if (nextMode === 'search' && detailsResult) {
      if (searchReturnState?.hasExecutedSearch) {
        await handleBackToSearch();
        return;
      }

      await handleGoToHome();
      return;
    }

    setMode(nextMode);
  }, [
    detailsResult,
    handleBackToSearch,
    handleGoToHome,
    mode,
    searchReturnState,
  ]);

  useEffect(() => {
    if (urlRestoreReady) {
      return;
    }

    if (lastRestoredRouteSignatureRef.current === routeStateSignature) {
      return;
    }

    lastRestoredRouteSignatureRef.current = routeStateSignature;

    const restoredSearchReturnState = initialState?.searchReturnState
      ?? buildSearchReturnStateFromRoute(routeState);

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
              searchReturnState,
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
  }, [detailsResult, location.pathname, location.search, navigate, pagesConfig, query, resolveCurrentPageUrls, scraper.id, searchReturnState]);

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
    <section className="scraper-browser" ref={browserRootRef}>
      <ScraperBrowserHero
        scraper={scraper}
        capabilities={capabilities as ScraperCapability[]}
        onHome={() => void handleGoToHome()}
        onEdit={() => openModal(buildScraperConfigModal({
          kind: 'edit',
          scraperId: scraper.id,
        }))}
      />

      {availableModes.length === 0 ? (
        <div className="scraper-browser__panel scraper-browser__message is-warning">
          Aucun composant executable n&apos;est encore configure sur ce scrapper. Configure au moins `Fiche`
          ou `Recherche` pour afficher une vue temporaire ici.
        </div>
      ) : (
        <ScraperBrowserToolbar
          availableModes={availableModes}
          mode={mode}
          query={query}
          activePlaceholder={activePlaceholder}
          helperText={helperText}
          loading={loading}
          onSubmit={handleSubmit}
          onModeChange={(nextMode) => void handleModeChange(nextMode)}
          onQueryChange={setQuery}
        />
      )}

      <ScraperBrowserMessages
        runtimeMessage={runtimeMessage}
        runtimeError={runtimeError}
        downloadMessage={downloadMessage}
        downloadError={downloadError}
      />

      <ScraperSearchResultsSection
        visibleSearchResults={visibleSearchResults}
        searchResultsCount={searchResults.length}
        query={query}
        searchPage={searchPage}
        searchPageIndex={searchPageIndex}
        shouldShowSearchPagination={shouldShowSearchPagination}
        currentSearchPageLabel={currentSearchPageLabel}
        paginationInfoLabel={paginationInfoLabel}
        loading={loading}
        usesSearchTemplatePaging={usesSearchTemplatePaging}
        canOpenSearchResultsAsDetails={canOpenSearchResultsAsDetails}
        onPreviousPage={() => void handleSearchPreviousPage()}
        onNextPage={() => void handleSearchNextPage()}
        onOpenResult={(result) => void handleOpenSearchResult(result)}
        onResultKeyDown={handleSearchResultKeyDown}
        onOpenResultAction={handleOpenSearchResultAction}
        onOpenResultImage={handleOpenSearchResultImage}
      />

      <ScraperDetailsPanel
        detailsResult={detailsResult}
        hasPages={hasPages}
        canReturnToSearch={canReturnToSearch}
        openingReader={openingReader}
        downloading={downloading}
        onBackToSearch={() => void handleBackToSearch()}
        onOpenReader={() => void handleOpenReader()}
        onDownload={() => void handleDownload()}
      />
    </section>
  );
}
