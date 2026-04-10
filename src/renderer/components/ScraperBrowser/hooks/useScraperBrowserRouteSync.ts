import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { NavigateFunction } from 'react-router-dom';
import {
  ScraperBrowseMode,
  ScraperBrowserInitialState,
  ScraperSearchReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import { buildSearchReturnStateFromRoute } from '@/renderer/components/ScraperBrowser/utils/scraperBrowserHelpers';
import {
  parseScraperRouteState,
  writeScraperRouteState,
} from '@/renderer/utils/scraperBrowserNavigation';
import {
  formatScraperValueForDisplay,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
} from '@/renderer/utils/scraperRuntime';

type SearchLookupOptions = {
  pageIndex?: number;
  preserveSearchReturnState?: boolean;
};

type UseScraperBrowserRouteSyncOptions = {
  scraperId: string;
  initialState: ScraperBrowserInitialState | null;
  locationPathname: string;
  locationSearch: string;
  navigate: NavigateFunction;
  availableModes: ScraperBrowseMode[];
  defaultMode: ScraperBrowseMode;
  hasSearch: boolean;
  hasDetails: boolean;
  hasConfiguredHomeSearch: boolean;
  homeSearchQuery: string;
  mode: ScraperBrowseMode;
  query: string;
  hasExecutedSearch: boolean;
  searchPageIndex: number;
  searchReturnState: ScraperSearchReturnState | null;
  currentDetailsUrl: string;
  clearFeedback: () => void;
  resetSearchState: () => void;
  resetDetailsState: () => void;
  resetAsyncState: () => void;
  cancelScheduledScrollRestore: () => void;
  setMode: Dispatch<SetStateAction<ScraperBrowseMode>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setSearchReturnState: Dispatch<SetStateAction<ScraperSearchReturnState | null>>;
  setDetailsResult: Dispatch<SetStateAction<ScraperRuntimeDetailsResult | null>>;
  setChaptersResult: Dispatch<SetStateAction<ScraperRuntimeChapterResult[]>>;
  runSearchLookup: (query: string, options?: SearchLookupOptions) => Promise<void>;
  runDetailsLookup: (query: string) => Promise<void>;
  loadDetailsFromTargetUrl: (targetUrl: string) => Promise<void>;
};

export function useScraperBrowserRouteSync({
  scraperId,
  initialState,
  locationPathname,
  locationSearch,
  navigate,
  availableModes,
  defaultMode,
  hasSearch,
  hasDetails,
  hasConfiguredHomeSearch,
  homeSearchQuery,
  mode,
  query,
  hasExecutedSearch,
  searchPageIndex,
  searchReturnState,
  currentDetailsUrl,
  clearFeedback,
  resetSearchState,
  resetDetailsState,
  resetAsyncState,
  cancelScheduledScrollRestore,
  setMode,
  setQuery,
  setSearchReturnState,
  setDetailsResult,
  setChaptersResult,
  runSearchLookup,
  runDetailsLookup,
  loadDetailsFromTargetUrl,
}: UseScraperBrowserRouteSyncOptions) {
  const [urlRestoreReady, setUrlRestoreReady] = useState(false);
  const lastInternalSearchRef = useRef<string | null>(null);
  const lastRestoredRouteSignatureRef = useRef<string | null>(null);

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
    resetSearchState();
    setSearchReturnState(initialState?.searchReturnState ?? null);
    setDetailsResult(initialState?.detailsResult ?? null);
    setChaptersResult(initialState?.chaptersResult ?? []);
    clearFeedback();
    resetAsyncState();
    setUrlRestoreReady(false);
    cancelScheduledScrollRestore();
    lastInternalSearchRef.current = null;
    lastRestoredRouteSignatureRef.current = null;
  }, [
    cancelScheduledScrollRestore,
    clearFeedback,
    initialState,
    resetAsyncState,
    resetSearchState,
    scraperId,
    setChaptersResult,
    setDetailsResult,
    setQuery,
    setSearchReturnState,
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

    if (routeState.scraperId !== scraperId) {
      setUrlRestoreReady(true);
      return;
    }

    const nextMode = availableModes.includes(routeState.mode)
      ? routeState.mode
      : defaultMode;
    let cancelled = false;

    const finalizeRestore = () => {
      if (!cancelled) {
        setUrlRestoreReady(true);
      }
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
        resetDetailsState();
        resetSearchState();
        clearFeedback();
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

      resetDetailsState();
      resetSearchState();
      clearFeedback();
      finalizeRestore();
    };

    void restoreFromRoute();

    return () => {
      cancelled = true;
    };
  }, [
    availableModes,
    clearFeedback,
    defaultMode,
    hasDetails,
    hasConfiguredHomeSearch,
    hasSearch,
    homeSearchQuery,
    initialState,
    loadDetailsFromTargetUrl,
    resetDetailsState,
    resetSearchState,
    routeState,
    routeStateSignature,
    runDetailsLookup,
    runSearchLookup,
    scraperId,
    setMode,
    setQuery,
    setSearchReturnState,
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

    const nextSearch = writeScraperRouteState(locationSearch, {
      scraperId,
      mode,
      searchActive: persistedSearchState.active,
      searchQuery: persistedSearchState.query,
      searchPage: persistedSearchState.page,
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
      { replace: true },
    );
  }, [
    currentDetailsUrl,
    hasExecutedSearch,
    locationPathname,
    locationSearch,
    mode,
    navigate,
    query,
    scraperId,
    searchPageIndex,
    searchReturnState,
    urlRestoreReady,
  ]);
}

export default useScraperBrowserRouteSync;
