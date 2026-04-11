import React, { Dispatch, SetStateAction, useCallback } from 'react';
import { NavigateFunction } from 'react-router-dom';
import {
  ScraperAuthorFeatureConfig,
  ScraperDetailsFeatureConfig,
  ScraperRecord,
  ScraperSearchFeatureConfig,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import {
  ScraperBrowseMode,
  ScraperBrowserLocationState,
  ScraperListingMode,
  ScraperListingReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import {
  buildSearchPageLoadedMessage,
  buildSearchResultsMessage,
} from '@/renderer/components/ScraperBrowser/utils/scraperBrowserHelpers';
import {
  extractScraperSearchPageFromDocument,
  formatScraperValueForDisplay,
  hasAuthorPagePlaceholder,
  hasSearchPagePlaceholder,
  resolveScraperAuthorTargetUrl,
  resolveScraperSearchRequestConfig,
  resolveScraperSearchTargetUrl,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import {
  parseScraperRouteState,
  writeScraperRouteState,
} from '@/renderer/utils/scraperBrowserNavigation';
import type { ScraperTemplateContext } from '@/renderer/utils/scraperTemplateContext';

export type ListingLookupOptions = {
  pageIndex?: number;
  preserveListingReturnState?: boolean;
  templateContext?: ScraperTemplateContext | null;
  canCommit?: () => boolean;
};

type UseScraperBrowserSearchOptions = {
  scraper: ScraperRecord;
  locationPathname: string;
  locationSearch: string;
  locationState: ScraperBrowserLocationState | null;
  navigate: NavigateFunction;
  query: string;
  mode: ScraperBrowseMode;
  defaultMode: ScraperBrowseMode;
  hasSearch: boolean;
  hasAuthor: boolean;
  hasConfiguredHomeSearch: boolean;
  homeSearchQuery: string;
  searchConfig: ScraperSearchFeatureConfig | null;
  authorConfig: ScraperAuthorFeatureConfig | null;
  detailsConfig: ScraperDetailsFeatureConfig | null;
  canOpenSearchResultsAsDetails: boolean;
  canOpenSearchResultsAsAuthor: boolean;
  listingPage: ScraperRuntimeSearchPageResult | null;
  listingVisitedPageUrls: string[];
  listingPageIndex: number;
  listingResults: ScraperSearchResultItem[];
  hasExecutedListing: boolean;
  listingReturnState: ScraperListingReturnState | null;
  detailsResult: ScraperRuntimeDetailsResult | null;
  authorTemplateContext: ScraperTemplateContext | null;
  clearFeedback: () => void;
  resetListingState: () => void;
  resetDetailsState: () => void;
  resetAsyncState: () => void;
  getCurrentScrollTop: () => number;
  restoreSearchScrollPosition: (scrollTop: number | null | undefined) => void;
  scrollToBrowserTop: () => void;
  setMode: Dispatch<SetStateAction<ScraperBrowseMode>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setListingPage: Dispatch<SetStateAction<ScraperRuntimeSearchPageResult | null>>;
  setListingVisitedPageUrls: Dispatch<SetStateAction<string[]>>;
  setListingPageIndex: Dispatch<SetStateAction<number>>;
  setListingResults: Dispatch<SetStateAction<ScraperSearchResultItem[]>>;
  setHasExecutedListing: Dispatch<SetStateAction<boolean>>;
  setListingReturnState: Dispatch<SetStateAction<ScraperListingReturnState | null>>;
  setAuthorTemplateContext: Dispatch<SetStateAction<ScraperTemplateContext | null>>;
  setRuntimeMessage: Dispatch<SetStateAction<string | null>>;
  setRuntimeError: Dispatch<SetStateAction<string | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  loadDetailsFromTargetUrl: (targetUrl: string) => Promise<void>;
};

const isListingMode = (value: ScraperBrowseMode): value is ScraperListingMode => (
  value === 'search' || value === 'author'
);

const getListingModeLabel = (mode: ScraperListingMode): string => (
  mode === 'author' ? 'page auteur' : 'recherche'
);

const getRouteStateForNavigation = (options: {
  routeSearch: string;
  scraperId: string;
  nextMode: ScraperBrowseMode;
  sourceMode: ScraperBrowseMode;
  sourceQuery: string;
  sourcePageIndex: number;
  hasExecutedSourceListing: boolean;
  nextAuthorQuery?: string;
  mangaUrl?: string;
}): string => {
  const {
    routeSearch,
    scraperId,
    nextMode,
    sourceMode,
    sourceQuery,
    sourcePageIndex,
    hasExecutedSourceListing,
    nextAuthorQuery,
    mangaUrl,
  } = options;
  const currentRouteState = parseScraperRouteState(routeSearch);
  const currentPage = Math.max(1, sourcePageIndex + 1);
  const persistedSearchState = sourceMode === 'search'
    ? {
      active: hasExecutedSourceListing,
      query: sourceQuery,
      page: currentPage,
    }
    : {
      active: currentRouteState.searchActive,
      query: currentRouteState.searchQuery,
      page: currentRouteState.searchPage,
    };
  const persistedAuthorState = sourceMode === 'author'
    ? {
      active: hasExecutedSourceListing,
      query: sourceQuery,
      page: currentPage,
    }
    : {
      active: currentRouteState.authorActive,
      query: currentRouteState.authorQuery,
      page: currentRouteState.authorPage,
    };

  return writeScraperRouteState(routeSearch, {
    scraperId,
    mode: nextMode,
    searchActive: persistedSearchState.active,
    searchQuery: persistedSearchState.query,
    searchPage: persistedSearchState.page,
    authorActive: nextMode === 'author'
      ? true
      : persistedAuthorState.active,
    authorQuery: nextMode === 'author'
      ? (nextAuthorQuery ?? '')
      : persistedAuthorState.query,
    authorPage: nextMode === 'author'
      ? 1
      : persistedAuthorState.page,
    mangaQuery: '',
    mangaUrl,
  });
};

export function useScraperBrowserSearch({
  scraper,
  locationPathname,
  locationSearch,
  locationState,
  navigate,
  query,
  mode,
  defaultMode,
  hasSearch,
  hasAuthor,
  hasConfiguredHomeSearch,
  homeSearchQuery,
  searchConfig,
  authorConfig,
  detailsConfig,
  canOpenSearchResultsAsDetails,
  canOpenSearchResultsAsAuthor,
  listingPage,
  listingVisitedPageUrls,
  listingPageIndex,
  listingResults,
  hasExecutedListing,
  listingReturnState,
  detailsResult,
  authorTemplateContext,
  clearFeedback,
  resetListingState,
  resetDetailsState,
  resetAsyncState,
  getCurrentScrollTop,
  restoreSearchScrollPosition,
  scrollToBrowserTop,
  setMode,
  setQuery,
  setListingPage,
  setListingVisitedPageUrls,
  setListingPageIndex,
  setListingResults,
  setHasExecutedListing,
  setListingReturnState,
  setAuthorTemplateContext,
  setRuntimeMessage,
  setRuntimeError,
  setLoading,
  loadDetailsFromTargetUrl,
}: UseScraperBrowserSearchOptions) {
  const fetchSearchPage = useCallback(async (
    targetUrl: string,
    options?: {
      query?: string;
      pageIndex?: number;
    },
  ): Promise<ScraperRuntimeSearchPageResult> => {
    if (!searchConfig?.urlTemplate || !searchConfig.resultItemSelector || !searchConfig.titleSelector) {
      throw new Error('Le composant Recherche n\'est pas encore suffisamment configure pour etre execute.');
    }

    const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
    if (typeof fetchScraperDocument !== 'function') {
      throw new Error('Le runtime du scrapper n\'est pas disponible dans cette version.');
    }

    const documentResult = await fetchScraperDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
      requestConfig: resolveScraperSearchRequestConfig(searchConfig, options?.query || '', {
        pageIndex: options?.pageIndex ?? 0,
      }),
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

  const fetchAuthorPage = useCallback(async (
    targetUrl: string,
  ): Promise<ScraperRuntimeSearchPageResult> => {
    if (!authorConfig?.resultItemSelector || !authorConfig.titleSelector) {
      throw new Error('Le composant Auteur n\'est pas encore suffisamment configure pour etre execute.');
    }

    const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
    if (typeof fetchScraperDocument !== 'function') {
      throw new Error('Le runtime du scrapper n\'est pas disponible dans cette version.');
    }

    const documentResult = await fetchScraperDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
    });

    if (!documentResult?.ok || !documentResult.html) {
      throw new Error(
        documentResult?.error
          || (typeof documentResult?.status === 'number'
            ? `La page auteur a repondu avec le code HTTP ${documentResult.status}.`
            : 'Impossible de charger la page auteur.'),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(documentResult.html, 'text/html');
    return extractScraperSearchPageFromDocument(documentNode, authorConfig, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    });
  }, [authorConfig, scraper.baseUrl]);

  const getUsesTemplatePaging = useCallback((listingMode: ScraperListingMode): boolean => (
    listingMode === 'author'
      ? hasAuthorPagePlaceholder(authorConfig)
      : hasSearchPagePlaceholder(searchConfig)
  ), [authorConfig, searchConfig]);

  const loadListingResultsPage = useCallback(async (
    listingMode: ScraperListingMode,
    nextQuery: string,
    targetPageIndex = 0,
    templateContextOverride?: ScraperTemplateContext | null,
  ): Promise<{
    page: ScraperRuntimeSearchPageResult;
    visitedPageUrls: string[];
    pageIndex: number;
    items: ScraperSearchResultItem[];
  }> => {
    const normalizedTargetPageIndex = Math.max(0, targetPageIndex);
    const usesTemplatePaging = getUsesTemplatePaging(listingMode);

    const fetchPage = async (
      targetUrl: string,
      pageIndex: number,
    ): Promise<ScraperRuntimeSearchPageResult> => (
      listingMode === 'author'
        ? fetchAuthorPage(targetUrl)
        : fetchSearchPage(targetUrl, {
          query: nextQuery,
          pageIndex,
        })
    );

    const resolveTargetUrl = (pageIndex: number): string => (
      listingMode === 'author'
        ? resolveScraperAuthorTargetUrl(scraper.baseUrl, authorConfig!, nextQuery, {
          pageIndex,
          templateContext: templateContextOverride ?? authorTemplateContext ?? undefined,
        })
        : resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig!, nextQuery, { pageIndex })
    );

    if (usesTemplatePaging) {
      const targetUrl = resolveTargetUrl(normalizedTargetPageIndex);
      const page = await fetchPage(targetUrl, normalizedTargetPageIndex);
      const visitedPageUrls = Array.from({ length: normalizedTargetPageIndex + 1 }, (_, index) => (
        resolveTargetUrl(index)
      ));

      return {
        page,
        visitedPageUrls,
        pageIndex: normalizedTargetPageIndex,
        items: page.items,
      };
    }

    const firstPage = await fetchPage(resolveTargetUrl(0), 0);
    const visitedPageUrls = [firstPage.currentPageUrl];
    let currentPage = firstPage;
    let currentPageIndex = 0;

    while (currentPageIndex < normalizedTargetPageIndex && currentPage.nextPageUrl) {
      const nextPage = await fetchPage(currentPage.nextPageUrl, currentPageIndex + 1);
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
  }, [authorConfig, authorTemplateContext, fetchAuthorPage, fetchSearchPage, getUsesTemplatePaging, scraper.baseUrl, searchConfig]);

  const runListingLookup = useCallback(async (
    listingMode: ScraperListingMode,
    nextQuery: string,
    options?: ListingLookupOptions,
  ) => {
    const canCommit = options?.canCommit ?? (() => true);
    if (!canCommit()) {
      return;
    }

    clearFeedback();
    resetDetailsState();
    resetListingState();
    const effectiveAuthorTemplateContext = listingMode === 'author'
      && Object.prototype.hasOwnProperty.call(options ?? {}, 'templateContext')
      ? options?.templateContext ?? null
      : authorTemplateContext;

    if (listingMode === 'author' && Object.prototype.hasOwnProperty.call(options ?? {}, 'templateContext')) {
      setAuthorTemplateContext(options?.templateContext ?? null);
    }

    if (!options?.preserveListingReturnState) {
      setListingReturnState(null);
    }

    if (listingMode === 'search') {
      if (!searchConfig?.urlTemplate || !searchConfig.resultItemSelector || !searchConfig.titleSelector) {
        setRuntimeError('Le composant Recherche n\'est pas encore suffisamment configure pour etre execute.');
        return;
      }
    } else if (!authorConfig?.resultItemSelector || !authorConfig.titleSelector) {
      setRuntimeError('Le composant Auteur n\'est pas encore suffisamment configure pour etre execute.');
      return;
    }

    setLoading(true);

    try {
      const extractedListingState = await loadListingResultsPage(
        listingMode,
        nextQuery,
        options?.pageIndex ?? 0,
        effectiveAuthorTemplateContext,
      );
      if (!canCommit()) {
        return;
      }

      const extractedPage = extractedListingState.page;
      const extractedResults = extractedListingState.items;
      setHasExecutedListing(true);

      if (!extractedResults.length) {
        setRuntimeMessage(
          listingMode === 'author'
            ? 'La page auteur a bien ete chargee, mais aucune card exploitable n\'a ete extraite avec la configuration actuelle.'
            : 'La recherche a bien ete lancee, mais aucun resultat exploitable n\'a ete extrait avec la configuration actuelle.',
        );
        return;
      }

      setListingPage(extractedPage);
      setListingVisitedPageUrls(extractedListingState.visitedPageUrls);
      setListingPageIndex(extractedListingState.pageIndex);
      setListingResults(extractedResults);
      setRuntimeMessage(buildSearchResultsMessage({
        resultsCount: extractedResults.length,
        pageIndex: extractedListingState.pageIndex,
        usesSearchTemplatePaging: getUsesTemplatePaging(listingMode),
        hasNextPage: Boolean(extractedPage.nextPageUrl),
        canOpenSearchResultsAsDetails,
      }));
    } catch (error) {
      if (canCommit()) {
        setRuntimeError(error instanceof Error ? error.message : 'Echec temporaire du chargement.');
      }
    } finally {
      if (canCommit()) {
        setLoading(false);
      }
    }
  }, [
    authorConfig,
    authorTemplateContext,
    setAuthorTemplateContext,
    canOpenSearchResultsAsDetails,
    clearFeedback,
    getUsesTemplatePaging,
    loadListingResultsPage,
    resetDetailsState,
    resetListingState,
    searchConfig,
    setHasExecutedListing,
    setListingPage,
    setListingPageIndex,
    setListingResults,
    setListingReturnState,
    setListingVisitedPageUrls,
    setLoading,
    setRuntimeError,
    setRuntimeMessage,
  ]);

  const runSearchLookup = useCallback(async (
    nextQuery: string,
    options?: ListingLookupOptions,
  ) => {
    await runListingLookup('search', nextQuery, options);
  }, [runListingLookup]);

  const runAuthorLookup = useCallback(async (
    nextQuery: string,
    options?: ListingLookupOptions,
  ) => {
    await runListingLookup('author', nextQuery, options);
  }, [runListingLookup]);

  const handleListingNextPage = useCallback(async () => {
    if (!listingPage || !isListingMode(mode)) {
      return;
    }

    const usesTemplatePaging = getUsesTemplatePaging(mode);
    const nextPageIndex = listingPageIndex + 1;
    const nextPageTargetUrl = usesTemplatePaging
      ? mode === 'author'
        ? resolveScraperAuthorTargetUrl(scraper.baseUrl, authorConfig!, query, {
          pageIndex: nextPageIndex,
          templateContext: authorTemplateContext ?? undefined,
        })
        : resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig!, query, {
          pageIndex: nextPageIndex,
        })
      : listingPage.nextPageUrl;

    if (!nextPageTargetUrl) {
      return;
    }

    setLoading(true);
    setRuntimeMessage(null);
    setRuntimeError(null);

    try {
      const nextPage = mode === 'author'
        ? await fetchAuthorPage(nextPageTargetUrl)
        : await fetchSearchPage(nextPageTargetUrl, {
          query,
          pageIndex: nextPageIndex,
        });
      if (!nextPage.items.length) {
        setRuntimeMessage(
          mode === 'author'
            ? 'Aucune card exploitable n\'a ete trouvee sur la page auteur suivante.'
            : 'Aucun resultat exploitable n\'a ete trouve sur la page suivante.',
        );
        return;
      }

      setListingPage(nextPage);
      setListingResults(nextPage.items);
      setHasExecutedListing(true);
      setListingVisitedPageUrls((previous) => {
        const trimmedHistory = previous.slice(0, listingPageIndex + 1);
        return [...trimmedHistory, nextPage.currentPageUrl];
      });
      setListingPageIndex((previous) => previous + 1);
      setRuntimeMessage(buildSearchPageLoadedMessage(
        nextPageIndex,
        usesTemplatePaging,
        Boolean(nextPage.nextPageUrl),
      ));
      scrollToBrowserTop();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de charger la page suivante.');
    } finally {
      setLoading(false);
    }
  }, [
    authorConfig,
    authorTemplateContext,
    fetchAuthorPage,
    fetchSearchPage,
    getUsesTemplatePaging,
    listingPage,
    listingPageIndex,
    mode,
    query,
    scraper.baseUrl,
    scrollToBrowserTop,
    searchConfig,
    setHasExecutedListing,
    setListingPage,
    setListingPageIndex,
    setListingResults,
    setListingVisitedPageUrls,
    setLoading,
    setRuntimeError,
    setRuntimeMessage,
  ]);

  const handleListingPreviousPage = useCallback(async () => {
    if (listingPageIndex <= 0 || !isListingMode(mode)) {
      return;
    }

    const previousPageUrl = listingVisitedPageUrls[listingPageIndex - 1];
    if (!previousPageUrl) {
      return;
    }

    setLoading(true);
    setRuntimeMessage(null);
    setRuntimeError(null);

    try {
      const previousPage = mode === 'author'
        ? await fetchAuthorPage(previousPageUrl)
        : await fetchSearchPage(previousPageUrl, {
          query,
          pageIndex: Math.max(0, listingPageIndex - 1),
        });
      setListingPage(previousPage);
      setListingResults(previousPage.items);
      setHasExecutedListing(true);
      setListingPageIndex((current) => Math.max(0, current - 1));
      setListingVisitedPageUrls((currentHistory) => {
        const nextHistory = [...currentHistory];
        nextHistory[listingPageIndex - 1] = previousPage.currentPageUrl;
        return nextHistory;
      });
      setRuntimeMessage(`Retour a la page ${listingPageIndex}.`);
      scrollToBrowserTop();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de revenir a la page precedente.');
    } finally {
      setLoading(false);
    }
  }, [
    fetchAuthorPage,
    fetchSearchPage,
    listingPageIndex,
    listingVisitedPageUrls,
    mode,
    query,
    scrollToBrowserTop,
    setHasExecutedListing,
    setListingPage,
    setListingPageIndex,
    setListingResults,
    setListingVisitedPageUrls,
    setLoading,
    setRuntimeError,
    setRuntimeMessage,
  ]);

  const handleOpenResult = useCallback((result: ScraperSearchResultItem) => {
    setRuntimeMessage(null);
    setRuntimeError(null);

    if (!result.detailUrl) {
      setRuntimeError('Ce resultat n\'expose pas de lien de fiche exploitable.');
      return;
    }

    if (!detailsConfig || !detailsConfig.titleSelector) {
      setRuntimeMessage('Pour ouvrir un resultat, configure d\'abord le composant `Fiche`.');
      return;
    }

    if (!isListingMode(mode)) {
      setRuntimeError('Aucune liste active n\'est disponible pour ouvrir cette fiche.');
      return;
    }

    const nextSearch = getRouteStateForNavigation({
      routeSearch: locationSearch,
      scraperId: scraper.id,
      nextMode: 'manga',
      sourceMode: mode,
      sourceQuery: query,
      sourcePageIndex: listingPageIndex,
      hasExecutedSourceListing: hasExecutedListing,
      mangaUrl: result.detailUrl,
    });

    navigate(
      {
        pathname: locationPathname,
        search: nextSearch,
      },
      {
        state: {
          ...(locationState ?? {}),
          scraperBrowserHistorySource: {
            kind: mode,
          },
        },
      },
    );
  }, [
    detailsConfig,
    hasExecutedListing,
    listingPageIndex,
    locationPathname,
    locationSearch,
    locationState,
    mode,
    navigate,
    query,
    scraper.id,
    setRuntimeError,
    setRuntimeMessage,
  ]);

  const handleOpenAuthorResult = useCallback((result: ScraperSearchResultItem) => {
    setRuntimeMessage(null);
    setRuntimeError(null);

    if (!result.authorUrl) {
      setRuntimeError('Ce resultat n\'expose pas de lien auteur exploitable.');
      return;
    }

    if (!authorConfig || !authorConfig.titleSelector || !authorConfig.resultItemSelector) {
      setRuntimeMessage('Pour ouvrir une page auteur, configure d\'abord le composant `Auteur`.');
      return;
    }

    setAuthorTemplateContext(null);

    const nextSearch = getRouteStateForNavigation({
      routeSearch: locationSearch,
      scraperId: scraper.id,
      nextMode: 'author',
      sourceMode: mode,
      sourceQuery: query,
      sourcePageIndex: listingPageIndex,
      hasExecutedSourceListing: hasExecutedListing,
      nextAuthorQuery: formatScraperValueForDisplay(result.authorUrl),
    });

    navigate(
      {
        pathname: locationPathname,
        search: nextSearch,
      },
      {
        state: {
          ...(locationState ?? {}),
          scraperBrowserHistorySource: {
            kind: mode,
          },
        },
      },
    );
  }, [
    authorConfig,
    hasExecutedListing,
    listingPageIndex,
    locationPathname,
    locationSearch,
    locationState,
    mode,
    navigate,
    query,
    scraper.id,
    setAuthorTemplateContext,
    setRuntimeError,
    setRuntimeMessage,
  ]);

  const handleResultKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLElement>,
    result: ScraperSearchResultItem,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    void handleOpenResult(result);
  }, [handleOpenResult]);

  const handleBackToListing = useCallback(async () => {
    if (!listingReturnState) {
      return;
    }

    setMode(listingReturnState.mode);
    setQuery(listingReturnState.query);
    resetDetailsState();
    clearFeedback();
    resetAsyncState();

    if (listingReturnState.page && listingReturnState.results.length > 0) {
      setListingPage(listingReturnState.page);
      setListingVisitedPageUrls(listingReturnState.visitedPageUrls);
      setListingPageIndex(listingReturnState.pageIndex);
      setListingResults(listingReturnState.results);
      setHasExecutedListing(listingReturnState.hasExecutedListing);
      setRuntimeMessage(`Retour a la ${getListingModeLabel(listingReturnState.mode)} precedente.`);
      restoreSearchScrollPosition(listingReturnState.scrollTop);
      return;
    }

    if (listingReturnState.hasExecutedListing) {
      const rerunLookup = listingReturnState.mode === 'author'
        ? runAuthorLookup
        : runSearchLookup;
      await rerunLookup(listingReturnState.query, {
        pageIndex: listingReturnState.pageIndex,
        preserveListingReturnState: true,
      });
      restoreSearchScrollPosition(listingReturnState.scrollTop);
      return;
    }

    resetListingState();
    setRuntimeMessage(null);
  }, [
    clearFeedback,
    listingReturnState,
    resetAsyncState,
    resetDetailsState,
    resetListingState,
    restoreSearchScrollPosition,
    runAuthorLookup,
    runSearchLookup,
    setHasExecutedListing,
    setListingPage,
    setListingPageIndex,
    setListingResults,
    setListingVisitedPageUrls,
    setMode,
    setQuery,
    setRuntimeMessage,
  ]);

  const handleGoToHome = useCallback(async () => {
    clearFeedback();
    resetAsyncState();
    setListingReturnState(null);

    if (!hasSearch) {
      setMode(defaultMode);
      setQuery('');
      resetDetailsState();
      resetListingState();
      setRuntimeMessage(null);
      return;
    }

    setMode('search');
    resetDetailsState();

    if (hasConfiguredHomeSearch) {
      setQuery(homeSearchQuery);
      await runSearchLookup(homeSearchQuery);
      return;
    }

    setQuery('');
    resetListingState();
    setRuntimeMessage(null);
  }, [
    clearFeedback,
    defaultMode,
    hasConfiguredHomeSearch,
    hasSearch,
    homeSearchQuery,
    resetAsyncState,
    resetDetailsState,
    resetListingState,
    runSearchLookup,
    setListingReturnState,
    setMode,
    setQuery,
    setRuntimeMessage,
  ]);

  const handleModeChange = useCallback(async (nextMode: ScraperBrowseMode) => {
    if (nextMode === mode) {
      return;
    }

    if (nextMode === 'search') {
      if (detailsResult && listingReturnState?.mode === 'search') {
        await handleBackToListing();
        return;
      }

      await handleGoToHome();
      return;
    }

    if (nextMode === 'author') {
      if (detailsResult && listingReturnState?.mode === 'author') {
        await handleBackToListing();
        return;
      }

      clearFeedback();
      resetAsyncState();
      resetDetailsState();
      resetListingState();
      setListingReturnState(null);
      setAuthorTemplateContext(null);
      setMode('author');
      setQuery('');
      return;
    }

    setMode(nextMode);
  }, [
    clearFeedback,
    detailsResult,
    handleBackToListing,
    handleGoToHome,
    listingReturnState,
    mode,
    resetAsyncState,
    resetDetailsState,
    resetListingState,
    setAuthorTemplateContext,
    setListingReturnState,
    setMode,
    setQuery,
  ]);

  return {
    runSearchLookup,
    runAuthorLookup,
    handleListingNextPage,
    handleListingPreviousPage,
    handleOpenResult,
    handleOpenAuthorResult,
    handleResultKeyDown,
    handleBackToListing,
    handleGoToHome,
    handleModeChange,
  };
}

export default useScraperBrowserSearch;
