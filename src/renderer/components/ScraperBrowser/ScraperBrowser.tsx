import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  buildScraperViewHistoryCardId,
  ScraperRecord,
  ScraperSearchResultItem,
} from '@/shared/scraper';
import type { Manga, SavedScraperSearch } from '@/renderer/types';
import buildScraperConfigModal from '@/renderer/components/Modal/modales/ScraperConfigModal';
import buildScraperImagePreviewModal from '@/renderer/components/Modal/modales/ScraperImagePreviewModal';
import buildScraperLinkMangaModal from '@/renderer/components/Modal/modales/ScraperLinkMangaModal';
import SavedSearchesList from '@/renderer/components/SavedSearches/SavedSearchesList';
import SaveSearchModalContent from '@/renderer/components/SavedSearches/SaveSearchModalContent';
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
import { DownloadArrowIcon, OpenBookIcon, PlusSignIcon } from '@/renderer/components/icons';
import {
  ScraperBrowseMode,
  ScraperBrowserHistorySourceKind,
  ScraperBrowserInitialState,
  ScraperBrowserLocationState,
  ScraperCapability,
  ScraperListingMode,
  ScraperListingReturnState,
} from '@/renderer/components/ScraperBrowser/types';
import {
  buildPaginationInfoLabel,
  buildQueryPlaceholder,
  buildScraperBrowserHelperText,
  buildScraperCapabilities,
  buildScraperListingReturnStateCacheKey,
  cacheScraperListingReturnState,
  isScraperRuntimeChapterResult,
  MAX_VISIBLE_SEARCH_RESULTS,
} from '@/renderer/components/ScraperBrowser/utils/scraperBrowserHelpers';
import { useModal } from '@/renderer/hooks/useModal';
import { useScraperBookmarks } from '@/renderer/stores/scraperBookmarks';
import {
  recordScraperCardsSeen,
  setScraperCardRead,
  useScraperViewHistory,
} from '@/renderer/stores/scraperViewHistory';
import {
  parseScraperRouteState,
  writeScraperRouteState,
} from '@/renderer/utils/scraperBrowserNavigation';
import {
  getCurrentVerticalScrollTop,
  scrollElementToVerticalStart,
  scrollToVerticalPosition,
} from '@/renderer/utils/scrollPosition';
import {
  findLocalMangaLinkedToSource,
  findMangaLinkedToSource,
} from '@/renderer/utils/mangaSource';
import {
  saveScraperMangaToLibrary,
  saveStandaloneScraperCardToLibrary,
} from '@/renderer/utils/scraperLibrary';
import {
  buildSearchResultViewHistoryIdentity,
  getScraperCardViewState,
  getScraperViewHistoryRecord,
} from '@/renderer/utils/scraperViewHistory';
import {
  buildScraperDownloadQueuedMessage,
  canQueueStandaloneScraperDownload,
  queueStandaloneScraperCardDownload,
} from '@/renderer/utils/scraperDownload';
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
import generateId from '@/utils/id';
import useParams from '@/renderer/hooks/useParams';
import type { WorkspaceTarget } from '@/renderer/types/workspace';
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

const normalizeSavedScraperSearches = (value: unknown): SavedScraperSearch[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<SavedScraperSearch[]>((searches, item, index) => {
    if (!item || typeof item !== 'object') {
      return searches;
    }

    const data = item as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const scraperId = typeof data.scraperId === 'string' ? data.scraperId.trim() : '';
    const query = typeof data.query === 'string' ? data.query.trim() : '';
    const mode = data.mode === 'author' ? 'author' : data.mode === 'search' ? 'search' : null;

    if (!name || !scraperId || !query || !mode) {
      return searches;
    }

    searches.push({
      id: typeof data.id === 'string' && data.id.trim().length > 0
        ? data.id
        : `saved-scraper-search-${index}`,
      scraperId,
      name,
      query,
      mode,
      createdAt: typeof data.createdAt === 'string' && data.createdAt.trim().length > 0
        ? data.createdAt
        : '1970-01-01T00:00:00.000Z',
    });

    return searches;
  }, []);
};

export default function ScraperBrowser({ scraper, initialState = null }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as ScraperBrowserLocationState | null;
  const { openModal, closeModal } = useModal();
  const { params, setParams } = useParams();
  const showSavedScraperSearches = params?.showSavedScraperSearches !== false;
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
    if (initialState?.listingMode && availableModes.includes(initialState.listingMode)) {
      return initialState.listingMode;
    }

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
  }, [availableModes, initialState?.detailsResult, initialState?.listingMode]);

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
  const savedScraperSearches = useMemo(
    () => normalizeSavedScraperSearches(params?.savedScraperSearches),
    [params?.savedScraperSearches],
  );
  const currentScraperSavedSearches = useMemo(
    () => savedScraperSearches.filter((search) => search.scraperId === scraper.id),
    [savedScraperSearches, scraper.id],
  );
  const { bookmarks: scraperBookmarks } = useScraperBookmarks({ scraperId: scraper.id });
  const {
    loaded: viewHistoryLoaded,
    recordsById: viewHistoryRecordsById,
  } = useScraperViewHistory({ scraperId: scraper.id });
  const [libraryMangas, setLibraryMangas] = useState<Manga[]>([]);

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
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  const [loadingMoreThumbnails, setLoadingMoreThumbnails] = useState(false);
  const [savedSearchesExpanded, setSavedSearchesExpanded] = useState(false);
  const [savedSearchDeleteMode, setSavedSearchDeleteMode] = useState(false);
  const [newSearchResultIds, setNewSearchResultIds] = useState<Set<string>>(() => new Set());
  const browserRootRef = useRef<HTMLElement | null>(null);
  const viewHistoryRecordsByIdRef = useRef(viewHistoryRecordsById);
  const scrollRestoreFrameRef = useRef<number | null>(null);
  const nestedScrollRestoreFrameRef = useRef<number | null>(null);
  const historySourceKind = locationState?.scraperBrowserHistorySource?.kind ?? null;

  const clearFeedback = useCallback(() => {
    setRuntimeMessage(null);
    setRuntimeError(null);
    setDownloadError(null);
    setDownloadMessage(null);
  }, []);

  const loadLibraryMangas = useCallback(async () => {
    if (!window.api || typeof window.api.getMangas !== 'function') {
      setLibraryMangas([]);
      return;
    }

    try {
      const data = await window.api.getMangas();
      setLibraryMangas(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('Failed to load library mangas for scraper source matching', error);
      setLibraryMangas([]);
    }
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
    setLoadingMoreThumbnails(false);
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
    return getCurrentVerticalScrollTop(browserRootRef.current);
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
        scrollToVerticalPosition(browserRootRef.current, nextScrollTop);
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
        scrollElementToVerticalStart(browserRootRef.current);
      });
    });
  }, [cancelScheduledScrollRestore]);

  useEffect(() => (
    () => {
      cancelScheduledScrollRestore();
    }
  ), [cancelScheduledScrollRestore]);

  useEffect(() => {
    if (showSavedScraperSearches && currentScraperSavedSearches.length > 0) {
      return;
    }

    setSavedSearchDeleteMode(false);
    if (currentScraperSavedSearches.length === 0) {
      setSavedSearchesExpanded(false);
    }
  }, [currentScraperSavedSearches.length, showSavedScraperSearches]);

  useEffect(() => {
    void loadLibraryMangas();

    const onMangasUpdated = () => {
      void loadLibraryMangas();
    };

    window.addEventListener('mangas-updated', onMangasUpdated as EventListener);
    return () => window.removeEventListener('mangas-updated', onMangasUpdated as EventListener);
  }, [loadLibraryMangas]);

  const {
    currentDetailsUrl,
    loadDetailsFromTargetUrl,
    runDetailsLookup,
    resolveCurrentPageUrls,
    handleDownload,
    handleLoadMoreThumbnails,
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
    setLoadingMoreThumbnails,
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

  const canSaveScraperSearch = showSavedScraperSearches
    && (mode === 'search' || mode === 'author')
    && query.trim().length > 0;

  const saveScraperSearch = useCallback((name: string) => {
    if (mode !== 'search' && mode !== 'author') {
      return;
    }

    const savedSearch: SavedScraperSearch = {
      id: generateId(),
      scraperId: scraper.id,
      name,
      mode,
      query: query.trim(),
      createdAt: new Date().toISOString(),
    };

    setParams({
      savedScraperSearches: [
        ...savedScraperSearches,
        savedSearch,
      ],
    }, { broadcast: false });
    setSavedSearchesExpanded(true);
    setSavedSearchDeleteMode(false);
  }, [mode, query, savedScraperSearches, scraper.id, setParams]);

  const handleSaveScraperSearch = useCallback(() => {
    if (!canSaveScraperSearch) {
      return;
    }

    openModal({
      title: 'Enregistrer la recherche',
      content: (
        <SaveSearchModalContent
          onCancel={closeModal}
          onSubmit={(name) => {
            saveScraperSearch(name);
            closeModal();
          }}
        />
      ),
      className: 'save-search-modal-shell',
    });
  }, [canSaveScraperSearch, closeModal, openModal, saveScraperSearch]);

  const handleSavedScraperSearchClick = useCallback(async (search: SavedScraperSearch) => {
    if (savedSearchDeleteMode) {
      const confirmed = window.confirm(`Supprimer la recherche "${search.name}" ?`);
      if (!confirmed) {
        return;
      }

      const nextSearches = savedScraperSearches.filter((item) => item.id !== search.id);
      setParams({ savedScraperSearches: nextSearches }, { broadcast: false });

      if (!nextSearches.some((item) => item.scraperId === scraper.id)) {
        setSavedSearchDeleteMode(false);
        setSavedSearchesExpanded(false);
      }
      return;
    }

    if (search.mode === 'search' && !hasSearch) {
      setRuntimeError('Le composant Recherche n\'est plus disponible pour ce scrapper.');
      return;
    }

    if (search.mode === 'author' && !hasAuthor) {
      setRuntimeError('Le composant Auteur n\'est plus disponible pour ce scrapper.');
      return;
    }

    const nextMode: ScraperListingMode = search.mode;
    setMode(nextMode);
    setQuery(search.query);
    setAuthorTemplateContext(null);

    if (nextMode === 'search') {
      await runSearchLookup(search.query);
      return;
    }

    await runAuthorLookup(search.query, { templateContext: null });
  }, [
    hasAuthor,
    hasSearch,
    runAuthorLookup,
    runSearchLookup,
    savedScraperSearches,
    savedSearchDeleteMode,
    scraper.id,
    setAuthorTemplateContext,
    setMode,
    setParams,
    setQuery,
    setRuntimeError,
  ]);

  const savedScraperSearchesList = showSavedScraperSearches && currentScraperSavedSearches.length > 0 ? (
    <SavedSearchesList
      searches={currentScraperSavedSearches}
      expanded={savedSearchesExpanded}
      deleteMode={savedSearchDeleteMode}
      onToggleExpanded={() => setSavedSearchesExpanded((value) => !value)}
      onToggleDeleteMode={() => setSavedSearchDeleteMode((value) => !value)}
      onSearchClick={(search) => {
        void handleSavedScraperSearchClick(search);
      }}
    />
  ) : null;

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
  const visibleSearchResultHistoryIds = useMemo(
    () => visibleSearchResults
      .map((result) => buildScraperViewHistoryCardId(buildSearchResultViewHistoryIdentity(scraper.id, result))),
    [scraper.id, visibleSearchResults],
  );
  const visibleSearchResultsHistoryKey = useMemo(
    () => visibleSearchResultHistoryIds.join('|'),
    [visibleSearchResultHistoryIds],
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

  const buildCurrentListingReturnState = useCallback((): ScraperListingReturnState | null => {
    if ((mode !== 'search' && mode !== 'author') || !hasExecutedListing) {
      return null;
    }

    return {
      mode,
      hasExecutedListing,
      query,
      page: listingPage,
      visitedPageUrls: listingVisitedPageUrls,
      pageIndex: listingPageIndex,
      results: listingResults,
      scrollTop: getCurrentScrollTop(),
      newResultIds: Array.from(newSearchResultIds),
    };
  }, [
    getCurrentScrollTop,
    hasExecutedListing,
    listingPage,
    listingPageIndex,
    listingResults,
    listingVisitedPageUrls,
    mode,
    newSearchResultIds,
    query,
  ]);

  const cacheCurrentListingReturnState = useCallback((): ScraperListingReturnState | null => {
    const returnState = buildCurrentListingReturnState();
    if (!returnState) {
      return null;
    }

    cacheScraperListingReturnState(
      buildScraperListingReturnStateCacheKey(location.pathname, location.search),
      returnState,
    );
    setListingReturnState(returnState);
    return returnState;
  }, [buildCurrentListingReturnState, location.pathname, location.search]);

  useEffect(() => {
    viewHistoryRecordsByIdRef.current = viewHistoryRecordsById;
  }, [viewHistoryRecordsById]);

  useEffect(() => {
    if (!visibleSearchResults.length) {
      setNewSearchResultIds(new Set());
      return;
    }

    const restoredNewResultIds = listingReturnState?.mode === mode
      && listingReturnState.query === query
      && listingReturnState.pageIndex === listingPageIndex
      ? listingReturnState.newResultIds ?? []
      : [];

    if (!viewHistoryLoaded) {
      setNewSearchResultIds(new Set());
      return;
    }

    if (restoredNewResultIds.length > 0) {
      const visibleIds = new Set(visibleSearchResultHistoryIds);
      setNewSearchResultIds(new Set(restoredNewResultIds.filter((id) => visibleIds.has(id))));
      return;
    }

    const historySnapshot = viewHistoryRecordsByIdRef.current;
    setNewSearchResultIds(new Set(
      visibleSearchResultHistoryIds
        .filter((id) => id && !historySnapshot.has(id)),
    ));
  }, [
    listingPageIndex,
    listingReturnState,
    mode,
    query,
    viewHistoryLoaded,
    visibleSearchResultHistoryIds,
    visibleSearchResults.length,
    visibleSearchResultsHistoryKey,
  ]);

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

  const handleOpenAuthorFromDetailsInWorkspace = useCallback((value: string, authorTitle: string) => {
    if (!authorConfig?.titleSelector || !authorConfig.resultItemSelector) {
      setRuntimeError('Le composant Auteur doit etre configure pour ouvrir cette page dans le workspace.');
      return;
    }

    if (!window.api || typeof window.api.openWorkspaceTarget !== 'function') {
      setRuntimeError('L\'ouverture dans une fenetre workspace n\'est pas disponible dans cette version.');
      return;
    }

    const target: WorkspaceTarget = {
      kind: 'scraper.author',
      scraperId: scraper.id,
      query: value,
      title: authorTitle || formatScraperValueForDisplay(value),
      templateContext: detailsResult ? buildScraperTemplateContextFromDetails(detailsResult) : undefined,
    };

    void window.api.openWorkspaceTarget(target)
      .then((opened: boolean) => {
        if (!opened) {
          setRuntimeError('Impossible d\'ouvrir cette page auteur dans le workspace.');
        }
      })
      .catch((error: unknown) => {
        setRuntimeError(error instanceof Error ? error.message : 'Impossible d\'ouvrir cette page auteur dans le workspace.');
      });
  }, [authorConfig, detailsResult, scraper.id, setRuntimeError]);

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

  const handleOpenListingResult = useCallback((result: ScraperSearchResultItem) => {
    const listingReturnStateToRestore = cacheCurrentListingReturnState();
    void handleOpenResult(result, {
      listingReturnState: listingReturnStateToRestore,
    });
  }, [cacheCurrentListingReturnState, handleOpenResult]);

  const handleOpenListingResultInWorkspace = useCallback((result: ScraperSearchResultItem) => {
    if (!result.detailUrl) {
      setRuntimeError('Cette card ne fournit pas d\'URL de fiche.');
      return;
    }

    if (!window.api || typeof window.api.openWorkspaceTarget !== 'function') {
      setRuntimeError('L\'ouverture dans une fenetre workspace n\'est pas disponible dans cette version.');
      return;
    }

    const target: WorkspaceTarget = {
      kind: 'scraper.details',
      scraperId: scraper.id,
      sourceUrl: result.detailUrl,
      title: result.title,
    };

    void window.api.openWorkspaceTarget(target)
      .then((opened: boolean) => {
        if (!opened) {
          setRuntimeError('Impossible d\'ouvrir cette fiche dans le workspace.');
        }
      })
      .catch((error: unknown) => {
        setRuntimeError(error instanceof Error ? error.message : 'Impossible d\'ouvrir cette fiche dans le workspace.');
      });
  }, [scraper.id, setRuntimeError]);

  const handleOpenAuthorResultInWorkspace = useCallback((result: ScraperSearchResultItem) => {
    if (!result.authorUrl) {
      setRuntimeError('Cette card ne fournit pas d\'URL auteur.');
      return;
    }

    if (!authorConfig?.titleSelector || !authorConfig.resultItemSelector) {
      setRuntimeError('Le composant Auteur doit etre configure pour ouvrir cette page dans le workspace.');
      return;
    }

    if (!window.api || typeof window.api.openWorkspaceTarget !== 'function') {
      setRuntimeError('L\'ouverture dans une fenetre workspace n\'est pas disponible dans cette version.');
      return;
    }

    const target: WorkspaceTarget = {
      kind: 'scraper.author',
      scraperId: scraper.id,
      query: result.authorUrl,
      title: result.title,
    };

    void window.api.openWorkspaceTarget(target)
      .then((opened: boolean) => {
        if (!opened) {
          setRuntimeError('Impossible d\'ouvrir cette page auteur dans le workspace.');
        }
      })
      .catch((error: unknown) => {
        setRuntimeError(error instanceof Error ? error.message : 'Impossible d\'ouvrir cette page auteur dans le workspace.');
      });
  }, [authorConfig, scraper.id, setRuntimeError]);

  const handleListingResultKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLElement>,
    result: ScraperSearchResultItem,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    handleOpenListingResult(result);
  }, [handleOpenListingResult]);

  const handleOpenResultAction = useCallback((result: ScraperSearchResultItem) => {
    handleOpenListingResult(result);
  }, [handleOpenListingResult]);

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

  const canDownloadListingCards = hasDetails
    && hasPages
    && canQueueStandaloneScraperDownload(detailsConfig, pagesConfig);

  const getLinkedMangaForListingSource = useCallback((sourceUrl: string | null | undefined): Manga | null => (
    findMangaLinkedToSource(libraryMangas, {
      scraperId: scraper.id,
      sourceUrl,
    })
  ), [libraryMangas, scraper.id]);

  const getLinkedLocalMangaForListingSource = useCallback((sourceUrl: string | null | undefined): Manga | null => (
    findLocalMangaLinkedToSource(libraryMangas, {
      scraperId: scraper.id,
      sourceUrl,
    })
  ), [libraryMangas, scraper.id]);

  const handleDownloadSearchResult = useCallback(async (result: ScraperSearchResultItem) => {
    if (!result.detailUrl) {
      setDownloadError('Aucune URL source n\'est disponible pour ce resultat.');
      return;
    }

    const linkedManga = getLinkedMangaForListingSource(result.detailUrl);

    setDownloading(true);
    setDownloadError(null);
    setDownloadMessage(null);

    try {
      const downloadResult = await queueStandaloneScraperCardDownload({
        scraper,
        detailsConfig,
        pagesConfig,
        sourceUrl: result.detailUrl,
        fallbackTitle: result.title,
        libraryMangas,
        replaceMangaId: linkedManga?.id ?? null,
      });

      setDownloadMessage(buildScraperDownloadQueuedMessage({
        queueResult: downloadResult.queueResult,
        isReplacement: Boolean(downloadResult.replaceMangaId),
      }));
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Le telechargement du manga a echoue.');
    } finally {
      setDownloading(false);
    }
  }, [
    detailsConfig,
    getLinkedMangaForListingSource,
    libraryMangas,
    pagesConfig,
    scraper,
    setDownloadError,
    setDownloadMessage,
    setDownloading,
  ]);

  const getLinkedMangaForSource = useCallback((
    chapter?: ScraperRuntimeChapterResult,
  ): Manga | null => {
    const sourceUrl = detailsResult?.finalUrl || detailsResult?.requestedUrl || '';

    return findMangaLinkedToSource(libraryMangas, {
      scraperId: scraper.id,
      sourceUrl,
      sourceChapterUrl: chapter?.url ?? null,
      sourceChapterLabel: chapter?.label ?? null,
    });
  }, [detailsResult?.finalUrl, detailsResult?.requestedUrl, libraryMangas, scraper.id]);

  const getLinkedLocalMangaForSource = useCallback((
    chapter?: ScraperRuntimeChapterResult,
  ): Manga | null => {
    const sourceUrl = detailsResult?.finalUrl || detailsResult?.requestedUrl || '';

    return findLocalMangaLinkedToSource(libraryMangas, {
      scraperId: scraper.id,
      sourceUrl,
      sourceChapterUrl: chapter?.url ?? null,
      sourceChapterLabel: chapter?.label ?? null,
    });
  }, [detailsResult?.finalUrl, detailsResult?.requestedUrl, libraryMangas, scraper.id]);

  const handleAddToLibrary = useCallback(async (chapter?: ScraperRuntimeChapterResult) => {
    if (!detailsResult) {
      setRuntimeError('Charge d\'abord une fiche avant de l\'ajouter a la bibliotheque.');
      return;
    }

    const normalizedChapter = isScraperRuntimeChapterResult(chapter) ? chapter : undefined;
    setAddingToLibrary(true);
    clearFeedback();

    try {
      const pageUrls = await resolveCurrentPageUrls(normalizedChapter);
      const result = await saveScraperMangaToLibrary({
        scraper,
        details: detailsResult,
        pageUrls,
        chapter: normalizedChapter,
        libraryMangas,
      });

      await loadLibraryMangas();
      setRuntimeMessage(
        result.created
          ? normalizedChapter
            ? 'Le chapitre distant a ete ajoute a la bibliotheque.'
            : 'Le manga distant a ete ajoute a la bibliotheque.'
          : normalizedChapter
            ? 'Le chapitre distant en bibliotheque a ete mis a jour.'
            : 'Le manga distant en bibliotheque a ete mis a jour.',
      );
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible d\'ajouter ce manga a la bibliotheque.');
    } finally {
      setAddingToLibrary(false);
    }
  }, [
    clearFeedback,
    detailsResult,
    libraryMangas,
    loadLibraryMangas,
    resolveCurrentPageUrls,
    scraper,
    setRuntimeError,
    setRuntimeMessage,
  ]);

  const handleLinkSourceToManga = useCallback((chapter?: ScraperRuntimeChapterResult) => {
    const sourceUrl = detailsResult?.finalUrl || detailsResult?.requestedUrl || '';
    if (!sourceUrl) {
      setRuntimeError('Aucune URL source n\'est disponible pour cette fiche.');
      return;
    }

    const currentLinkedManga = getLinkedLocalMangaForSource(chapter);

    openModal(buildScraperLinkMangaModal({
      mangas: libraryMangas,
      scraperId: scraper.id,
      sourceUrl,
      sourceTitle: detailsResult?.title || sourceUrl,
      sourceChapterUrl: chapter?.url ?? null,
      sourceChapterLabel: chapter?.label ?? null,
      currentLinkedMangaId: currentLinkedManga?.id ?? null,
      onLinked: () => void loadLibraryMangas(),
    }));
  }, [detailsResult, getLinkedLocalMangaForSource, libraryMangas, loadLibraryMangas, openModal, scraper.id, setRuntimeError]);

  const handleSetSearchResultRead = useCallback(async (
    result: ScraperSearchResultItem,
    read: boolean,
  ) => {
    try {
      await setScraperCardRead({
        ...buildSearchResultViewHistoryIdentity(scraper.id, result),
        read,
      });
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Impossible de mettre a jour l\'historique de lecture.');
    }
  }, [scraper.id, setRuntimeError]);

  const handleSearchResultViewed = useCallback((result: ScraperSearchResultItem) => {
    const identity = buildSearchResultViewHistoryIdentity(scraper.id, result);

    void recordScraperCardsSeen([
      identity,
    ]).catch((error) => {
      console.warn('Failed to record scraper card view', error);
    });
  }, [scraper.id]);

  const getSearchResultViewState = useCallback((result: ScraperSearchResultItem) => {
    const identity = buildSearchResultViewHistoryIdentity(scraper.id, result);
    const record = getScraperViewHistoryRecord(viewHistoryRecordsById, identity);
    const id = buildScraperViewHistoryCardId(identity);
    return getScraperCardViewState(record, Boolean(id && newSearchResultIds.has(id)));
  }, [newSearchResultIds, scraper.id, viewHistoryRecordsById]);

  const renderSearchResultReadAction = useCallback((result: ScraperSearchResultItem): ScraperCardAction => {
    const identity = buildSearchResultViewHistoryIdentity(scraper.id, result);
    const record = getScraperViewHistoryRecord(viewHistoryRecordsById, identity);
    const isRead = Boolean(record?.readAt);
    const label = isRead ? 'Lu' : 'Marquer lu';

    return {
      id: `read-${identity.sourceUrl || identity.title}`,
      type: 'secondary',
      label,
      ariaLabel: `${isRead ? 'Marquer non lu' : 'Marquer lu'} ${result.title}`,
      icon: <OpenBookIcon aria-hidden="true" focusable="false" />,
      className: [
        'is-read-toggle',
        isRead ? 'is-read' : '',
      ].join(' ').trim(),
      onClick: () => {
        void handleSetSearchResultRead(result, !isRead);
      },
    };
  }, [handleSetSearchResultRead, scraper.id, viewHistoryRecordsById]);

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
          pageCount={result.pageCount}
          excludedFields={scraper.globalConfig.bookmark.excludedFields}
          size="sm"
        />
      ),
    };
  }, [scraper.globalConfig.bookmark.excludedFields, scraper.id]);

  const renderSearchResultAddToLibraryAction = useCallback((result: ScraperSearchResultItem): ScraperCardAction | null => {
    if (!canDownloadListingCards || !result.detailUrl) {
      return null;
    }

    const detailUrl = result.detailUrl;
    const linkedManga = getLinkedMangaForListingSource(detailUrl);
    const label = linkedManga ? 'Mettre a jour la bibliotheque' : 'Ajouter a la bibliotheque';

    return {
      id: `add-library-${detailUrl}`,
      type: 'icon-secondary',
      label,
      ariaLabel: `${label} ${result.title}`,
      icon: <PlusSignIcon aria-hidden="true" focusable="false" />,
      className: [
        'is-add-library',
        linkedManga ? 'is-linked' : '',
      ].join(' ').trim(),
      onClick: () => {
        setAddingToLibrary(true);
        clearFeedback();

        void saveStandaloneScraperCardToLibrary({
          scraper,
          detailsConfig,
          pagesConfig,
          sourceUrl: detailUrl,
          fallbackTitle: result.title,
          libraryMangas,
        })
          .then(async (saveResult) => {
            await loadLibraryMangas();
            setRuntimeMessage(
              saveResult.created
                ? 'Le manga distant a ete ajoute a la bibliotheque.'
                : 'Le manga distant en bibliotheque a ete mis a jour.',
            );
          })
          .catch((error: unknown) => {
            setRuntimeError(error instanceof Error ? error.message : 'Impossible d\'ajouter ce manga a la bibliotheque.');
          })
          .finally(() => {
            setAddingToLibrary(false);
          });
      },
      disabled: addingToLibrary,
    };
  }, [
    addingToLibrary,
    canDownloadListingCards,
    clearFeedback,
    detailsConfig,
    getLinkedMangaForListingSource,
    libraryMangas,
    loadLibraryMangas,
    pagesConfig,
    scraper,
    setRuntimeError,
    setRuntimeMessage,
  ]);

  const renderSearchResultDownloadAction = useCallback((result: ScraperSearchResultItem): ScraperCardAction | null => {
    if (!canDownloadListingCards || !result.detailUrl) {
      return null;
    }

    const linkedLocalManga = getLinkedLocalMangaForListingSource(result.detailUrl);
    const label = linkedLocalManga ? 'Retelecharger' : 'Telecharger';

    return {
      id: `download-${result.detailUrl}`,
      type: 'icon-secondary',
      label,
      ariaLabel: `${label} ${result.title}`,
      icon: <DownloadArrowIcon aria-hidden="true" focusable="false" />,
      className: [
        'is-download',
        linkedLocalManga ? 'is-linked' : '',
      ].join(' ').trim(),
      onClick: () => {
        void handleDownloadSearchResult(result);
      },
      disabled: downloading,
    };
  }, [
    canDownloadListingCards,
    downloading,
    getLinkedLocalMangaForListingSource,
    handleDownloadSearchResult,
  ]);

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
          canSaveSearch={canSaveScraperSearch}
          savedSearchesList={savedScraperSearchesList}
          onSubmit={handleSubmit}
          onSaveSearch={handleSaveScraperSearch}
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
        getViewState={getSearchResultViewState}
        renderReadAction={renderSearchResultReadAction}
        renderBookmarkAction={renderSearchResultBookmarkAction}
        renderAddToLibraryAction={renderSearchResultAddToLibraryAction}
        renderDownloadAction={renderSearchResultDownloadAction}
        onPreviousPage={() => void handleListingPreviousPage()}
        onNextPage={() => void handleListingNextPage()}
        onBack={handleNavigateBack}
        onOpenResult={handleOpenListingResult}
        onOpenAuthorResultAction={handleOpenAuthorResultAction}
        onResultKeyDown={handleListingResultKeyDown}
        onOpenResultAction={handleOpenResultAction}
        onOpenResultImage={handleOpenSearchResultImage}
        onOpenResultInWorkspace={handleOpenListingResultInWorkspace}
        onOpenAuthorInWorkspace={handleOpenAuthorResultInWorkspace}
        onResultViewed={handleSearchResultViewed}
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
        addingToLibrary={addingToLibrary}
        loadingMoreThumbnails={loadingMoreThumbnails}
        getLinkedMangaForSource={getLinkedMangaForSource}
        getLinkedLocalMangaForSource={getLinkedLocalMangaForSource}
        onBack={canNavigateBack ? handleNavigateBack : () => void handleBackToListing()}
        onOpenAuthor={(value) => {
          handleOpenAuthorFromDetails(value);
        }}
        onOpenAuthorInWorkspace={handleOpenAuthorFromDetailsInWorkspace}
        onOpenReader={(options) => void handleOpenReader(options)}
        onAddToLibrary={(chapter) => {
          void handleAddToLibrary(chapter);
        }}
        onLinkSourceToManga={(chapter) => handleLinkSourceToManga(chapter)}
        onLoadMoreThumbnails={() => void handleLoadMoreThumbnails()}
        onDownload={(chapter) => {
          const linkedManga = getLinkedMangaForSource(chapter);
          void handleDownload(chapter, {
            replaceMangaId: linkedManga?.id ?? null,
          });
        }}
      />
    </section>
  );
}
