import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavigateFunction } from 'react-router-dom';
import {
  ScraperBrowseMode,
  ScraperBrowserInitialState,
  ScraperBrowserLocationState,
  ScraperListingReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import { buildListingReturnStateFromRoute } from '@/renderer/components/ScraperBrowser/utils/scraperBrowserHelpers';
import {
  parseScraperRouteState,
  writeScraperRouteState,
} from '@/renderer/utils/scraperBrowserNavigation';
import {
  formatScraperValueForDisplay,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
} from '@/renderer/utils/scraperRuntime';

type ListingLookupOptions = {
  pageIndex?: number;
  preserveListingReturnState?: boolean;
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
  setListingReturnState: Dispatch<SetStateAction<ScraperListingReturnState | null>>;
  setDetailsResult: Dispatch<SetStateAction<ScraperRuntimeDetailsResult | null>>;
  setChaptersResult: Dispatch<SetStateAction<ScraperRuntimeChapterResult[]>>;
  runSearchLookup: (query: string, options?: ListingLookupOptions) => Promise<void>;
  runAuthorLookup: (query: string, options?: ListingLookupOptions) => Promise<void>;
  runDetailsLookup: (query: string) => Promise<void>;
  loadDetailsFromTargetUrl: (targetUrl: string) => Promise<void>;
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
  setListingReturnState,
  setDetailsResult,
  setChaptersResult,
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

  useEffect(() => {
    setMode((previous) => (availableModes.includes(previous) ? previous : defaultMode));
  }, [availableModes, defaultMode, setMode]);

  useEffect(() => {
    setQuery(formatScraperValueForDisplay(initialState?.query ?? ''));
    resetListingState();
    setListingReturnState(initialState?.listingReturnState ?? null);
    setDetailsResult(initialState?.detailsResult ?? null);
    setChaptersResult(initialState?.chaptersResult ?? []);
    clearFeedback();
    resetAsyncState();
    setUrlRestoreReady(false);
    cancelScheduledScrollRestore();
    isRestoringRouteRef.current = false;
    lastInternalSearchRef.current = null;
    lastRestoredRouteSignatureRef.current = null;
  }, [
    cancelScheduledScrollRestore,
    clearFeedback,
    initialState,
    resetAsyncState,
    resetListingState,
    scraperId,
    setChaptersResult,
    setDetailsResult,
    setListingReturnState,
    setQuery,
  ]);

  const restoreFromRoute = useCallback(async (allowInitialState: boolean) => {
    const restoredListingReturnState = initialState?.listingReturnState
      ?? buildListingReturnStateFromRoute(routeState);

    if (allowInitialState && initialState?.detailsResult) {
      setMode('manga');
      setQuery(formatScraperValueForDisplay(
        routeState.mangaQuery || routeState.mangaUrl || initialState.query || '',
      ));
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
        await runSearchLookup(routeState.searchQuery, {
          pageIndex: Math.max(0, routeState.searchPage - 1),
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
        await runSearchLookup(homeSearchQuery);
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
        await runAuthorLookup(routeState.authorQuery, {
          pageIndex: Math.max(0, routeState.authorPage - 1),
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
      await loadDetailsFromTargetUrl(routeState.mangaUrl);
      setListingReturnState(restoredListingReturnState);
      return;
    }

    if (hasDetails && routeState.mangaQuery) {
      await runDetailsLookup(routeState.mangaQuery);
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
    resetDetailsState,
    resetListingState,
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
        await restoreFromRoute(shouldRestoreInitialRoute);
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
    restoreFromRoute,
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
