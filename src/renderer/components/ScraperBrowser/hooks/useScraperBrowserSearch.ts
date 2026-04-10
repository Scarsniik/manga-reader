import React, { Dispatch, SetStateAction, useCallback } from 'react';
import {
  ScraperDetailsFeatureConfig,
  ScraperRecord,
  ScraperSearchFeatureConfig,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import {
  ScraperBrowseMode,
  ScraperSearchReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import {
  buildSearchPageLoadedMessage,
  buildSearchResultsMessage,
} from '@/renderer/components/ScraperBrowser/utils/scraperBrowserHelpers';
import {
  extractScraperSearchPageFromDocument,
  formatScraperValueForDisplay,
  resolveScraperSearchRequestConfig,
  resolveScraperSearchTargetUrl,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';

export type SearchLookupOptions = {
  pageIndex?: number;
  preserveSearchReturnState?: boolean;
};

type UseScraperBrowserSearchOptions = {
  scraper: ScraperRecord;
  query: string;
  mode: ScraperBrowseMode;
  defaultMode: ScraperBrowseMode;
  hasSearch: boolean;
  hasConfiguredHomeSearch: boolean;
  homeSearchQuery: string;
  searchConfig: ScraperSearchFeatureConfig | null;
  detailsConfig: ScraperDetailsFeatureConfig | null;
  canOpenSearchResultsAsDetails: boolean;
  usesSearchTemplatePaging: boolean;
  searchPage: ScraperRuntimeSearchPageResult | null;
  searchVisitedPageUrls: string[];
  searchPageIndex: number;
  searchResults: ScraperSearchResultItem[];
  hasExecutedSearch: boolean;
  searchReturnState: ScraperSearchReturnState | null;
  detailsResult: ScraperRuntimeDetailsResult | null;
  clearFeedback: () => void;
  resetSearchState: () => void;
  resetDetailsState: () => void;
  resetAsyncState: () => void;
  getCurrentScrollTop: () => number;
  restoreSearchScrollPosition: (scrollTop: number | null | undefined) => void;
  scrollToBrowserTop: () => void;
  setMode: Dispatch<SetStateAction<ScraperBrowseMode>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setSearchPage: Dispatch<SetStateAction<ScraperRuntimeSearchPageResult | null>>;
  setSearchVisitedPageUrls: Dispatch<SetStateAction<string[]>>;
  setSearchPageIndex: Dispatch<SetStateAction<number>>;
  setSearchResults: Dispatch<SetStateAction<ScraperSearchResultItem[]>>;
  setHasExecutedSearch: Dispatch<SetStateAction<boolean>>;
  setSearchReturnState: Dispatch<SetStateAction<ScraperSearchReturnState | null>>;
  setRuntimeMessage: Dispatch<SetStateAction<string | null>>;
  setRuntimeError: Dispatch<SetStateAction<string | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  loadDetailsFromTargetUrl: (targetUrl: string) => Promise<void>;
};

export function useScraperBrowserSearch({
  scraper,
  query,
  mode,
  defaultMode,
  hasSearch,
  hasConfiguredHomeSearch,
  homeSearchQuery,
  searchConfig,
  detailsConfig,
  canOpenSearchResultsAsDetails,
  usesSearchTemplatePaging,
  searchPage,
  searchVisitedPageUrls,
  searchPageIndex,
  searchResults,
  hasExecutedSearch,
  searchReturnState,
  detailsResult,
  clearFeedback,
  resetSearchState,
  resetDetailsState,
  resetAsyncState,
  getCurrentScrollTop,
  restoreSearchScrollPosition,
  scrollToBrowserTop,
  setMode,
  setQuery,
  setSearchPage,
  setSearchVisitedPageUrls,
  setSearchPageIndex,
  setSearchResults,
  setHasExecutedSearch,
  setSearchReturnState,
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
      const page = await fetchSearchPage(targetUrl, {
        query: nextQuery,
        pageIndex: normalizedTargetPageIndex,
      });
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
      {
        query: nextQuery,
        pageIndex: 0,
      },
    );
    const visitedPageUrls = [firstPage.currentPageUrl];
    let currentPage = firstPage;
    let currentPageIndex = 0;

    while (currentPageIndex < normalizedTargetPageIndex && currentPage.nextPageUrl) {
      const nextPage = await fetchSearchPage(currentPage.nextPageUrl, {
        query: nextQuery,
        pageIndex: currentPageIndex + 1,
      });
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
    options?: SearchLookupOptions,
  ) => {
    clearFeedback();
    resetDetailsState();
    resetSearchState();

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
      setRuntimeMessage(buildSearchResultsMessage({
        resultsCount: extractedResults.length,
        pageIndex: extractedSearchState.pageIndex,
        usesSearchTemplatePaging,
        hasNextPage: Boolean(extractedPage.nextPageUrl),
        canOpenSearchResultsAsDetails,
      }));
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Echec temporaire de la recherche.');
    } finally {
      setLoading(false);
    }
  }, [
    canOpenSearchResultsAsDetails,
    clearFeedback,
    loadSearchResultsPage,
    resetDetailsState,
    resetSearchState,
    searchConfig,
    setHasExecutedSearch,
    setLoading,
    setRuntimeError,
    setRuntimeMessage,
    setSearchPage,
    setSearchPageIndex,
    setSearchResults,
    setSearchReturnState,
    setSearchVisitedPageUrls,
    usesSearchTemplatePaging,
  ]);

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

      const nextPage = await fetchSearchPage(nextPageTargetUrl, {
        query,
        pageIndex: searchPageIndex + 1,
      });
      if (!nextPage.items.length) {
        setRuntimeMessage('Aucun resultat exploitable n\'a ete trouve sur la page suivante.');
        return;
      }

      setSearchPage(nextPage);
      setSearchResults(nextPage.items);
      setHasExecutedSearch(true);
      setSearchVisitedPageUrls((previous) => {
        const trimmedHistory = previous.slice(0, searchPageIndex + 1);
        return [...trimmedHistory, nextPage.currentPageUrl];
      });
      setSearchPageIndex((previous) => previous + 1);
      setRuntimeMessage(buildSearchPageLoadedMessage(
        searchPageIndex + 1,
        usesSearchTemplatePaging,
        Boolean(nextPage.nextPageUrl),
      ));
      scrollToBrowserTop();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de charger la page suivante.');
    } finally {
      setLoading(false);
    }
  }, [
    fetchSearchPage,
    query,
    scraper.baseUrl,
    scrollToBrowserTop,
    searchConfig,
    searchPage,
    searchPageIndex,
    setHasExecutedSearch,
    setLoading,
    setRuntimeError,
    setRuntimeMessage,
    setSearchPage,
    setSearchPageIndex,
    setSearchResults,
    setSearchVisitedPageUrls,
    usesSearchTemplatePaging,
  ]);

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
      const previousPage = await fetchSearchPage(previousPageUrl, {
        query,
        pageIndex: Math.max(0, searchPageIndex - 1),
      });
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
  }, [
    fetchSearchPage,
    query,
    scrollToBrowserTop,
    searchPageIndex,
    searchVisitedPageUrls,
    setHasExecutedSearch,
    setLoading,
    setRuntimeError,
    setRuntimeMessage,
    setSearchPage,
    setSearchPageIndex,
    setSearchResults,
    setSearchVisitedPageUrls,
  ]);

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
    hasExecutedSearch,
    loadDetailsFromTargetUrl,
    query,
    searchPage,
    searchPageIndex,
    searchResults,
    searchVisitedPageUrls,
    setMode,
    setQuery,
    setRuntimeError,
    setRuntimeMessage,
    setSearchReturnState,
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

  const handleBackToSearch = useCallback(async () => {
    if (!searchReturnState) {
      return;
    }

    setMode('search');
    setQuery(searchReturnState.query);
    resetDetailsState();
    clearFeedback();
    resetAsyncState();

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

    resetSearchState();
    setRuntimeMessage(null);
  }, [
    clearFeedback,
    resetAsyncState,
    resetDetailsState,
    resetSearchState,
    restoreSearchScrollPosition,
    runSearchLookup,
    searchReturnState,
    setHasExecutedSearch,
    setMode,
    setQuery,
    setRuntimeMessage,
    setSearchPage,
    setSearchPageIndex,
    setSearchResults,
    setSearchVisitedPageUrls,
  ]);

  const handleGoToHome = useCallback(async () => {
    clearFeedback();
    resetAsyncState();
    setSearchReturnState(null);

    if (!hasSearch) {
      setMode(defaultMode);
      setQuery('');
      resetDetailsState();
      resetSearchState();
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
    resetSearchState();
    setRuntimeMessage(null);
  }, [
    clearFeedback,
    defaultMode,
    hasConfiguredHomeSearch,
    hasSearch,
    homeSearchQuery,
    resetAsyncState,
    resetDetailsState,
    resetSearchState,
    runSearchLookup,
    setMode,
    setQuery,
    setRuntimeMessage,
    setSearchReturnState,
  ]);

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
    setMode,
  ]);

  return {
    runSearchLookup,
    handleSearchNextPage,
    handleSearchPreviousPage,
    handleOpenSearchResult,
    handleSearchResultKeyDown,
    handleBackToSearch,
    handleGoToHome,
    handleModeChange,
  };
}

export default useScraperBrowserSearch;
