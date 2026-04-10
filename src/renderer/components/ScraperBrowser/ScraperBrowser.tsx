import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ScraperRecord, ScraperSearchResultItem } from '@/shared/scraper';
import buildScraperConfigModal from '@/renderer/components/Modal/modales/ScraperConfigModal';
import buildScraperImagePreviewModal from '@/renderer/components/Modal/modales/ScraperImagePreviewModal';
import ScraperBrowserHero from '@/renderer/components/ScraperBrowser/components/ScraperBrowserHero';
import ScraperBrowserMessages from '@/renderer/components/ScraperBrowser/components/ScraperBrowserMessages';
import ScraperBrowserToolbar from '@/renderer/components/ScraperBrowser/components/ScraperBrowserToolbar';
import ScraperDetailsPanel from '@/renderer/components/ScraperBrowser/components/ScraperDetailsPanel';
import ScraperSearchResultsSection from '@/renderer/components/ScraperBrowser/components/ScraperSearchResultsSection';
import useScraperBrowserDetails from '@/renderer/components/ScraperBrowser/hooks/useScraperBrowserDetails';
import useScraperBrowserRouteSync from '@/renderer/components/ScraperBrowser/hooks/useScraperBrowserRouteSync';
import useScraperBrowserSearch from '@/renderer/components/ScraperBrowser/hooks/useScraperBrowserSearch';
import type { ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import {
  ScraperBrowseMode,
  ScraperBrowserInitialState,
  ScraperCapability,
  ScraperSearchReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import {
  buildPaginationInfoLabel,
  buildQueryPlaceholder,
  buildScraperBrowserHelperText,
  buildScraperCapabilities,
  MAX_VISIBLE_SEARCH_RESULTS,
} from '@/renderer/components/ScraperBrowser/utils/scraperBrowserHelpers';
import { useModal } from '@/renderer/hooks/useModal';
import { useScraperBookmarks } from '@/renderer/stores/scraperBookmarks';
import { writeScraperRouteState } from '@/renderer/utils/scraperBrowserNavigation';
import { usesScraperPagesChapters } from '@/renderer/utils/scraperPages';
import {
  formatScraperValueForDisplay,
  getScraperChaptersFeatureConfig,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  getScraperSearchFeatureConfig,
  hasSearchPagePlaceholder,
  isScraperFeatureConfigured,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import './style.scss';

type Props = {
  scraper: ScraperRecord;
  initialState?: ScraperBrowserInitialState | null;
};

export default function ScraperBrowser({ scraper, initialState = null }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { openModal } = useModal();
  const searchFeature = useMemo(() => getScraperFeature(scraper, 'search'), [scraper]);
  const detailsFeature = useMemo(() => getScraperFeature(scraper, 'details'), [scraper]);
  const chaptersFeature = useMemo(() => getScraperFeature(scraper, 'chapters'), [scraper]);
  const pagesFeature = useMemo(() => getScraperFeature(scraper, 'pages'), [scraper]);
  const searchConfig = useMemo(() => getScraperSearchFeatureConfig(searchFeature), [searchFeature]);
  const detailsConfig = useMemo(() => getScraperDetailsFeatureConfig(detailsFeature), [detailsFeature]);
  const chaptersConfig = useMemo(() => getScraperChaptersFeatureConfig(chaptersFeature), [chaptersFeature]);
  const pagesConfig = useMemo(() => getScraperPagesFeatureConfig(pagesFeature), [pagesFeature]);

  const hasSearch = isScraperFeatureConfigured(searchFeature);
  const hasDetails = isScraperFeatureConfigured(detailsFeature);
  const hasChapters = isScraperFeatureConfigured(chaptersFeature);
  const hasPages = isScraperFeatureConfigured(pagesFeature);
  const usesChaptersForPages = usesScraperPagesChapters(pagesConfig);
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

  const canOpenSearchResultsAsDetails = Boolean(hasDetails && detailsConfig?.titleSelector);
  const usesSearchTemplatePaging = hasSearchPagePlaceholder(searchConfig);
  const hasConfiguredHomeSearch = useMemo(
    () => Boolean(scraper.globalConfig.homeSearch.enabled && hasSearch),
    [hasSearch, scraper.globalConfig.homeSearch.enabled],
  );
  const homeSearchQuery = useMemo(
    () => scraper.globalConfig.homeSearch.query || '',
    [scraper.globalConfig.homeSearch.query],
  );
  const { bookmarks: scraperBookmarks } = useScraperBookmarks({ scraperId: scraper.id });

  const [mode, setMode] = useState<ScraperBrowseMode>(defaultMode);
  const [query, setQuery] = useState('');
  const [searchPage, setSearchPage] = useState<ScraperRuntimeSearchPageResult | null>(null);
  const [searchVisitedPageUrls, setSearchVisitedPageUrls] = useState<string[]>([]);
  const [searchPageIndex, setSearchPageIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<ScraperSearchResultItem[]>([]);
  const [hasExecutedSearch, setHasExecutedSearch] = useState(false);
  const [searchReturnState, setSearchReturnState] = useState<ScraperSearchReturnState | null>(null);
  const [detailsResult, setDetailsResult] = useState<ScraperRuntimeDetailsResult | null>(null);
  const [chaptersResult, setChaptersResult] = useState<ScraperRuntimeChapterResult[]>([]);
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [openingReader, setOpeningReader] = useState(false);
  const browserRootRef = useRef<HTMLElement | null>(null);
  const scrollRestoreFrameRef = useRef<number | null>(null);
  const nestedScrollRestoreFrameRef = useRef<number | null>(null);

  const clearFeedback = useCallback(() => {
    setRuntimeMessage(null);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
  }, []);

  const resetSearchState = useCallback(() => {
    setSearchPage(null);
    setSearchVisitedPageUrls([]);
    setSearchPageIndex(0);
    setSearchResults([]);
    setHasExecutedSearch(false);
  }, []);

  const resetDetailsState = useCallback(() => {
    setDetailsResult(null);
    setChaptersResult([]);
  }, []);

  const resetAsyncState = useCallback(() => {
    setLoading(false);
    setDownloading(false);
    setOpeningReader(false);
  }, []);

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

  useEffect(() => (
    () => {
      cancelScheduledScrollRestore();
    }
  ), [cancelScheduledScrollRestore]);

  const {
    currentDetailsUrl,
    loadDetailsFromTargetUrl,
    runDetailsLookup,
    handleDownload,
    handleOpenReader,
  } = useScraperBrowserDetails({
    scraper,
    query,
    detailsConfig,
    chaptersConfig,
    pagesConfig,
    usesChaptersForPages,
    locationPathname: location.pathname,
    locationSearch: location.search,
    navigate,
    searchReturnState,
    detailsResult,
    chaptersResult,
    clearFeedback,
    resetSearchState,
    resetDetailsState,
    setSearchReturnState,
    setLoading,
    setRuntimeError,
    setDownloadError,
    setDownloadMessage,
    setDownloading,
    setOpeningReader,
    setDetailsResult,
    setChaptersResult,
  });

  const {
    runSearchLookup,
    handleSearchNextPage,
    handleSearchPreviousPage,
    handleOpenSearchResult,
    handleSearchResultKeyDown,
    handleBackToSearch,
    handleGoToHome,
    handleModeChange,
  } = useScraperBrowserSearch({
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
  });

  useScraperBrowserRouteSync({
    scraperId: scraper.id,
    initialState,
    locationPathname: location.pathname,
    locationSearch: location.search,
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
  });

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

  const activePlaceholder = useMemo(
    () => buildQueryPlaceholder(mode, hasDetails, detailsConfig?.urlStrategy ?? null),
    [detailsConfig?.urlStrategy, hasDetails, mode],
  );

  const capabilities = useMemo<ScraperCapability[]>(() => buildScraperCapabilities({
    searchFeature,
    detailsFeature,
    chaptersFeature,
    pagesFeature,
    hasSearch,
    hasDetails,
    hasChapters,
    hasPages,
  }), [
    chaptersFeature,
    detailsFeature,
    hasChapters,
    hasDetails,
    hasPages,
    hasSearch,
    pagesFeature,
    searchFeature,
  ]);

  const helperText = useMemo(() => buildScraperBrowserHelperText({
    mode,
    usesSearchTemplatePaging,
    hasSearchNextPageSelector: Boolean(searchConfig?.nextPageSelector),
    canOpenSearchResultsAsDetails,
    hasDetails,
  }), [
    canOpenSearchResultsAsDetails,
    hasDetails,
    mode,
    searchConfig?.nextPageSelector,
    usesSearchTemplatePaging,
  ]);

  const visibleSearchResults = useMemo(
    () => searchResults.slice(0, MAX_VISIBLE_SEARCH_RESULTS),
    [searchResults],
  );
  const scraperBookmarkCount = scraperBookmarks.length;
  const canReturnToSearch = Boolean(searchReturnState?.hasExecutedSearch);
  const shouldShowSearchPagination = Boolean(
    searchPage && (searchPageIndex > 0 || searchPage.nextPageUrl || usesSearchTemplatePaging),
  );
  const paginationInfoLabel = useMemo(
    () => buildPaginationInfoLabel(searchPage, usesSearchTemplatePaging),
    [searchPage, usesSearchTemplatePaging],
  );
  const currentSearchPageLabel = useMemo(
    () => `Page ${searchPageIndex + 1}`,
    [searchPageIndex],
  );

  const handleOpenScraperBookmarks = useCallback(() => {
    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId: 'bookmarks',
        mode: 'search',
        searchActive: false,
        searchQuery: '',
        searchPage: 1,
        mangaQuery: '',
        bookmarksFilterScraperId: scraper.id,
      }),
    }, {
      state: {
        bookmarksReturn: {
          pathname: location.pathname,
          search: location.search,
        },
      },
    });
  }, [location.pathname, location.search, navigate, scraper.id]);

  const handleOpenSearchResultAction = useCallback((result: ScraperSearchResultItem) => {
    void handleOpenSearchResult(result);
  }, [handleOpenSearchResult]);

  const handleOpenSearchResultImage = useCallback((result: ScraperSearchResultItem) => {
    if (!result.thumbnailUrl) {
      return;
    }

    openModal(buildScraperImagePreviewModal({
      imageUrl: result.thumbnailUrl,
      title: result.title,
    }));
  }, [openModal]);

  const renderSearchResultBookmarkAction = useCallback((result: ScraperSearchResultItem): ScraperCardAction | null => {
    if (!result.detailUrl) {
      return null;
    }

    return {
      id: `bookmark-${result.detailUrl}`,
      type: 'custom',
      label: `Basculer le bookmark de ${result.title}`,
      render: () => (
        <ScraperBookmarkButton
          scraperId={scraper.id}
          sourceUrl={result.detailUrl}
          title={result.title}
          cover={result.thumbnailUrl}
          summary={result.summary}
          excludedFields={scraper.globalConfig.bookmark.excludedFields}
          size="sm"
        />
      ),
    };
  }, [scraper.globalConfig.bookmark.excludedFields, scraper.id]);

  return (
    <section className="scraper-browser" ref={browserRootRef}>
      <ScraperBrowserHero
        scraper={scraper}
        capabilities={capabilities}
        bookmarkCount={scraperBookmarkCount}
        onHome={() => void handleGoToHome()}
        onOpenBookmarks={handleOpenScraperBookmarks}
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
        renderBookmarkAction={renderSearchResultBookmarkAction}
        onPreviousPage={() => void handleSearchPreviousPage()}
        onNextPage={() => void handleSearchNextPage()}
        onOpenResult={(result) => void handleOpenSearchResult(result)}
        onResultKeyDown={handleSearchResultKeyDown}
        onOpenResultAction={handleOpenSearchResultAction}
        onOpenResultImage={handleOpenSearchResultImage}
      />

      <ScraperDetailsPanel
        scraperId={scraper.id}
        bookmarkExcludedFields={scraper.globalConfig.bookmark.excludedFields}
        detailsResult={detailsResult}
        chapters={chaptersResult}
        hasPages={hasPages}
        usesChapters={usesChaptersForPages}
        canReturnToSearch={canReturnToSearch}
        openingReader={openingReader}
        downloading={downloading}
        onBackToSearch={() => void handleBackToSearch()}
        onOpenReader={(chapter) => void handleOpenReader(chapter)}
        onDownload={(chapter) => void handleDownload(chapter)}
      />
    </section>
  );
}
