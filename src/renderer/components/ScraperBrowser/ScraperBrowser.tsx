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
  ScraperBrowserHistorySourceKind,
  ScraperBrowserInitialState,
  ScraperBrowserLocationState,
  ScraperCapability,
  ScraperListingReturnState,
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
import {
  parseScraperRouteState,
  writeScraperRouteState,
} from '@/renderer/utils/scraperBrowserNavigation';
import { usesScraperPagesChapters } from '@/renderer/utils/scraperPages';
import {
  formatScraperValueForDisplay,
  getScraperAuthorFeatureConfig,
  getScraperChaptersFeatureConfig,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  getScraperSearchFeatureConfig,
  hasAuthorPagePlaceholder,
  hasSearchPagePlaceholder,
  isScraperFeatureConfigured,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import { buildScraperTemplateContextFromDetails, type ScraperTemplateContext } from '@/renderer/utils/scraperTemplateContext';
import './style.scss';

type Props = {
  scraper: ScraperRecord;
  initialState?: ScraperBrowserInitialState | null;
};

const buildBackLabel = (
  sourceKind: ScraperBrowserHistorySourceKind | null,
  fallbackListingMode: ScraperListingReturnState['mode'] | null,
): string | null => {
  if (sourceKind === 'manga') {
    return 'Retour a la fiche';
  }

  if (sourceKind === 'author') {
    return 'Retour a la page auteur';
  }

  if (sourceKind === 'bookmarks') {
    return 'Retour aux bookmarks';
  }

  if (sourceKind === 'search') {
    return 'Retour a la recherche';
  }

  if (fallbackListingMode === 'author') {
    return 'Retour a la page auteur';
  }

  if (fallbackListingMode === 'search') {
    return 'Retour a la recherche';
  }

  return null;
};

export default function ScraperBrowser({ scraper, initialState = null }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as ScraperBrowserLocationState | null;
  const { openModal } = useModal();
  const searchFeature = useMemo(() => getScraperFeature(scraper, 'search'), [scraper]);
  const detailsFeature = useMemo(() => getScraperFeature(scraper, 'details'), [scraper]);
  const authorFeature = useMemo(() => getScraperFeature(scraper, 'author'), [scraper]);
  const chaptersFeature = useMemo(() => getScraperFeature(scraper, 'chapters'), [scraper]);
  const pagesFeature = useMemo(() => getScraperFeature(scraper, 'pages'), [scraper]);
  const searchConfig = useMemo(() => getScraperSearchFeatureConfig(searchFeature), [searchFeature]);
  const detailsConfig = useMemo(() => getScraperDetailsFeatureConfig(detailsFeature), [detailsFeature]);
  const authorConfig = useMemo(() => getScraperAuthorFeatureConfig(authorFeature), [authorFeature]);
  const chaptersConfig = useMemo(() => getScraperChaptersFeatureConfig(chaptersFeature), [chaptersFeature]);
  const pagesConfig = useMemo(() => getScraperPagesFeatureConfig(pagesFeature), [pagesFeature]);

  const hasSearch = isScraperFeatureConfigured(searchFeature);
  const hasDetails = isScraperFeatureConfigured(detailsFeature);
  const hasAuthor = isScraperFeatureConfigured(authorFeature);
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
    if (hasAuthor) {
      nextModes.push('author');
    }
    return nextModes;
  }, [hasAuthor, hasDetails, hasSearch]);

  const defaultMode = useMemo<ScraperBrowseMode>(() => {
    if (initialState?.detailsResult && availableModes.includes('manga')) {
      return 'manga';
    }

    if (availableModes.includes('search')) {
      return 'search';
    }

    if (availableModes.includes('author')) {
      return 'author';
    }

    return availableModes[0] ?? 'manga';
  }, [availableModes, initialState?.detailsResult]);

  const canOpenSearchResultsAsDetails = Boolean(hasDetails && detailsConfig?.titleSelector);
  const canOpenSearchResultsAsAuthor = Boolean(hasAuthor && authorConfig?.titleSelector && authorConfig?.resultItemSelector);
  const usesSearchTemplatePaging = hasSearchPagePlaceholder(searchConfig);
  const usesAuthorTemplatePaging = hasAuthorPagePlaceholder(authorConfig);
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
  const [listingPage, setListingPage] = useState<ScraperRuntimeSearchPageResult | null>(null);
  const [listingVisitedPageUrls, setListingVisitedPageUrls] = useState<string[]>([]);
  const [listingPageIndex, setListingPageIndex] = useState(0);
  const [listingResults, setListingResults] = useState<ScraperSearchResultItem[]>([]);
  const [hasExecutedListing, setHasExecutedListing] = useState(false);
  const [listingReturnState, setListingReturnState] = useState<ScraperListingReturnState | null>(null);
  const [detailsResult, setDetailsResult] = useState<ScraperRuntimeDetailsResult | null>(null);
  const [chaptersResult, setChaptersResult] = useState<ScraperRuntimeChapterResult[]>([]);
  const [authorTemplateContext, setAuthorTemplateContext] = useState<ScraperTemplateContext | null>(null);
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
  const historySourceKind = locationState?.scraperBrowserHistorySource?.kind ?? null;

  const clearFeedback = useCallback(() => {
    setRuntimeMessage(null);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
  }, []);

  const resetListingState = useCallback(() => {
    setListingPage(null);
    setListingVisitedPageUrls([]);
    setListingPageIndex(0);
    setListingResults([]);
    setHasExecutedListing(false);
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
    listingReturnState,
    detailsResult,
    chaptersResult,
    clearFeedback,
    resetListingState,
    resetDetailsState,
    setListingReturnState,
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
    runAuthorLookup,
    handleListingNextPage,
    handleListingPreviousPage,
    handleOpenResult,
    handleOpenAuthorResult,
    handleResultKeyDown,
    handleBackToListing,
    handleGoToHome,
    handleModeChange,
  } = useScraperBrowserSearch({
    scraper,
    locationPathname: location.pathname,
    locationSearch: location.search,
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
  });

  useScraperBrowserRouteSync({
    scraperId: scraper.id,
    initialState,
    locationPathname: location.pathname,
    locationSearch: location.search,
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
    setAuthorTemplateContext,
    setDetailsResult,
    setChaptersResult,
    runSearchLookup,
    runAuthorLookup,
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

    if (mode === 'author') {
      await runAuthorLookup(trimmedQuery);
      return;
    }

    if (!trimmedQuery) {
      setRuntimeError('Saisis une valeur avant de lancer le scrapper.');
      return;
    }

    await runDetailsLookup(trimmedQuery);
  }, [mode, query, runAuthorLookup, runDetailsLookup, runSearchLookup]);

  const activePlaceholder = useMemo(
    () => buildQueryPlaceholder(
      mode,
      hasDetails,
      detailsConfig?.urlStrategy ?? null,
      hasAuthor,
      authorConfig?.urlStrategy ?? null,
    ),
    [authorConfig?.urlStrategy, detailsConfig?.urlStrategy, hasAuthor, hasDetails, mode],
  );

  const capabilities = useMemo<ScraperCapability[]>(() => buildScraperCapabilities({
    searchFeature,
    detailsFeature,
    authorFeature,
    chaptersFeature,
    pagesFeature,
    hasSearch,
    hasDetails,
    hasAuthor,
    hasChapters,
    hasPages,
  }), [
    authorFeature,
    chaptersFeature,
    detailsFeature,
    hasAuthor,
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
    usesAuthorTemplatePaging,
    hasSearchNextPageSelector: Boolean(searchConfig?.nextPageSelector),
    hasAuthorNextPageSelector: Boolean(authorConfig?.nextPageSelector),
    canOpenSearchResultsAsDetails,
    canOpenSearchResultsAsAuthor,
    hasDetails,
    hasAuthor,
  }), [
    authorConfig?.nextPageSelector,
    canOpenSearchResultsAsAuthor,
    canOpenSearchResultsAsDetails,
    hasAuthor,
    hasDetails,
    mode,
    searchConfig?.nextPageSelector,
    usesAuthorTemplatePaging,
    usesSearchTemplatePaging,
  ]);

  const visibleSearchResults = useMemo(
    () => listingResults.slice(0, MAX_VISIBLE_SEARCH_RESULTS),
    [listingResults],
  );
  const scraperBookmarkCount = scraperBookmarks.length;
  const canReturnToListing = Boolean(listingReturnState?.hasExecutedListing);
  const historyIndex = typeof window !== 'undefined'
    && window.history.state
    && typeof window.history.state.idx === 'number'
    ? window.history.state.idx
    : null;
  const canNavigateBack = Boolean(historySourceKind) && historyIndex !== null && historyIndex > 0;
  const detailsBackLabel = buildBackLabel(
    canNavigateBack ? historySourceKind : null,
    canReturnToListing ? listingReturnState?.mode ?? null : null,
  );
  const authorResultsBackLabel = mode === 'author' && canNavigateBack
    ? buildBackLabel(historySourceKind, null)
    : null;
  const usesActiveTemplatePaging = mode === 'author' ? usesAuthorTemplatePaging : usesSearchTemplatePaging;
  const shouldShowSearchPagination = Boolean(
    listingPage && (listingPageIndex > 0 || listingPage.nextPageUrl || usesActiveTemplatePaging),
  );
  const paginationInfoLabel = useMemo(
    () => buildPaginationInfoLabel(
      listingPage,
      usesActiveTemplatePaging,
      mode === 'author' ? 'page auteur' : 'recherche',
    ),
    [listingPage, mode, usesActiveTemplatePaging],
  );
  const currentSearchPageLabel = useMemo(
    () => `Page ${listingPageIndex + 1}`,
    [listingPageIndex],
  );

  const handleNavigateBack = useCallback(() => {
    if (!canNavigateBack) {
      return;
    }

    navigate(-1);
  }, [canNavigateBack, navigate]);

  const handleOpenAuthorFromDetails = useCallback((value: string) => {
    setAuthorTemplateContext(detailsResult ? buildScraperTemplateContextFromDetails(detailsResult) : null);
    const nextAuthorQuery = formatScraperValueForDisplay(value);
    const routeState = parseScraperRouteState(location.search);
    const nextSearch = writeScraperRouteState(location.search, {
      scraperId: scraper.id,
      mode: 'author',
      searchActive: routeState.searchActive,
      searchQuery: routeState.searchQuery,
      searchPage: routeState.searchPage,
      authorActive: true,
      authorQuery: nextAuthorQuery,
      authorPage: 1,
      mangaQuery: '',
      bookmarksFilterScraperId: routeState.bookmarksFilterScraperId,
    });

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch,
      },
      {
        state: {
          ...(locationState ?? {}),
          scraperBrowserHistorySource: {
            kind: 'manga',
          },
        },
      },
    );
  }, [detailsResult, location.pathname, location.search, locationState, navigate, scraper.id]);

  const handleOpenScraperBookmarks = useCallback(() => {
    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId: 'bookmarks',
        mode: 'search',
        searchActive: false,
        searchQuery: '',
        searchPage: 1,
        authorActive: false,
        authorQuery: '',
        authorPage: 1,
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

  const handleOpenResultAction = useCallback((result: ScraperSearchResultItem) => {
    void handleOpenResult(result);
  }, [handleOpenResult]);

  const handleOpenAuthorResultAction = useCallback((result: ScraperSearchResultItem) => {
    void handleOpenAuthorResult(result);
  }, [handleOpenAuthorResult]);

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
          Aucun composant executable n&apos;est encore configure sur ce scrapper. Configure au moins `Fiche`,
          `Recherche` ou `Auteur` pour afficher une vue temporaire ici.
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
        mode={mode === 'author' ? 'author' : 'search'}
        backLabel={authorResultsBackLabel}
        visibleSearchResults={visibleSearchResults}
        searchResultsCount={listingResults.length}
        query={query}
        searchPage={listingPage}
        searchPageIndex={listingPageIndex}
        shouldShowSearchPagination={shouldShowSearchPagination}
        currentSearchPageLabel={currentSearchPageLabel}
        paginationInfoLabel={paginationInfoLabel}
        loading={loading}
        usesSearchTemplatePaging={usesActiveTemplatePaging}
        canOpenSearchResultsAsDetails={canOpenSearchResultsAsDetails}
        canOpenSearchResultsAsAuthor={canOpenSearchResultsAsAuthor}
        renderBookmarkAction={renderSearchResultBookmarkAction}
        onPreviousPage={() => void handleListingPreviousPage()}
        onNextPage={() => void handleListingNextPage()}
        onBack={handleNavigateBack}
        onOpenResult={(result) => void handleOpenResult(result)}
        onOpenAuthorResultAction={handleOpenAuthorResultAction}
        onResultKeyDown={handleResultKeyDown}
        onOpenResultAction={handleOpenResultAction}
        onOpenResultImage={handleOpenSearchResultImage}
      />

      <ScraperDetailsPanel
        scraperId={scraper.id}
        bookmarkExcludedFields={scraper.globalConfig.bookmark.excludedFields}
        detailsResult={detailsResult}
        chapters={chaptersResult}
        hasAuthor={hasAuthor}
        backLabel={detailsBackLabel}
        canResolveAuthorName={authorConfig?.urlStrategy === 'template'}
        hasPages={hasPages}
        usesChapters={usesChaptersForPages}
        openingReader={openingReader}
        downloading={downloading}
        onBack={canNavigateBack ? handleNavigateBack : () => void handleBackToListing()}
        onOpenAuthor={(value) => {
          handleOpenAuthorFromDetails(value);
        }}
        onOpenReader={(options) => void handleOpenReader(options)}
        onDownload={(chapter) => void handleDownload(chapter)}
      />
    </section>
  );
}
