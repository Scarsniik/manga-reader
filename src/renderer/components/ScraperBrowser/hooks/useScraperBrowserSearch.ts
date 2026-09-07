import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { NavigateFunction } from 'react-router-dom';
import {
  hasScraperFieldSelectorValue,
  ScraperAuthorFeatureConfig,
  ScraperDetailsFeatureConfig,
  ScraperHomepageFeatureConfig,
  ScraperRecord,
  ScraperSearchFeatureConfig,
  ScraperSearchResultItem,
  ScraperSourceFeatureConfig,
  ScraperTagFeatureConfig,
} from '@/shared/scraper';
import {
  ScraperBrowseMode,
  ScraperBrowserLocationState,
  ScraperBrowserLoadingStatus,
  ScraperListingMode,
  ScraperListingReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import {
  buildSearchPageLoadedMessage,
} from '@/renderer/components/ScraperBrowser/utils/scraperBrowserHelpers';
import {
  buildScraperListingPaginationEndPage,
  createScraperCardDetailsCache,
  fetchResolvedScraperListingPage,
  formatScraperValueForDisplay,
  hasAuthorPagePlaceholder,
  hasSearchPagePlaceholder,
  hasSourcePagePlaceholder,
  hasTagPagePlaceholder,
  isScraperListingPaginationEndError,
  resolveScraperAuthorTargetUrl,
  resolveScraperHomepageRequestConfig,
  resolveScraperHomepageTargetUrl,
  resolveScraperSearchRequestConfig,
  resolveScraperSearchTargetUrl,
  resolveScraperSourceTargetUrl,
  resolveScraperTagTargetUrl,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
  type ScraperListingPageProgress,
} from '@/renderer/utils/scraperRuntime';
import {
  parseScraperRouteState,
  writeScraperRouteState,
} from '@/renderer/utils/scraperBrowserNavigation';
import type { ScraperTemplateContext } from '@/renderer/utils/scraperTemplateContext';
import type { BackgroundListingRun } from '@/renderer/backgroundSearch/types';
import { runScraperAuthorSearchEngine } from '@/renderer/searchEngines/listingSearchEngine';
import { buildScraperAuthorListingSearchInput } from '@/renderer/searchEngines/authorListingSearchInput';

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
  authorOriginalOnly: boolean;
  scrapingConcurrency: number;
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
  hasSource: boolean;
  hasConfiguredHomeSearch: boolean;
  homeSearchQuery: string;
  homepageConfig: ScraperHomepageFeatureConfig | null;
  searchConfig: ScraperSearchFeatureConfig | null;
  authorConfig: ScraperAuthorFeatureConfig | null;
  tagConfig: ScraperTagFeatureConfig | null;
  sourceConfig: ScraperSourceFeatureConfig | null;
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
  setLoadingStatus: Dispatch<SetStateAction<ScraperBrowserLoadingStatus | null>>;
  loadDetailsFromTargetUrl: (targetUrl: string) => Promise<void>;
};

const isListingMode = (value: ScraperBrowseMode): value is ScraperListingMode => (
  value === 'homepage' || value === 'search' || value === 'author' || value === 'tag' || value === 'source'
);

const getListingModeLabel = (mode: ScraperListingMode): string => (
  mode === 'author'
    ? 'page auteur'
    : mode === 'tag'
      ? 'page tag'
      : mode === 'source'
        ? 'page source'
      : mode === 'homepage'
        ? 'homepage'
        : 'recherche'
);

const buildListingLoadingStatus = (
  mode: ScraperListingMode,
  progress: ScraperListingPageProgress,
): ScraperBrowserLoadingStatus => {
  if (progress.phase === "extracting") {
    return {
      title: "Extraction des cards",
      detail: `Analyse du HTML de la ${getListingModeLabel(mode)}.`,
    };
  }

  if (progress.phase === "enriching") {
    return {
      title: "Enrichissement des fiches",
      detail: "Les cards ne contiennent pas toutes les metadonnees. Scaramanga ouvre chaque fiche pour les completer.",
      completed: progress.completed,
      total: progress.total,
    };
  }

  return {
    title: `Chargement de la ${getListingModeLabel(mode)}`,
    detail: "Recuperation de la page depuis le site source.",
  };
};

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
  nextSourceQuery?: string;
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
    nextSourceQuery,
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
  const persistedSourceState = sourceMode === 'source'
    ? {
      active: hasExecutedSourceListing,
      query: sourceQuery,
      page: currentPage,
    }
    : {
      active: currentRouteState.sourceActive,
      query: currentRouteState.sourceQuery ?? '',
      page: currentRouteState.sourcePage ?? 1,
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
    sourceActive: nextMode === 'source'
      ? true
      : persistedSourceState.active,
    sourceQuery: nextMode === 'source'
      ? (nextSourceQuery ?? '')
      : persistedSourceState.query,
    sourcePage: nextMode === 'source'
      ? 1
      : persistedSourceState.page,
    tagListQuery: nextMode === 'tagList' ? sourceQuery : persistedTagListQuery,
    mangaQuery: '',
    mangaUrl,
  });
};

export function useScraperBrowserSearch({
  scraper,
  scrapeDetailsWithCards,
  authorOriginalOnly,
  scrapingConcurrency,
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
  hasSource,
  hasConfiguredHomeSearch,
  homeSearchQuery,
  homepageConfig,
  searchConfig,
  authorConfig,
  tagConfig,
  sourceConfig,
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
  setLoadingStatus,
  loadDetailsFromTargetUrl,
}: UseScraperBrowserSearchOptions) {
  const authorEngineRunRef = useRef<BackgroundListingRun | null>(null);
  const authorEnginePageUrlsRef = useRef(new Map<number, string>());
  const authorEngineAbortControllerRef = useRef<AbortController | null>(null);
  const authorDetailsCacheRef = useRef(createScraperCardDetailsCache());
  const authorEngineOriginalOnlyRef = useRef(authorOriginalOnly);

  const handleListingProgress = useCallback((
    listingMode: ScraperListingMode,
    progress: ScraperListingPageProgress,
  ) => {
    setLoadingStatus(buildListingLoadingStatus(listingMode, progress));
  }, [setLoadingStatus]);

  useEffect(() => () => authorEngineAbortControllerRef.current?.abort(), []);
  const fetchListingPage = useCallback(async (
    listingMode: ScraperListingMode,
    targetUrl: string,
    options?: FetchListingPageOptions,
  ): Promise<ScraperRuntimeSearchPageResult> => {
    const config = listingMode === 'homepage'
      ? homepageConfig
      : listingMode === 'search'
        ? searchConfig
        : listingMode === 'author'
          ? authorConfig
          : listingMode === 'tag'
            ? tagConfig
            : sourceConfig;
    if (!config?.resultItemSelector || !hasScraperFieldSelectorValue(config.titleSelector)) {
      throw new Error(`Le composant ${getListingModeLabel(listingMode)} n'est pas encore suffisamment configure pour etre execute.`);
    }
    const pageIndex = options?.pageIndex ?? 0;
    const requestConfig = listingMode === 'homepage'
      ? resolveScraperHomepageRequestConfig(config as ScraperHomepageFeatureConfig, { pageIndex })
      : listingMode === 'search'
        ? resolveScraperSearchRequestConfig(
          config as ScraperSearchFeatureConfig,
          options?.query || '',
          { pageIndex },
        )
        : undefined;
    const responseLabel = listingMode === 'homepage'
      ? 'La homepage'
      : listingMode === 'search'
        ? 'La recherche'
        : `La page ${getListingModeLabel(listingMode).replace('page ', '')}`;
    return fetchResolvedScraperListingPage({
      scraper,
      config,
      targetUrl,
      pageIndex,
      usesTemplatePaging: Boolean(options?.usesTemplatePaging),
      requestConfig,
      responseLabel,
      failureMessage: listingMode === 'homepage'
        ? 'Impossible de charger la homepage.'
        : `Impossible de charger la ${getListingModeLabel(listingMode)}.`,
      scrapeDetailsWithCards,
      onProgress: (progress) => handleListingProgress(listingMode, progress),
    });
  }, [
    authorConfig,
    handleListingProgress,
    homepageConfig,
    scrapeDetailsWithCards,
    scraper,
    searchConfig,
    sourceConfig,
    tagConfig,
  ]);

  const getUsesTemplatePaging = useCallback((listingMode: ScraperListingMode): boolean => (
    listingMode === 'author'
      ? hasAuthorPagePlaceholder(authorConfig)
      : listingMode === 'tag'
        ? hasTagPagePlaceholder(tagConfig)
      : listingMode === 'source'
        ? hasSourcePagePlaceholder(sourceConfig)
      : listingMode === 'homepage'
        ? hasSearchPagePlaceholder(homepageConfig)
      : hasSearchPagePlaceholder(searchConfig)
  ), [authorConfig, homepageConfig, searchConfig, sourceConfig, tagConfig]);

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
      fetchListingPage(listingMode, targetUrl, {
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
        : listingMode === 'source'
          ? resolveScraperSourceTargetUrl(scraper.baseUrl, sourceConfig!, nextQuery, { pageIndex })
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
    fetchListingPage,
    getUsesTemplatePaging,
    homepageConfig,
    scraper.baseUrl,
    searchConfig,
    sourceConfig,
    tagConfig,
  ]);

  const loadAuthorResultsWithCommonEngine = useCallback(async (
    nextQuery: string,
    targetPageIndex: number,
    templateContext: ScraperTemplateContext | null,
    canCommit: () => boolean,
    forceReset = false,
  ): Promise<{
    page: ScraperRuntimeSearchPageResult;
    visitedPageUrls: string[];
    pageIndex: number;
    items: ScraperSearchResultItem[];
  }> => {
    const normalizedTargetPageIndex = Math.max(0, Math.floor(targetPageIndex));
    const sourceKey = `${scraper.id}::${nextQuery}`;
    const currentRun = !forceReset
      && authorEngineOriginalOnlyRef.current === authorOriginalOnly
      && authorEngineRunRef.current?.key === sourceKey
      ? authorEngineRunRef.current
      : null;

    if (currentRun && normalizedTargetPageIndex < currentRun.loadedPages) {
      const items = currentRun.results
        .filter((source) => source.pageIndex === normalizedTargetPageIndex)
        .map((source) => source.result);
      const currentPageUrl = authorEnginePageUrlsRef.current.get(normalizedTargetPageIndex)
        ?? currentRun.currentPageUrl
        ?? nextQuery;
      return {
        page: {
          currentPageUrl,
          nextPageUrl: authorEnginePageUrlsRef.current.get(normalizedTargetPageIndex + 1)
            ?? (normalizedTargetPageIndex === currentRun.loadedPages - 1
              ? currentRun.nextPageUrl
              : undefined),
          authorNames: [nextQuery],
          items,
        },
        visitedPageUrls: Array.from(
          { length: currentRun.loadedPages },
          (_value, index) => authorEnginePageUrlsRef.current.get(index) ?? currentPageUrl,
        ),
        pageIndex: normalizedTargetPageIndex,
        items,
      };
    }

    authorEngineAbortControllerRef.current?.abort();
    const controller = new AbortController();
    authorEngineAbortControllerRef.current = controller;
    if (!currentRun) {
      authorEngineOriginalOnlyRef.current = authorOriginalOnly;
      authorEnginePageUrlsRef.current = new Map();
      authorDetailsCacheRef.current = createScraperCardDetailsCache();
    }
    const pageCount = currentRun
      ? Math.max(1, normalizedTargetPageIndex + 1 - currentRun.loadedPages)
      : normalizedTargetPageIndex + 1;
    const input = buildScraperAuthorListingSearchInput(scraper, nextQuery, {
      maxPages: pageCount,
      concurrency: scrapingConcurrency,
      scrapeDetailsWithCards,
      originalOnly: authorOriginalOnly,
      templateContext,
    });
    const result = await runScraperAuthorSearchEngine(
      input,
      controller.signal,
      async (snapshot) => {
        if (!canCommit()) {
          controller.abort();
          return;
        }
        const snapshotRun = snapshot.runs[0];
        if (!snapshotRun) return;
        authorEngineRunRef.current = snapshotRun;
        if (snapshotRun.currentPageUrl && snapshotRun.loadedPages > 0) {
          authorEnginePageUrlsRef.current.set(snapshotRun.loadedPages - 1, snapshotRun.currentPageUrl);
        }
      },
      {
        initialRuns: currentRun ? [currentRun] : undefined,
        detailsCache: authorDetailsCacheRef.current,
      },
    );
    const run = result.runs[0];
    if (!run) throw new Error('La recherche auteur ne contient aucune source exploitable.');
    authorEngineRunRef.current = run;
    if (run.status === 'error') throw new Error(run.error || 'Echec temporaire du chargement auteur.');
    const resolvedPageIndex = Math.min(
      normalizedTargetPageIndex,
      Math.max(0, run.loadedPages - 1),
    );
    const items = run.results
      .filter((source) => source.pageIndex === resolvedPageIndex)
      .map((source) => source.result);
    const currentPageUrl = authorEnginePageUrlsRef.current.get(resolvedPageIndex)
      ?? run.currentPageUrl
      ?? nextQuery;
    const page: ScraperRuntimeSearchPageResult = {
      currentPageUrl,
      nextPageUrl: authorEnginePageUrlsRef.current.get(resolvedPageIndex + 1)
        ?? (resolvedPageIndex === run.loadedPages - 1 ? run.nextPageUrl : undefined),
      authorNames: [nextQuery],
      items,
    };
    return {
      page,
      visitedPageUrls: Array.from(
        { length: run.loadedPages },
        (_value, index) => authorEnginePageUrlsRef.current.get(index) ?? currentPageUrl,
      ),
      pageIndex: resolvedPageIndex,
      items,
    };
  }, [authorOriginalOnly, scrapeDetailsWithCards, scraper, scrapingConcurrency]);

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

    if (listingMode === 'source' && (!sourceConfig?.resultItemSelector || !hasScraperFieldSelectorValue(sourceConfig.titleSelector))) {
      setRuntimeError('Le composant Source n\'est pas encore suffisamment configure pour etre execute.');
      return;
    }

    setLoading(true);
    setLoadingStatus(buildListingLoadingStatus(listingMode, { phase: "fetching" }));

    try {
      const targetPageIndex = options?.pageIndex ?? 0;
      const extractedListingState = listingMode === 'author'
        ? await loadAuthorResultsWithCommonEngine(
          nextQuery,
          targetPageIndex,
          effectiveAuthorTemplateContext ?? null,
          canCommit,
          targetPageIndex === 0,
        )
        : await loadListingResultsPage(
          listingMode,
          nextQuery,
          targetPageIndex,
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
            : listingMode === 'source'
              ? 'La page source a bien ete chargee, mais aucune card exploitable n\'a ete extraite avec la configuration actuelle.'
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
        setLoadingStatus(null);
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
    loadAuthorResultsWithCommonEngine,
    resetDetailsState,
    resetListingState,
    searchConfig,
    sourceConfig,
    tagConfig,
    setHasExecutedListing,
    setListingPage,
    setListingPageIndex,
    setListingResults,
    setListingReturnState,
    setListingVisitedPageUrls,
    setLoading,
    setLoadingStatus,
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

  const runSourceLookup = useCallback(async (
    nextQuery: string,
    options?: ListingLookupOptions,
  ) => {
    await runListingLookup('source', nextQuery, options);
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
        : mode === 'source'
          ? resolveScraperSourceTargetUrl(scraper.baseUrl, sourceConfig!, query, {
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
    setLoadingStatus(buildListingLoadingStatus(mode, { phase: "fetching" }));
    setRuntimeMessage(null);
    setRuntimeError(null);

    try {
      const nextPageOptions = {
        pageIndex: nextPageIndex,
        usesTemplatePaging,
      };
      const authorListingState = mode === 'author'
        ? await loadAuthorResultsWithCommonEngine(
          query,
          nextPageIndex,
          authorTemplateContext,
          () => true,
        )
        : null;
      const nextPage = authorListingState?.page ?? await fetchListingPage(mode, nextPageTargetUrl, {
          ...nextPageOptions,
          query,
        });
      if (!nextPage.items.length) {
        setRuntimeMessage(
          mode === 'author'
            ? 'Aucune card exploitable n\'a ete trouvee sur la page auteur suivante.'
            : mode === 'tag'
              ? 'Aucune card exploitable n\'a ete trouvee sur la page tag suivante.'
            : mode === 'source'
              ? 'Aucune card exploitable n\'a ete trouvee sur la page source suivante.'
            : mode === 'homepage'
              ? 'Aucune card exploitable n\'a ete trouvee sur la page homepage suivante.'
              : 'Aucun resultat exploitable n\'a ete trouve sur la page suivante.',
        );
        return;
      }

      setListingPage(nextPage);
      setListingResults(nextPage.items);
      setHasExecutedListing(true);
      if (authorListingState) {
        setListingVisitedPageUrls(authorListingState.visitedPageUrls);
        setListingPageIndex(authorListingState.pageIndex);
      } else {
        setListingVisitedPageUrls((previous) => {
          const trimmedHistory = previous.slice(0, listingPageIndex + 1);
          return [...trimmedHistory, nextPage.currentPageUrl];
        });
        setListingPageIndex((previous) => previous + 1);
      }
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
      setLoadingStatus(null);
    }
  }, [
    authorConfig,
    authorTemplateContext,
    fetchListingPage,
    getUsesTemplatePaging,
    listingPage,
    listingPageIndex,
    loadAuthorResultsWithCommonEngine,
    mode,
    query,
    scraper.baseUrl,
    scrollToBrowserTop,
    searchConfig,
    sourceConfig,
    tagConfig,
    homepageConfig,
    setHasExecutedListing,
    setListingPage,
    setListingPageIndex,
    setListingResults,
    setListingVisitedPageUrls,
    setLoading,
    setLoadingStatus,
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
    setLoadingStatus(buildListingLoadingStatus(mode, { phase: "fetching" }));
    setRuntimeMessage(null);
    setRuntimeError(null);

    try {
      const previousPageIndex = Math.max(0, listingPageIndex - 1);
      const authorListingState = mode === 'author'
        ? await loadAuthorResultsWithCommonEngine(
          query,
          previousPageIndex,
          authorTemplateContext,
          () => true,
        )
        : null;
      const previousPage = authorListingState?.page ?? await fetchListingPage(mode, previousPageUrl, {
          query,
          pageIndex: previousPageIndex,
        });
      setListingPage(previousPage);
      setListingResults(previousPage.items);
      setHasExecutedListing(true);
      setListingPageIndex(authorListingState?.pageIndex ?? previousPageIndex);
      if (authorListingState) {
        setListingVisitedPageUrls(authorListingState.visitedPageUrls);
      } else {
        setListingVisitedPageUrls((currentHistory) => {
          const nextHistory = [...currentHistory];
          nextHistory[listingPageIndex - 1] = previousPage.currentPageUrl;
          return nextHistory;
        });
      }
      setRuntimeMessage([
        `Retour a la page ${listingPageIndex}.`,
        buildCardDetailsScrapeMessage(previousPage),
      ].filter(Boolean).join(" "));
      scrollToBrowserTop();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de revenir a la page precedente.');
    } finally {
      setLoading(false);
      setLoadingStatus(null);
    }
  }, [
    fetchListingPage,
    authorTemplateContext,
    loadAuthorResultsWithCommonEngine,
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
    setLoadingStatus,
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
          : listingReturnState.mode === 'source'
            ? runSourceLookup
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
    runSourceLookup,
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

    if (nextMode === 'source') {
      if (detailsResult && listingReturnState?.mode === 'source') {
        await handleBackToListing();
        return;
      }

      clearFeedback();
      resetAsyncState();
      resetDetailsState();
      resetListingState();
      setListingReturnState(null);
      setMode('source');
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
    runSourceLookup,
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
