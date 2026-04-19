import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavigateFunction } from 'react-router-dom';
import {
  ScraperBrowseMode,
  ScraperBrowserInitialState,
  ScraperBrowserLocationState,
  ScraperListingReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import {
  buildListingReturnStateFromRoute,
  buildScraperListingReturnStateCacheKey,
  readScraperListingReturnStateCache,
} from '@/renderer/components/ScraperBrowser/utils/scraperBrowserHelpers';
import {
  parseScraperRouteState,
  writeScraperRouteState,
} from '@/renderer/utils/scraperBrowserNavigation';
import type { ScraperTemplateContext } from '@/renderer/utils/scraperTemplateContext';
import {
  formatScraperValueForDisplay,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import type { ScraperSearchResultItem } from '@/shared/scraper';

type AsyncCommitGuard = () => boolean;

type ListingLookupOptions = {
  pageIndex?: number;
  preserveListingReturnState?: boolean;
  canCommit?: AsyncCommitGuard;
};

type DetailsLookupOptions = {
  canCommit?: AsyncCommitGuard;
};

type UseScraperBrowserRouteSyncOptions = {
  scraperId: string;
  initialState: ScraperBrowserInitialState | null;
  locationPathname: string;
  locationSearch: string;
  locationState: ScraperBrowserLocationState | null;
  navigate: NavigateFunction;
  availableModes: ScraperBrowseMode[];
  defaultMode: ScraperBrowseMode;
  hasSearch: boolean;
  hasAuthor: boolean;
  hasDetails: boolean;
  hasConfiguredHomeSearch: boolean;
  homeSearchQuery: string;
  mode: ScraperBrowseMode;
  query: string;
  hasExecutedListing: boolean;
  listingPageIndex: number;
  listingReturnState: ScraperListingReturnState | null;
  currentDetailsUrl: string;
  clearFeedback: () => void;
  resetListingState: () => void;
  resetDetailsState: () => void;
  resetAsyncState: () => void;
  cancelScheduledScrollRestore: () => void;
  setMode: Dispatch<SetStateAction<ScraperBrowseMode>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setListingPage: Dispatch<SetStateAction<ScraperRuntimeSearchPageResult | null>>;
  setListingVisitedPageUrls: Dispatch<SetStateAction<string[]>>;
  setListingPageIndex: Dispatch<SetStateAction<number>>;
  setListingResults: Dispatch<SetStateAction<ScraperSearchResultItem[]>>;
  setHasExecutedListing: Dispatch<SetStateAction<boolean>>;
  setListingReturnState: Dispatch<SetStateAction<ScraperListingReturnState | null>>;
  setAuthorTemplateContext: Dispatch<SetStateAction<ScraperTemplateContext | null>>;
  setDetailsResult: Dispatch<SetStateAction<ScraperRuntimeDetailsResult | null>>;
  setChaptersResult: Dispatch<SetStateAction<ScraperRuntimeChapterResult[]>>;
  restoreSearchScrollPosition: (scrollTop: number | null | undefined) => void;
  runSearchLookup: (query: string, options?: ListingLookupOptions) => Promise<void>;
  runAuthorLookup: (query: string, options?: ListingLookupOptions) => Promise<void>;
  runDetailsLookup: (query: string, options?: DetailsLookupOptions) => Promise<void>;
  loadDetailsFromTargetUrl: (targetUrl: string, options?: DetailsLookupOptions) => Promise<void>;
};

export function useScraperBrowserRouteSync({
  scraperId,
  initialState,
  locationPathname,
  locationSearch,
  locationState,
  navigate,
  availableModes,
  defaultMode,
  hasSearch,
  hasAuthor,
  hasDetails,
  hasConfiguredHomeSearch,
  homeSearchQuery,
  mode,
  query,
  hasExecutedListing,
  listingPageIndex,
  listingReturnState,
  currentDetailsUrl,
  clearFeedback,
  resetListingState,
  resetDetailsState,
  resetAsyncState,
  cancelScheduledScrollRestore,
  setMode,
  setQuery,
  setListingPage,
  setListingVisitedPageUrls,
  setListingPageIndex,
  setListingResults,
  setHasExecutedListing,
  setListingReturnState,
  setAuthorTemplateContext,
  setDetailsResult,
  setChaptersResult,
  restoreSearchScrollPosition,
  runSearchLookup,
  runAuthorLookup,
  runDetailsLookup,
  loadDetailsFromTargetUrl,
}: UseScraperBrowserRouteSyncOptions) {
  const [urlRestoreReady, setUrlRestoreReady] = useState(false);
  const lastInternalSearchRef = useRef<string | null>(null);
  const lastRestoredRouteSignatureRef = useRef<string | null>(null);
  const isRestoringRouteRef = useRef(false);

  const routeState = useMemo(
    () => parseScraperRouteState(locationSearch),
    [locationSearch],
  );
  const routeStateSignature = useMemo(
    () => JSON.stringify(routeState),
    [routeState],
  );

  const restoreListingReturnState = useCallback((state: ScraperListingReturnState) => {
    setMode(state.mode);
    setQuery(state.query);
    resetDetailsState();
    clearFeedback();
    resetAsyncState();
    setListingReturnState(state);
    setListingPage(state.page);
    setListingVisitedPageUrls(state.visitedPageUrls);
    setListingPageIndex(state.pageIndex);
    setListingResults(state.results);
    setHasExecutedListing(state.hasExecutedListing);
    restoreSearchScrollPosition(state.scrollTop);
  }, [
    clearFeedback,
    resetAsyncState,
    resetDetailsState,
    restoreSearchScrollPosition,
    setHasExecutedListing,
    setListingPage,
    setListingPageIndex,
    setListingResults,
    setListingReturnState,
    setListingVisitedPageUrls,
    setMode,
    setQuery,
  ]);

  useEffect(() => {
    setMode((previous) => (availableModes.includes(previous) ? previous : defaultMode));
  }, [availableModes, defaultMode, setMode]);

  useEffect(() => {
    const initialListingMode = initialState?.listingMode;
    const hasInitialListing = Boolean(initialListingMode && availableModes.includes(initialListingMode));

    setQuery(formatScraperValueForDisplay(initialState?.query ?? ''));
    resetListingState();
    setListingReturnState(initialState?.listingReturnState ?? null);
    setAuthorTemplateContext(initialState?.authorTemplateContext ?? null);
    setDetailsResult(initialState?.detailsResult ?? null);
    setChaptersResult(initialState?.chaptersResult ?? []);

    if (hasInitialListing && initialListingMode) {
      const initialListingResults = initialState?.listingResults ?? [];
      setMode(initialListingMode);
      setListingPage(initialState?.listingPage ?? null);
      setListingVisitedPageUrls(initialState?.listingVisitedPageUrls ?? []);
      setListingPageIndex(initialState?.listingPageIndex ?? 0);
      setListingResults(initialListingResults);
      setHasExecutedListing(
        initialState?.hasExecutedListing
        ?? Boolean(initialState?.listingPage || initialListingResults.length > 0),
      );
    }

    clearFeedback();
    resetAsyncState();
    setUrlRestoreReady(false);
    cancelScheduledScrollRestore();
    isRestoringRouteRef.current = false;
    lastInternalSearchRef.current = null;
    lastRestoredRouteSignatureRef.current = null;
  }, [
    availableModes,
    cancelScheduledScrollRestore,
    clearFeedback,
    initialState,
    resetAsyncState,
    resetListingState,
    scraperId,
    setChaptersResult,
    setDetailsResult,
    setHasExecutedListing,
    setListingPage,
    setListingPageIndex,
    setListingResults,
    setListingReturnState,
    setListingVisitedPageUrls,
    setAuthorTemplateContext,
    setMode,
    setQuery,
  ]);

  const restoreFromRoute = useCallback(async (
    allowInitialState: boolean,
    canCommit: AsyncCommitGuard = () => true,
  ) => {
    if (!canCommit()) {
      return;
    }

    resetAsyncState();

    const listingReturnStateCacheKey = buildScraperListingReturnStateCacheKey(locationPathname, locationSearch);
    const restoredListingReturnState = locationState?.scraperBrowserListingReturnState
      ?? initialState?.listingReturnState
      ?? readScraperListingReturnStateCache(listingReturnStateCacheKey)
      ?? buildListingReturnStateFromRoute(routeState);

    if (allowInitialState && initialState?.detailsResult) {
      setMode('manga');
      setQuery(formatScraperValueForDisplay(
        routeState.mangaQuery || routeState.mangaUrl || initialState.query || '',
      ));
      setListingReturnState(restoredListingReturnState);
      return;
    }

    if (
      allowInitialState
      && initialState?.listingMode
      && availableModes.includes(initialState.listingMode)
    ) {
      setMode(initialState.listingMode);
      setQuery(formatScraperValueForDisplay(initialState.query || ''));
      setListingReturnState(restoredListingReturnState);
      return;
    }

    if (routeState.scraperId !== scraperId) {
      return;
    }

    const nextMode = availableModes.includes(routeState.mode)
      ? routeState.mode
      : defaultMode;
    setMode(nextMode);

    if (nextMode === 'search') {
      setQuery(routeState.searchQuery);

      if (routeState.searchActive && hasSearch) {
        const cachedSearchState = restoredListingReturnState?.mode === 'search'
          ? restoredListingReturnState
          : null;
        if (cachedSearchState?.page && cachedSearchState.results.length > 0) {
          restoreListingReturnState(cachedSearchState);
          return;
        }

        await runSearchLookup(routeState.searchQuery, {
          pageIndex: Math.max(0, routeState.searchPage - 1),
          canCommit,
        });
        return;
      }

      if (
        hasConfiguredHomeSearch
        && !routeState.searchActive
        && !routeState.authorActive
        && !routeState.mangaQuery
        && !routeState.mangaUrl
      ) {
        setQuery(homeSearchQuery);
        await runSearchLookup(homeSearchQuery, {
          canCommit,
        });
        return;
      }

      setListingReturnState(null);
      resetDetailsState();
      resetListingState();
      clearFeedback();
      return;
    }

    if (nextMode === 'author') {
      setQuery(routeState.authorQuery);

      if (routeState.authorActive && hasAuthor) {
        const cachedAuthorState = restoredListingReturnState?.mode === 'author'
          ? restoredListingReturnState
          : null;
        if (cachedAuthorState?.page && cachedAuthorState.results.length > 0) {
          restoreListingReturnState(cachedAuthorState);
          return;
        }

        await runAuthorLookup(routeState.authorQuery, {
          pageIndex: Math.max(0, routeState.authorPage - 1),
          canCommit,
        });
        return;
      }

      setListingReturnState(null);
      resetDetailsState();
      resetListingState();
      clearFeedback();
      return;
    }

    setQuery(formatScraperValueForDisplay(routeState.mangaQuery || routeState.mangaUrl || ''));
    setListingReturnState(restoredListingReturnState);

    if (hasDetails && routeState.mangaUrl) {
      await loadDetailsFromTargetUrl(routeState.mangaUrl, {
        canCommit,
      });
      if (!canCommit()) {
        return;
      }
      setListingReturnState(restoredListingReturnState);
      return;
    }

    if (hasDetails && routeState.mangaQuery) {
      await runDetailsLookup(routeState.mangaQuery, {
        canCommit,
      });
      if (!canCommit()) {
        return;
      }
      setListingReturnState(restoredListingReturnState);
      return;
    }

    resetDetailsState();
    resetListingState();
    clearFeedback();
  }, [
    availableModes,
    clearFeedback,
    defaultMode,
    hasAuthor,
    hasConfiguredHomeSearch,
    hasDetails,
    hasSearch,
    homeSearchQuery,
    initialState,
    loadDetailsFromTargetUrl,
    locationPathname,
    locationSearch,
    locationState,
    resetDetailsState,
    resetListingState,
    resetAsyncState,
    restoreListingReturnState,
    routeState,
    routeStateSignature,
    runAuthorLookup,
    runDetailsLookup,
    runSearchLookup,
    scraperId,
    setListingReturnState,
    setMode,
    setQuery,
  ]);
  const restoreFromRouteRef = useRef(restoreFromRoute);
  restoreFromRouteRef.current = restoreFromRoute;

  useEffect(() => {
    const isInternalRouteWrite = lastInternalSearchRef.current === locationSearch;
    if (isInternalRouteWrite) {
      lastInternalSearchRef.current = null;
      lastRestoredRouteSignatureRef.current = routeStateSignature;
      if (!urlRestoreReady) {
        setUrlRestoreReady(true);
      }
      return;
    }

    const shouldRestoreInitialRoute = !urlRestoreReady;
    const shouldRestoreExternalRoute = urlRestoreReady
      && lastRestoredRouteSignatureRef.current !== routeStateSignature;

    if (!shouldRestoreInitialRoute && !shouldRestoreExternalRoute) {
      return;
    }

    let cancelled = false;
    isRestoringRouteRef.current = true;

    const runRestore = async () => {
      try {
        await restoreFromRouteRef.current(shouldRestoreInitialRoute, () => !cancelled);
      } finally {
        if (cancelled) {
          return;
        }

        isRestoringRouteRef.current = false;
        lastRestoredRouteSignatureRef.current = routeStateSignature;
        setUrlRestoreReady(true);
      }
    };

    void runRestore();

    return () => {
      cancelled = true;
      isRestoringRouteRef.current = false;
    };
  }, [
    locationSearch,
    routeStateSignature,
    urlRestoreReady,
  ]);

  useEffect(() => {
    if (!urlRestoreReady || isRestoringRouteRef.current) {
      return;
    }

    const persistedSearchState = mode === 'search'
      ? {
        active: hasExecutedListing,
        query,
        page: listingPageIndex + 1,
      }
      : listingReturnState?.mode === 'search' && listingReturnState.hasExecutedListing
        ? {
          active: true,
          query: listingReturnState.query,
          page: listingReturnState.pageIndex + 1,
        }
        : {
          active: false,
          query: '',
          page: 1,
        };

    const persistedAuthorState = mode === 'author'
      ? {
        active: hasExecutedListing,
        query,
        page: listingPageIndex + 1,
      }
      : listingReturnState?.mode === 'author' && listingReturnState.hasExecutedListing
        ? {
          active: true,
          query: listingReturnState.query,
          page: listingReturnState.pageIndex + 1,
        }
        : {
          active: false,
          query: '',
          page: 1,
        };

    const nextSearch = writeScraperRouteState(locationSearch, {
      scraperId,
      mode,
      searchActive: persistedSearchState.active,
      searchQuery: persistedSearchState.query,
      searchPage: persistedSearchState.page,
      authorActive: persistedAuthorState.active,
      authorQuery: persistedAuthorState.query,
      authorPage: persistedAuthorState.page,
      mangaQuery: mode === 'manga' ? query : '',
      mangaUrl: mode === 'manga'
        ? formatScraperValueForDisplay(currentDetailsUrl) || undefined
        : undefined,
    });

    if (nextSearch === locationSearch) {
      lastInternalSearchRef.current = null;
      return;
    }

    if (lastInternalSearchRef.current === nextSearch) {
      return;
    }

    lastInternalSearchRef.current = nextSearch;
    navigate(
      {
        pathname: locationPathname,
        search: nextSearch,
      },
      {
        replace: true,
        state: locationState ?? null,
      },
    );
  }, [
    currentDetailsUrl,
    hasExecutedListing,
    listingPageIndex,
    listingReturnState,
    locationPathname,
    locationSearch,
    locationState,
    mode,
    navigate,
    query,
    scraperId,
    urlRestoreReady,
  ]);
}

export default useScraperBrowserRouteSync;
