import React, { Dispatch, SetStateAction, useCallback } from 'react';
import { NavigateFunction } from 'react-router-dom';
import {
  hasScraperFieldSelectorValue,
  ScraperAuthorFeatureConfig,
  ScraperDetailsFeatureConfig,
  ScraperHomepageFeatureConfig,
  ScraperRecord,
  ScraperSearchFeatureConfig,
  ScraperSearchResultItem,
  ScraperTagFeatureConfig,
} from '@/shared/scraper';
import {
  ScraperBrowseMode,
  ScraperBrowserLocationState,
  ScraperListingMode,
  ScraperListingReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import {
  buildSearchPageLoadedMessage,
} from '@/renderer/components/ScraperBrowser/utils/scraperBrowserHelpers';
import {
  buildScraperListingPaginationEndPage,
  enrichScraperSearchPageWithDetails,
  extractScraperSearchPageFromDocumentWithImageFallbacks,
  formatScraperValueForDisplay,
  hasAuthorPagePlaceholder,
  hasSearchPagePlaceholder,
  hasTagPagePlaceholder,
  isScraperListingPaginationEndError,
  resolveScraperAuthorTargetUrl,
  resolveScraperHomepageRequestConfig,
  resolveScraperHomepageTargetUrl,
  resolveScraperSearchRequestConfig,
  resolveScraperSearchTargetUrl,
  resolveScraperTagTargetUrl,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
  throwIfScraperListingPaginationEnded,
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

type OpenResultOptions = {
  listingReturnState?: ScraperListingReturnState | null;
};

type FetchListingPageOptions = {
  pageIndex?: number;
  query?: string;
  usesTemplatePaging?: boolean;
};

type UseScraperBrowserSearchOptions = {
  scraper: ScraperRecord;
  scrapeDetailsWithCards: boolean;
  routeSyncEnabled: boolean;
  locationPathname: string;
  locationSearch: string;
  locationState: ScraperBrowserLocationState | null;
  navigate: NavigateFunction;
  query: string;
  mode: ScraperBrowseMode;
  defaultMode: ScraperBrowseMode;
  hasHomepage: boolean;
  hasSearch: boolean;
  hasAuthor: boolean;
  hasTag: boolean;
  hasConfiguredHomeSearch: boolean;
  homeSearchQuery: string;
  homepageConfig: ScraperHomepageFeatureConfig | null;
  searchConfig: ScraperSearchFeatureConfig | null;
  authorConfig: ScraperAuthorFeatureConfig | null;
  tagConfig: ScraperTagFeatureConfig | null;
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
  value === 'homepage' || value === 'search' || value === 'author' || value === 'tag'
);

const getListingModeLabel = (mode: ScraperListingMode): string => (
  mode === 'author'
    ? 'page auteur'
    : mode === 'tag'
      ? 'page tag'
      : mode === 'homepage'
        ? 'homepage'
        : 'recherche'
);

const formatDuration = (durationMs: number): string => (
  durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(1)} s`
    : `${Math.max(0, Math.round(durationMs))} ms`
);

const buildCardDetailsScrapeMessage = (page: ScraperRuntimeSearchPageResult): string | null => {
  const stats = page.detailsScrape;
  if (!stats) {
    return null;
  }

  const suffixParts = [
    stats.failed ? `${stats.failed} echec(s)` : "",
    stats.skipped ? `${stats.skipped} sans lien fiche` : "",
  ].filter(Boolean);

  return [
    `POC fiches cards : ${stats.succeeded}/${stats.attempted} enrichie(s) en ${formatDuration(stats.durationMs)}`,
    suffixParts.length ? `(${suffixParts.join(", ")})` : "",
  ].filter(Boolean).join(" ");
};

const getRouteStateForNavigation = (options: {
  routeSearch: string;
  scraperId: string;
  nextMode: ScraperBrowseMode;
  sourceMode: ScraperBrowseMode;
  sourceQuery: string;
  sourcePageIndex: number;
  hasExecutedSourceListing: boolean;
  nextAuthorQuery?: string;
  nextTagQuery?: string;
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
    nextTagQuery,
    mangaUrl,
  } = options;
  const currentRouteState = parseScraperRouteState(routeSearch);
  const currentPage = Math.max(1, sourcePageIndex + 1);
  const persistedHomepageState = sourceMode === 'homepage'
    ? {
      active: hasExecutedSourceListing,
      page: currentPage,
    }
    : {
      active: Boolean(currentRouteState.homepageActive),
      page: currentRouteState.homepagePage ?? 1,
    };
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
  const persistedTagState = sourceMode === 'tag'
    ? {
      active: hasExecutedSourceListing,
      query: sourceQuery,
      page: currentPage,
    }
    : {
      active: currentRouteState.tagActive,
      query: currentRouteState.tagQuery ?? '',
      page: currentRouteState.tagPage ?? 1,
    };
  const persistedTagListQuery = sourceMode === 'tagList'
    ? sourceQuery
    : currentRouteState.tagListQuery ?? '';

  return writeScraperRouteState(routeSearch, {
    scraperId,
    mode: nextMode,
    homepageActive: persistedHomepageState.active,
    homepagePage: persistedHomepageState.page,
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
    tagActive: nextMode === 'tag'
      ? true
      : persistedTagState.active,
    tagQuery: nextMode === 'tag'
      ? (nextTagQuery ?? '')
      : persistedTagState.query,
    tagPage: nextMode === 'tag'
      ? 1
      : persistedTagState.page,
    tagListQuery: nextMode === 'tagList' ? sourceQuery : persistedTagListQuery,
    mangaQuery: '',
    mangaUrl,
  });
};

export function useScraperBrowserSearch({
  scraper,
  scrapeDetailsWithCards,
  routeSyncEnabled,
  locationPathname,
  locationSearch,
  locationState,
  navigate,
  query,
  mode,
  defaultMode,
  hasHomepage,
  hasSearch,
  hasAuthor,
  hasTag,
  hasConfiguredHomeSearch,
  homeSearchQuery,
  homepageConfig,
  searchConfig,
  authorConfig,
  tagConfig,
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
  const fetchHomepagePage = useCallback(async (
    targetUrl: string,
    options?: FetchListingPageOptions,
  ): Promise<ScraperRuntimeSearchPageResult> => {
    if (
      !homepageConfig?.urlTemplate
      || !homepageConfig.resultItemSelector
      || !hasScraperFieldSelectorValue(homepageConfig.titleSelector)
    ) {
      throw new Error('Le composant Homepage n\'est pas encore suffisamment configure pour etre execute.');
    }

    const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
    if (typeof fetchScraperDocument !== 'function') {
      throw new Error('Le runtime du scrapper n\'est pas disponible dans cette version.');
    }

    const documentResult = await fetchScraperDocument({
      baseUrl: scraper.baseUrl,
      targetUrl,
      requestConfig: resolveScraperHomepageRequestConfig(homepageConfig, {
        pageIndex: options?.pageIndex ?? 0,
      }),
    });

    if (!documentResult?.ok || !documentResult.html) {
      throwIfScraperListingPaginationEnded(documentResult, {
        pageIndex: options?.pageIndex ?? 0,
        targetUrl,
        usesTemplatePaging: Boolean(options?.usesTemplatePaging),
      });

      throw new Error(
        documentResult?.error
          || (typeof documentResult?.status === 'number'
            ? `La homepage a repondu avec le code HTTP ${documentResult.status}.`
            : 'Impossible de charger la homepage.'),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(documentResult.html, 'text/html');
    const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(documentNode, homepageConfig, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    }, async (request) => fetchScraperDocument(request));

    return enrichScraperSearchPageWithDetails(page, {
      enabled: scrapeDetailsWithCards,
      scraper,
      detailsConfig,
      fetchDocument: async (request) => fetchScraperDocument(request),
    });
  }, [detailsConfig, homepageConfig, scrapeDetailsWithCards, scraper]);

  const fetchSearchPage = useCallback(async (
    targetUrl: string,
    options?: FetchListingPageOptions,
  ): Promise<ScraperRuntimeSearchPageResult> => {
    if (
      !searchConfig?.urlTemplate
      || !searchConfig.resultItemSelector
      || !hasScraperFieldSelectorValue(searchConfig.titleSelector)
    ) {
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
      throwIfScraperListingPaginationEnded(documentResult, {
        pageIndex: options?.pageIndex ?? 0,
        targetUrl,
        usesTemplatePaging: Boolean(options?.usesTemplatePaging),
      });

      throw new Error(
        documentResult?.error
          || (typeof documentResult?.status === 'number'
            ? `La recherche a repondu avec le code HTTP ${documentResult.status}.`
            : 'Impossible de charger la page de recherche.'),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(documentResult.html, 'text/html');
    const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(documentNode, searchConfig, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    }, async (request) => fetchScraperDocument(request));

    return enrichScraperSearchPageWithDetails(page, {
      enabled: scrapeDetailsWithCards,
      scraper,
      detailsConfig,
      fetchDocument: async (request) => fetchScraperDocument(request),
    });
  }, [detailsConfig, scraper, scrapeDetailsWithCards, searchConfig]);

  const fetchAuthorPage = useCallback(async (
    targetUrl: string,
    options?: FetchListingPageOptions,
  ): Promise<ScraperRuntimeSearchPageResult> => {
    if (!authorConfig?.resultItemSelector || !hasScraperFieldSelectorValue(authorConfig.titleSelector)) {
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
      throwIfScraperListingPaginationEnded(documentResult, {
        pageIndex: options?.pageIndex ?? 0,
        targetUrl,
        usesTemplatePaging: Boolean(options?.usesTemplatePaging),
      });

      throw new Error(
        documentResult?.error
          || (typeof documentResult?.status === 'number'
            ? `La page auteur a repondu avec le code HTTP ${documentResult.status}.`
            : 'Impossible de charger la page auteur.'),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(documentResult.html, 'text/html');
    const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(documentNode, authorConfig, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    }, async (request) => fetchScraperDocument(request));

    return enrichScraperSearchPageWithDetails(page, {
      enabled: scrapeDetailsWithCards,
      scraper,
      detailsConfig,
      fetchDocument: async (request) => fetchScraperDocument(request),
    });
  }, [authorConfig, detailsConfig, scraper, scrapeDetailsWithCards]);

  const fetchTagPage = useCallback(async (
    targetUrl: string,
    options?: FetchListingPageOptions,
  ): Promise<ScraperRuntimeSearchPageResult> => {
    if (!tagConfig?.resultItemSelector || !hasScraperFieldSelectorValue(tagConfig.titleSelector)) {
      throw new Error('Le composant Tag n\'est pas encore suffisamment configure pour etre execute.');
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
      throwIfScraperListingPaginationEnded(documentResult, {
        pageIndex: options?.pageIndex ?? 0,
        targetUrl,
        usesTemplatePaging: Boolean(options?.usesTemplatePaging),
      });

      throw new Error(
        documentResult?.error
          || (typeof documentResult?.status === 'number'
            ? `La page tag a repondu avec le code HTTP ${documentResult.status}.`
            : 'Impossible de charger la page tag.'),
      );
    }

    const parser = new DOMParser();
    const documentNode = parser.parseFromString(documentResult.html, 'text/html');
    const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(documentNode, tagConfig, {
      requestedUrl: documentResult.requestedUrl,
      finalUrl: documentResult.finalUrl,
    }, async (request) => fetchScraperDocument(request));

    return enrichScraperSearchPageWithDetails(page, {
      enabled: scrapeDetailsWithCards,
      scraper,
      detailsConfig,
      fetchDocument: async (request) => fetchScraperDocument(request),
    });
  }, [detailsConfig, scraper, scrapeDetailsWithCards, tagConfig]);

  const getUsesTemplatePaging = useCallback((listingMode: ScraperListingMode): boolean => (
    listingMode === 'author'
      ? hasAuthorPagePlaceholder(authorConfig)
      : listingMode === 'tag'
        ? hasTagPagePlaceholder(tagConfig)
      : listingMode === 'homepage'
        ? hasSearchPagePlaceholder(homepageConfig)
      : hasSearchPagePlaceholder(searchConfig)
  ), [authorConfig, homepageConfig, searchConfig, tagConfig]);

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
      pageUsesTemplatePaging: boolean,
    ): Promise<ScraperRuntimeSearchPageResult> => (
      listingMode === 'author'
        ? fetchAuthorPage(targetUrl, { pageIndex, usesTemplatePaging: pageUsesTemplatePaging })
        : listingMode === 'tag'
          ? fetchTagPage(targetUrl, { pageIndex, usesTemplatePaging: pageUsesTemplatePaging })
        : listingMode === 'homepage'
          ? fetchHomepagePage(targetUrl, { pageIndex, usesTemplatePaging: pageUsesTemplatePaging })
        : fetchSearchPage(targetUrl, {
          query: nextQuery,
          pageIndex,
          usesTemplatePaging: pageUsesTemplatePaging,
        })
    );

    const resolveTargetUrl = (pageIndex: number): string => (
      listingMode === 'author'
        ? resolveScraperAuthorTargetUrl(scraper.baseUrl, authorConfig!, nextQuery, {
          pageIndex,
          templateContext: templateContextOverride ?? authorTemplateContext ?? undefined,
        })
        : listingMode === 'tag'
          ? resolveScraperTagTargetUrl(scraper.baseUrl, tagConfig!, nextQuery, { pageIndex })
        : listingMode === 'homepage'
          ? resolveScraperHomepageTargetUrl(scraper.baseUrl, homepageConfig!, { pageIndex })
        : resolveScraperSearchTargetUrl(scraper.baseUrl, searchConfig!, nextQuery, { pageIndex })
    );

    if (usesTemplatePaging) {
      const targetUrl = resolveTargetUrl(normalizedTargetPageIndex);
      const visitedPageUrls = Array.from({ length: normalizedTargetPageIndex + 1 }, (_, index) => (
        resolveTargetUrl(index)
      ));
      let page: ScraperRuntimeSearchPageResult;

      try {
        page = await fetchPage(targetUrl, normalizedTargetPageIndex, true);
      } catch (error) {
        if (!isScraperListingPaginationEndError(error)) {
          throw error;
        }

        page = buildScraperListingPaginationEndPage(error);
      }

      return {
        page,
        visitedPageUrls,
        pageIndex: normalizedTargetPageIndex,
        items: page.items,
      };
    }

    const firstPage = await fetchPage(resolveTargetUrl(0), 0, false);
    const visitedPageUrls = [firstPage.currentPageUrl];
    let currentPage = firstPage;
    let currentPageIndex = 0;

    while (currentPageIndex < normalizedTargetPageIndex && currentPage.nextPageUrl) {
      const nextPage = await fetchPage(currentPage.nextPageUrl, currentPageIndex + 1, false);
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
  }, [
    authorConfig,
    authorTemplateContext,
    fetchAuthorPage,
    fetchHomepagePage,
    fetchSearchPage,
    fetchTagPage,
    getUsesTemplatePaging,
    homepageConfig,
    scraper.baseUrl,
    searchConfig,
    tagConfig,
  ]);

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

    if (listingMode === 'homepage') {
      if (
        !homepageConfig?.urlTemplate
        || !homepageConfig.resultItemSelector
        || !hasScraperFieldSelectorValue(homepageConfig.titleSelector)
      ) {
        setRuntimeError('Le composant Homepage n\'est pas encore suffisamment configure pour etre execute.');
        return;
      }
    } else if (listingMode === 'search') {
      if (
        !searchConfig?.urlTemplate
        || !searchConfig.resultItemSelector
        || !hasScraperFieldSelectorValue(searchConfig.titleSelector)
      ) {
        setRuntimeError('Le composant Recherche n\'est pas encore suffisamment configure pour etre execute.');
        return;
      }
    } else if (!authorConfig?.resultItemSelector || !hasScraperFieldSelectorValue(authorConfig.titleSelector)) {
      if (listingMode === 'author') {
        setRuntimeError('Le composant Auteur n\'est pas encore suffisamment configure pour etre execute.');
        return;
      }
    }

    if (listingMode === 'tag' && (!tagConfig?.resultItemSelector || !hasScraperFieldSelectorValue(tagConfig.titleSelector))) {
      setRuntimeError('Le composant Tag n\'est pas encore suffisamment configure pour etre execute.');
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
            : listingMode === 'tag'
              ? 'La page tag a bien ete chargee, mais aucune card exploitable n\'a ete extraite avec la configuration actuelle.'
            : listingMode === 'homepage'
              ? 'La homepage a bien ete chargee, mais aucune card exploitable n\'a ete extraite avec la configuration actuelle.'
              : 'La recherche a bien ete lancee, mais aucun resultat exploitable n\'a ete extrait avec la configuration actuelle.',
        );
        return;
      }

      setListingPage(extractedPage);
      setListingVisitedPageUrls(extractedListingState.visitedPageUrls);
      setListingPageIndex(extractedListingState.pageIndex);
      setListingResults(extractedResults);
      setRuntimeMessage(buildCardDetailsScrapeMessage(extractedPage));
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
    homepageConfig,
    loadListingResultsPage,
    resetDetailsState,
    resetListingState,
    searchConfig,
    tagConfig,
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

  const runHomepageLookup = useCallback(async (
    options?: ListingLookupOptions,
  ) => {
    await runListingLookup('homepage', '', options);
  }, [runListingLookup]);

  const runAuthorLookup = useCallback(async (
    nextQuery: string,
    options?: ListingLookupOptions,
  ) => {
    await runListingLookup('author', nextQuery, options);
  }, [runListingLookup]);

  const runTagLookup = useCallback(async (
    nextQuery: string,
    options?: ListingLookupOptions,
  ) => {
    await runListingLookup('tag', nextQuery, options);
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
        : mode === 'tag'
          ? resolveScraperTagTargetUrl(scraper.baseUrl, tagConfig!, query, {
            pageIndex: nextPageIndex,
          })
        : mode === 'homepage'
          ? resolveScraperHomepageTargetUrl(scraper.baseUrl, homepageConfig!, {
            pageIndex: nextPageIndex,
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
      const nextPageOptions = {
        pageIndex: nextPageIndex,
        usesTemplatePaging,
      };
      const nextPage = mode === 'author'
        ? await fetchAuthorPage(nextPageTargetUrl, nextPageOptions)
        : mode === 'tag'
          ? await fetchTagPage(nextPageTargetUrl, nextPageOptions)
        : mode === 'homepage'
          ? await fetchHomepagePage(nextPageTargetUrl, nextPageOptions)
        : await fetchSearchPage(nextPageTargetUrl, {
          query,
          pageIndex: nextPageIndex,
          usesTemplatePaging,
        });
      if (!nextPage.items.length) {
        setRuntimeMessage(
          mode === 'author'
            ? 'Aucune card exploitable n\'a ete trouvee sur la page auteur suivante.'
            : mode === 'tag'
              ? 'Aucune card exploitable n\'a ete trouvee sur la page tag suivante.'
            : mode === 'homepage'
              ? 'Aucune card exploitable n\'a ete trouvee sur la page homepage suivante.'
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
      setRuntimeMessage([
        buildSearchPageLoadedMessage(
          nextPageIndex,
          usesTemplatePaging,
          Boolean(nextPage.nextPageUrl),
          getListingModeLabel(mode),
        ),
        buildCardDetailsScrapeMessage(nextPage),
      ].filter(Boolean).join(" "));
      scrollToBrowserTop();
    } catch (error) {
      if (isScraperListingPaginationEndError(error)) {
        setRuntimeMessage('Aucune page suivante disponible.');
        return;
      }

      setRuntimeError(error instanceof Error ? error.message : 'Impossible de charger la page suivante.');
    } finally {
      setLoading(false);
    }
  }, [
    authorConfig,
    authorTemplateContext,
    fetchAuthorPage,
    fetchHomepagePage,
    fetchSearchPage,
    fetchTagPage,
    getUsesTemplatePaging,
    listingPage,
    listingPageIndex,
    mode,
    query,
    scraper.baseUrl,
    scrollToBrowserTop,
    searchConfig,
    tagConfig,
    homepageConfig,
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
        : mode === 'tag'
          ? await fetchTagPage(previousPageUrl)
        : mode === 'homepage'
          ? await fetchHomepagePage(previousPageUrl, {
            pageIndex: Math.max(0, listingPageIndex - 1),
          })
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
      setRuntimeMessage([
        `Retour a la page ${listingPageIndex}.`,
        buildCardDetailsScrapeMessage(previousPage),
      ].filter(Boolean).join(" "));
      scrollToBrowserTop();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de revenir a la page precedente.');
    } finally {
      setLoading(false);
    }
  }, [
    fetchAuthorPage,
    fetchHomepagePage,
    fetchSearchPage,
    fetchTagPage,
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

  const handleOpenResult = useCallback((result: ScraperSearchResultItem, options?: OpenResultOptions) => {
    setRuntimeMessage(null);
    setRuntimeError(null);

    if (!result.detailUrl) {
      setRuntimeError('Ce resultat n\'expose pas de lien de fiche exploitable.');
      return;
    }

    if (!detailsConfig || !hasScraperFieldSelectorValue(detailsConfig.titleSelector)) {
      setRuntimeMessage('Pour ouvrir un resultat, configure d\'abord le composant `Fiche`.');
      return;
    }

    if (!isListingMode(mode)) {
      setRuntimeError('Aucune liste active n\'est disponible pour ouvrir cette fiche.');
      return;
    }

    if (!routeSyncEnabled) {
      const nextListingReturnState = options?.listingReturnState ?? null;
      setListingReturnState(nextListingReturnState);
      setMode('manga');
      setQuery(formatScraperValueForDisplay(result.detailUrl));
      void loadDetailsFromTargetUrl(result.detailUrl).finally(() => {
        setListingReturnState(nextListingReturnState);
      });
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
          scraperBrowserListingReturnState: options?.listingReturnState ?? null,
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
    routeSyncEnabled,
    scraper.id,
    setListingReturnState,
    setMode,
    setQuery,
    setRuntimeError,
    setRuntimeMessage,
    loadDetailsFromTargetUrl,
  ]);

  const handleOpenAuthorResult = useCallback((result: ScraperSearchResultItem) => {
    setRuntimeMessage(null);
    setRuntimeError(null);

    if (!result.authorUrl) {
      setRuntimeError('Ce resultat n\'expose pas de lien auteur exploitable.');
      return;
    }

    if (
      !authorConfig
      || !hasScraperFieldSelectorValue(authorConfig.titleSelector)
      || !authorConfig.resultItemSelector
    ) {
      setRuntimeMessage('Pour ouvrir une page auteur, configure d\'abord le composant `Auteur`.');
      return;
    }

    setAuthorTemplateContext(null);

    if (!routeSyncEnabled) {
      const nextAuthorQuery = formatScraperValueForDisplay(result.authorUrl);
      setMode('author');
      setQuery(nextAuthorQuery);
      void runAuthorLookup(nextAuthorQuery, { templateContext: null });
      return;
    }

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
    routeSyncEnabled,
    runAuthorLookup,
    scraper.id,
    setAuthorTemplateContext,
    setMode,
    setQuery,
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
      if (listingReturnState.mode === 'homepage') {
        await runHomepageLookup({
          pageIndex: listingReturnState.pageIndex,
          preserveListingReturnState: true,
        });
        restoreSearchScrollPosition(listingReturnState.scrollTop);
        return;
      }

      const rerunLookup = listingReturnState.mode === 'author'
        ? runAuthorLookup
        : listingReturnState.mode === 'tag'
          ? runTagLookup
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
    runHomepageLookup,
    runSearchLookup,
    runTagLookup,
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

    if (hasHomepage) {
      setMode('homepage');
      setQuery('');
      resetDetailsState();
      await runHomepageLookup();
      return;
    }

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
    hasHomepage,
    hasSearch,
    homeSearchQuery,
    resetAsyncState,
    resetDetailsState,
    resetListingState,
    runHomepageLookup,
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

    if (nextMode === 'homepage') {
      if (detailsResult && listingReturnState?.mode === 'homepage') {
        await handleBackToListing();
        return;
      }

      clearFeedback();
      resetAsyncState();
      resetDetailsState();
      setListingReturnState(null);
      setMode('homepage');
      setQuery('');
      await runHomepageLookup();
      return;
    }

    if (nextMode === 'search') {
      if (detailsResult && listingReturnState?.mode === 'search') {
        await handleBackToListing();
        return;
      }

      clearFeedback();
      resetAsyncState();
      resetDetailsState();
      resetListingState();
      setListingReturnState(null);
      setMode('search');

      if (hasConfiguredHomeSearch) {
        setQuery(homeSearchQuery);
        await runSearchLookup(homeSearchQuery);
        return;
      }

      setQuery('');
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

    if (nextMode === 'tag') {
      if (detailsResult && listingReturnState?.mode === 'tag') {
        await handleBackToListing();
        return;
      }

      clearFeedback();
      resetAsyncState();
      resetDetailsState();
      resetListingState();
      setListingReturnState(null);
      setMode('tag');
      setQuery('');
      return;
    }

    if (nextMode === 'tagList') {
      clearFeedback();
      resetAsyncState();
      resetDetailsState();
      resetListingState();
      setListingReturnState(null);
      setMode('tagList');
      setQuery('');
      return;
    }

    setMode(nextMode);
  }, [
    clearFeedback,
    detailsResult,
    handleBackToListing,
    handleGoToHome,
    hasConfiguredHomeSearch,
    homeSearchQuery,
    listingReturnState,
    mode,
    resetAsyncState,
    resetDetailsState,
    resetListingState,
    setAuthorTemplateContext,
    setListingReturnState,
    setMode,
    setQuery,
    runHomepageLookup,
    runSearchLookup,
  ]);

  return {
    runHomepageLookup,
    runSearchLookup,
    runAuthorLookup,
    runTagLookup,
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
