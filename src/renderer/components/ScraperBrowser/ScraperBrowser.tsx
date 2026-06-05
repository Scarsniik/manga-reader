import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  buildScraperViewHistoryCardId,
  hasScraperFieldSelectorValue,
  ScraperAuthorFavoriteRecord,
  ScraperRecord,
  ScraperSearchResultItem,
  ScraperTagFavoriteRecord,
} from '@/shared/scraper';
import type { Manga, SavedScraperSearch } from '@/renderer/types';
import buildConfirmActionModal from '@/renderer/components/Modal/modales/ConfirmActionModal';
import buildScraperConfigModal from '@/renderer/components/Modal/modales/ScraperConfigModal';
import buildScraperImagePreviewModal from '@/renderer/components/Modal/modales/ScraperImagePreviewModal';
import buildScraperLinkMangaModal from '@/renderer/components/Modal/modales/ScraperLinkMangaModal';
import SavedSearchesList from '@/renderer/components/SavedSearches/SavedSearchesList';
import SaveSearchModalContent from '@/renderer/components/SavedSearches/SaveSearchModalContent';
import ScraperBrowserHero from '@/renderer/components/ScraperBrowser/components/ScraperBrowserHero';
import ScraperBrowserMessages from '@/renderer/components/ScraperBrowser/components/ScraperBrowserMessages';
import ScraperBrowserToolbar from '@/renderer/components/ScraperBrowser/components/ScraperBrowserToolbar';
import ScraperDetailsPanel from '@/renderer/components/ScraperBrowser/components/ScraperDetailsPanel';
import ScraperAuthorCombinedView from '@/renderer/components/ScraperBrowser/components/ScraperAuthorCombinedView';
import ScraperSearchResultsSection from '@/renderer/components/ScraperBrowser/components/ScraperSearchResultsSection';
import useScraperBrowserDetails from '@/renderer/components/ScraperBrowser/hooks/useScraperBrowserDetails';
import useScraperPotentialMangaMatches from '@/renderer/components/ScraperBrowser/hooks/useScraperPotentialMangaMatches';
import useScraperBrowserRouteSync from '@/renderer/components/ScraperBrowser/hooks/useScraperBrowserRouteSync';
import useScraperBrowserSearch from '@/renderer/components/ScraperBrowser/hooks/useScraperBrowserSearch';
import type { ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import ScraperAuthorFavoriteButton from '@/renderer/components/ScraperAuthorFavoriteButton/ScraperAuthorFavoriteButton';
import ScraperTagFavoriteButton from '@/renderer/components/ScraperTagFavoriteButton/ScraperTagFavoriteButton';
import { DownloadArrowIcon, MagnifyingGlassIcon, OpenBookIcon, PlusSignIcon } from '@/renderer/components/icons';
import type { MultiSearchSourceResult } from '@/renderer/components/MultiSearch/types';
import type { ScraperPotentialMangaMatch } from '@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes';
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
  setScraperCardRead,
  useScraperViewHistory,
} from '@/renderer/stores/scraperViewHistory';
import {
  clearScraperRouteState,
  parseScraperRouteState,
  SCRAPER_AUTHOR_FAVORITES_VIEW_ID,
  SCRAPER_MULTI_SEARCH_VIEW_ID,
  SCRAPER_TAG_FAVORITES_VIEW_ID,
  writeScraperAuthorFavoriteRouteState,
  writeScraperRouteState,
  writeScraperTagFavoriteRouteState,
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
import { recordSearchHistorySafe } from '@/renderer/utils/history';
import { getScraperBookmarkLanguageCodes } from '@/renderer/utils/scraperBookmarkMetadata';
import {
  buildSearchResultViewHistoryIdentity,
  getScraperViewHistoryRecord,
} from '@/renderer/utils/scraperViewHistory';
import { saveScraperLatestCheckpointFromResult } from '@/renderer/utils/scraperLatestCheckpoints';
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
  getScraperHomepageFeatureConfig,
  getScraperPagesFeatureConfig,
  getScraperSearchFeatureConfig,
  getScraperTagFeatureConfig,
  getScraperTitleAnalysisFeatureConfig,
  hasAuthorPagePlaceholder,
  hasSearchPagePlaceholder,
  hasTagPagePlaceholder,
  isScraperFeatureConfigured,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeSearchPageResult,
} from '@/renderer/utils/scraperRuntime';
import { getScraperTitleAnalysisSearchTitle } from '@/renderer/utils/scraperTitleAnalysis';
import { buildScraperTemplateContextFromDetails, type ScraperTemplateContext } from '@/renderer/utils/scraperTemplateContext';
import {
  buildUniqueAuthorSearchNames,
  formatAuthorDisplayName,
  formatAuthorMultiSearchQuery,
} from '@/renderer/utils/authorSearchNames';
import generateId from '@/utils/id';
import useParams from '@/renderer/hooks/useParams';
import type { ReaderWorkspaceTarget, WorkspaceTarget } from '@/renderer/types/workspace';
import { openWorkspaceTarget } from '@/renderer/utils/workspaceTargets';
import './style.scss';

type Props = {
  scraper: ScraperRecord;
  initialState?: ScraperBrowserInitialState | null;
  onOpenReaderTarget?: (target: ReaderWorkspaceTarget, options?: { returnTarget?: WorkspaceTarget }) => void;
  onOpenWorkspaceTarget?: (target: WorkspaceTarget, options?: { returnTarget?: WorkspaceTarget }) => void;
  routeSyncEnabled?: boolean;
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

  if (sourceKind === 'tag') {
    return 'Retour a la page tag';
  }

  if (sourceKind === 'bookmarks') {
    return 'Retour aux bookmarks';
  }

  if (sourceKind === 'search') {
    return 'Retour a la recherche';
  }

  if (sourceKind === 'homepage') {
    return 'Retour a la homepage';
  }

  if (fallbackListingMode === 'author') {
    return 'Retour a la page auteur';
  }

  if (fallbackListingMode === 'tag') {
    return 'Retour a la page tag';
  }

  if (fallbackListingMode === 'search') {
    return 'Retour a la recherche';
  }

  if (fallbackListingMode === 'homepage') {
    return 'Retour a la homepage';
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

export default function ScraperBrowser({
  scraper,
  initialState = null,
  onOpenReaderTarget,
  onOpenWorkspaceTarget,
  routeSyncEnabled = true,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as ScraperBrowserLocationState | null;
  const { openModal, closeModal } = useModal();
  const { params, setParams } = useParams();
  const showSavedScraperSearches = params?.showSavedScraperSearches !== false;
  const scraperAuthorCombinedViewEnabled = params?.scraperAuthorCombinedView === true;
  const homepageFeature = useMemo(() => getScraperFeature(scraper, 'homepage'), [scraper]);
  const searchFeature = useMemo(() => getScraperFeature(scraper, 'search'), [scraper]);
  const detailsFeature = useMemo(() => getScraperFeature(scraper, 'details'), [scraper]);
  const authorFeature = useMemo(() => getScraperFeature(scraper, 'author'), [scraper]);
  const tagFeature = useMemo(() => getScraperFeature(scraper, 'tag'), [scraper]);
  const chaptersFeature = useMemo(() => getScraperFeature(scraper, 'chapters'), [scraper]);
  const pagesFeature = useMemo(() => getScraperFeature(scraper, 'pages'), [scraper]);
  const titleAnalysisFeature = useMemo(() => getScraperFeature(scraper, 'titleAnalysis'), [scraper]);
  const homepageConfig = useMemo(() => getScraperHomepageFeatureConfig(homepageFeature), [homepageFeature]);
  const searchConfig = useMemo(() => getScraperSearchFeatureConfig(searchFeature), [searchFeature]);
  const detailsConfig = useMemo(() => getScraperDetailsFeatureConfig(detailsFeature), [detailsFeature]);
  const authorConfig = useMemo(() => getScraperAuthorFeatureConfig(authorFeature), [authorFeature]);
  const tagConfig = useMemo(() => getScraperTagFeatureConfig(tagFeature), [tagFeature]);
  const chaptersConfig = useMemo(() => getScraperChaptersFeatureConfig(chaptersFeature), [chaptersFeature]);
  const pagesConfig = useMemo(() => getScraperPagesFeatureConfig(pagesFeature), [pagesFeature]);
  const titleAnalysisConfig = useMemo(
    () => getScraperTitleAnalysisFeatureConfig(titleAnalysisFeature),
    [titleAnalysisFeature],
  );

  const hasHomepage = isScraperFeatureConfigured(homepageFeature);
  const hasSearch = isScraperFeatureConfigured(searchFeature);
  const hasDetails = isScraperFeatureConfigured(detailsFeature);
  const hasAuthor = isScraperFeatureConfigured(authorFeature);
  const hasTag = isScraperFeatureConfigured(tagFeature);
  const hasChapters = isScraperFeatureConfigured(chaptersFeature);
  const hasPages = isScraperFeatureConfigured(pagesFeature);
  const usesChaptersForPages = usesScraperPagesChapters(pagesConfig);
  const availableModes = useMemo<ScraperBrowseMode[]>(() => {
    const nextModes: ScraperBrowseMode[] = [];
    if (hasHomepage) {
      nextModes.push('homepage');
    }
    if (hasSearch) {
      nextModes.push('search');
    }
    if (hasDetails) {
      nextModes.push('manga');
    }
    if (hasAuthor) {
      nextModes.push('author');
    }
    if (hasTag) {
      nextModes.push('tag');
    }
    return nextModes;
  }, [hasAuthor, hasDetails, hasHomepage, hasSearch, hasTag]);

  const defaultMode = useMemo<ScraperBrowseMode>(() => {
    if (initialState?.listingMode && availableModes.includes(initialState.listingMode)) {
      return initialState.listingMode;
    }

    if (initialState?.detailsResult && availableModes.includes('manga')) {
      return 'manga';
    }

    if (availableModes.includes('homepage')) {
      return 'homepage';
    }

    if (availableModes.includes('search')) {
      return 'search';
    }

    if (availableModes.includes('author')) {
      return 'author';
    }

    if (availableModes.includes('tag')) {
      return 'tag';
    }

    return availableModes[0] ?? 'manga';
  }, [availableModes, initialState?.detailsResult, initialState?.listingMode]);

  const canOpenSearchResultsAsDetails = Boolean(
    hasDetails && hasScraperFieldSelectorValue(detailsConfig?.titleSelector),
  );
  const canOpenSearchResultsAsAuthor = Boolean(
    hasAuthor
    && hasScraperFieldSelectorValue(authorConfig?.titleSelector)
    && authorConfig?.resultItemSelector,
  );
  const usesSearchTemplatePaging = hasSearchPagePlaceholder(searchConfig);
  const usesHomepageTemplatePaging = hasSearchPagePlaceholder(homepageConfig);
  const usesAuthorTemplatePaging = hasAuthorPagePlaceholder(authorConfig);
  const usesTagTemplatePaging = hasTagPagePlaceholder(tagConfig);
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
  const [authorSourceNameHint, setAuthorSourceNameHint] = useState<{ query: string; name: string } | null>(null);
  const [tagSourceNameHint, setTagSourceNameHint] = useState<{ query: string; name: string } | null>(null);
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
  const titleMultiSearchQuery = useMemo(() => {
    const rawTitle = detailsResult?.title?.trim() ?? '';
    if (!rawTitle) {
      return '';
    }

    return getScraperTitleAnalysisSearchTitle(rawTitle, titleAnalysisConfig).trim();
  }, [detailsResult?.title, titleAnalysisConfig]);
  const potentialMatchMergeOptions = useMemo(() => ({
    enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
  }), [params?.multiSearchEnableRomajiPhoneticMerge]);
  const {
    readingMatches: potentialReadingMatches,
    bookmarkMatches: potentialBookmarkMatches,
    loading: loadingPotentialMatches,
  } = useScraperPotentialMangaMatches({
    scraper,
    detailsResult,
    libraryMangas,
    mergeOptions: potentialMatchMergeOptions,
  });

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
    onOpenReaderTarget,
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
    runHomepageLookup,
    runSearchLookup,
    runAuthorLookup,
    runTagLookup,
    handleListingNextPage,
    handleListingPreviousPage,
    handleOpenResult,
    handleOpenAuthorResult,
    handleBackToListing,
    handleGoToHome,
    handleModeChange,
  } = useScraperBrowserSearch({
    scraper,
    routeSyncEnabled,
    locationPathname: location.pathname,
    locationSearch: location.search,
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
  });

  useScraperBrowserRouteSync({
    enabled: routeSyncEnabled,
    scraperId: scraper.id,
    initialState,
    locationPathname: location.pathname,
    locationSearch: location.search,
    locationState,
    navigate,
    availableModes,
    defaultMode,
    hasHomepage,
    hasSearch,
    hasAuthor,
    hasTag,
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
    runHomepageLookup,
    runSearchLookup,
    runAuthorLookup,
    runTagLookup,
    runDetailsLookup,
    loadDetailsFromTargetUrl,
  });

  useEffect(() => {
    if (
      !hasExecutedListing
      || !listingPage
      || !listingResults.length
      || (mode !== 'homepage' && mode !== 'search')
    ) {
      return;
    }

    const anchorResult = listingResults[listingResults.length - 1];
    if (!anchorResult) {
      return;
    }

    void saveScraperLatestCheckpointFromResult({
      scraper,
      module: mode,
      query: mode === 'search' ? query : '',
      pageIndex: listingPageIndex,
      page: listingPage,
      result: anchorResult,
    }).catch((checkpointError) => {
      console.warn('Failed to save scraper latest checkpoint from browser page', checkpointError);
    });
  }, [hasExecutedListing, listingPage, listingPageIndex, listingResults, mode, query, scraper]);

  const recordScraperSearchHistory = useCallback((searchQuery: string) => {
    const trimmedSearchQuery = searchQuery.trim();
    if (!trimmedSearchQuery) {
      return;
    }

    void recordSearchHistorySafe({
      sourceKind: 'scraper',
      query: trimmedSearchQuery,
      scraperId: scraper.id,
      scraperName: scraper.name,
    });
  }, [scraper.id, scraper.name]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedQuery = query.trim();
    if (mode === 'search') {
      await runSearchLookup(trimmedQuery);
      recordScraperSearchHistory(trimmedQuery);
      return;
    }

    if (mode === 'homepage') {
      setQuery('');
      await runHomepageLookup();
      return;
    }

    if (mode === 'author') {
      await runAuthorLookup(trimmedQuery);
      return;
    }

    if (mode === 'tag') {
      await runTagLookup(trimmedQuery);
      return;
    }

    if (!trimmedQuery) {
      setRuntimeError('Saisis une valeur avant de lancer le scrapper.');
      return;
    }

    await runDetailsLookup(trimmedQuery);
  }, [mode, query, recordScraperSearchHistory, runAuthorLookup, runDetailsLookup, runHomepageLookup, runSearchLookup, runTagLookup, setQuery]);

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
      openModal(buildConfirmActionModal({
        title: 'Supprimer la recherche',
        message: (
          <>
            Supprimer la recherche <strong>{search.name}</strong> ?
          </>
        ),
        details: 'Ce groupe de filtres ne sera plus disponible.',
        confirmLabel: 'Supprimer',
        confirmVariant: 'danger',
        onConfirm: () => {
          const nextSearches = savedScraperSearches.filter((item) => item.id !== search.id);
          setParams({ savedScraperSearches: nextSearches }, { broadcast: false });

          if (!nextSearches.some((item) => item.scraperId === scraper.id)) {
            setSavedSearchDeleteMode(false);
            setSavedSearchesExpanded(false);
          }
        },
      }));
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
      recordScraperSearchHistory(search.query);
      return;
    }

    await runAuthorLookup(search.query, { templateContext: null });
  }, [
    hasAuthor,
    hasSearch,
    openModal,
    runAuthorLookup,
    runSearchLookup,
    savedScraperSearches,
    savedSearchDeleteMode,
    recordScraperSearchHistory,
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
      hasTag,
      tagConfig?.urlStrategy ?? null,
    ),
    [authorConfig?.urlStrategy, detailsConfig?.urlStrategy, hasAuthor, hasDetails, hasTag, mode, tagConfig?.urlStrategy],
  );

  const capabilities = useMemo<ScraperCapability[]>(() => buildScraperCapabilities({
    homepageFeature,
    searchFeature,
    detailsFeature,
    authorFeature,
    tagFeature,
    chaptersFeature,
    pagesFeature,
    hasHomepage,
    hasSearch,
    hasDetails,
    hasAuthor,
    hasTag,
    hasChapters,
    hasPages,
  }), [
    authorFeature,
    tagFeature,
    chaptersFeature,
    detailsFeature,
    hasAuthor,
    hasTag,
    hasChapters,
    hasDetails,
    hasHomepage,
    hasPages,
    hasSearch,
    homepageFeature,
    pagesFeature,
    searchFeature,
  ]);

  const helperText = useMemo(() => buildScraperBrowserHelperText({
    mode,
    usesSearchTemplatePaging: mode === 'homepage' ? usesHomepageTemplatePaging : usesSearchTemplatePaging,
    usesAuthorTemplatePaging,
    usesTagTemplatePaging,
    hasSearchNextPageSelector: hasScraperFieldSelectorValue(
      mode === 'homepage' ? homepageConfig?.nextPageSelector : searchConfig?.nextPageSelector,
    ),
    hasAuthorNextPageSelector: hasScraperFieldSelectorValue(authorConfig?.nextPageSelector),
    hasTagNextPageSelector: hasScraperFieldSelectorValue(tagConfig?.nextPageSelector),
    canOpenSearchResultsAsDetails,
    canOpenSearchResultsAsAuthor,
    hasDetails,
    hasAuthor,
    hasTag,
  }), [
    authorConfig?.nextPageSelector,
    canOpenSearchResultsAsAuthor,
    canOpenSearchResultsAsDetails,
    hasAuthor,
    hasDetails,
    hasTag,
    homepageConfig?.nextPageSelector,
    mode,
    searchConfig?.nextPageSelector,
    tagConfig?.nextPageSelector,
    usesAuthorTemplatePaging,
    usesHomepageTemplatePaging,
    usesSearchTemplatePaging,
    usesTagTemplatePaging,
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
  const authorResultsBackLabel = (mode === 'author' || mode === 'tag') && canNavigateBack
    ? buildBackLabel(historySourceKind, null)
    : null;
  const usesActiveTemplatePaging = mode === 'author'
    ? usesAuthorTemplatePaging
    : mode === 'tag'
      ? usesTagTemplatePaging
    : mode === 'homepage'
      ? usesHomepageTemplatePaging
      : usesSearchTemplatePaging;
  const initialAuthorDisplayQuery = initialState?.listingMode === 'author'
    ? formatScraperValueForDisplay(initialState.query || '')
    : '';
  const fallbackAuthorSourceName = authorSourceNameHint?.query === query
    ? authorSourceNameHint.name
    : initialAuthorDisplayQuery && initialAuthorDisplayQuery === query && initialState?.authorDisplayName
      ? initialState.authorDisplayName
      : formatScraperValueForDisplay(query) || query;
  const authorSourceName = listingPage?.authorNames?.[0] || fallbackAuthorSourceName;
  const authorNameCandidates = useMemo(() => (
    buildUniqueAuthorSearchNames([
      ...(listingPage?.authorNames ?? []),
      fallbackAuthorSourceName,
    ])
  ), [fallbackAuthorSourceName, listingPage?.authorNames]);
  const authorResultsTitle = formatAuthorDisplayName(authorNameCandidates[0]);
  const authorMultiSearchQuery = useMemo(() => (
    formatAuthorMultiSearchQuery(authorNameCandidates)
  ), [authorNameCandidates]);
  const initialTagDisplayQuery = initialState?.listingMode === 'tag'
    ? formatScraperValueForDisplay(initialState.query || '')
    : '';
  const fallbackTagSourceName = tagSourceNameHint?.query === query
    ? tagSourceNameHint.name
    : initialTagDisplayQuery && initialTagDisplayQuery === query && initialState?.tagDisplayName
    ? initialState.tagDisplayName
    : formatScraperValueForDisplay(query) || query;
  const tagSourceName = listingPage?.listingNames?.[0] || fallbackTagSourceName;
  const tagResultsTitle = tagSourceName ? formatScraperValueForDisplay(tagSourceName) : 'Tag';
  const handleOpenAuthorFavorite = useCallback((favorite: ScraperAuthorFavoriteRecord) => {
    const favoritesSearch = writeScraperAuthorFavoriteRouteState(
      writeScraperRouteState(location.search, {
        scraperId: SCRAPER_AUTHOR_FAVORITES_VIEW_ID,
        mode: 'search',
        homepageActive: false,
        homepagePage: 1,
        searchActive: false,
        searchQuery: '',
        searchPage: 1,
        authorActive: false,
        authorQuery: '',
        authorPage: 1,
        mangaQuery: '',
        mangaUrl: '',
        bookmarksFilterScraperId: null,
      }),
      favorite.id,
    );

    navigate({
      pathname: '/',
      search: favoritesSearch,
    });
  }, [location.search, navigate]);
  const handleOpenTagFavorite = useCallback((favorite: ScraperTagFavoriteRecord) => {
    const favoritesSearch = writeScraperTagFavoriteRouteState(
      writeScraperRouteState(location.search, {
        scraperId: SCRAPER_TAG_FAVORITES_VIEW_ID,
        mode: 'search',
        homepageActive: false,
        homepagePage: 1,
        searchActive: false,
        searchQuery: '',
        searchPage: 1,
        authorActive: false,
        authorQuery: '',
        authorPage: 1,
        tagActive: false,
        tagQuery: '',
        tagPage: 1,
        mangaQuery: '',
        mangaUrl: '',
        bookmarksFilterScraperId: null,
      }),
      favorite.id,
    );

    navigate({
      pathname: '/',
      search: favoritesSearch,
    });
  }, [location.search, navigate]);
  const handleOpenAuthorMultiSearch = useCallback(() => {
    if (!authorMultiSearchQuery) {
      setRuntimeError('Aucun nom auteur exploitable n\'est disponible pour pre-remplir la recherche multi-sources.');
      return;
    }

    const multiSearch = writeScraperRouteState(location.search, {
      scraperId: SCRAPER_MULTI_SEARCH_VIEW_ID,
      mode: 'search',
      homepageActive: false,
      homepagePage: 1,
      searchActive: false,
      searchQuery: '',
      searchPage: 1,
      authorActive: false,
      authorQuery: '',
      authorPage: 1,
      mangaQuery: '',
      mangaUrl: '',
      bookmarksFilterScraperId: null,
    });

    navigate(
      {
        pathname: '/',
        search: multiSearch,
      },
      {
        state: {
          multiSearchPrefillQuery: authorMultiSearchQuery,
        },
      },
    );
  }, [authorMultiSearchQuery, location.search, navigate, setRuntimeError]);
  const buildTitleMultiSearchTarget = useCallback((): WorkspaceTarget | null => {
    if (!titleMultiSearchQuery) {
      return null;
    }

    return {
      kind: 'manga-manager.view',
      viewId: SCRAPER_MULTI_SEARCH_VIEW_ID,
      title: 'Recherche multi-sources',
      locationState: {
        multiSearchPrefillQuery: titleMultiSearchQuery,
      },
    };
  }, [titleMultiSearchQuery]);

  const handleOpenTitleMultiSearch = useCallback(() => {
    const target = buildTitleMultiSearchTarget();
    if (!target) {
      setRuntimeError('Aucun titre exploitable n\'est disponible pour pre-remplir la recherche multi-sources.');
      return;
    }

    if (onOpenWorkspaceTarget) {
      onOpenWorkspaceTarget(target);
      return;
    }

    const multiSearch = writeScraperRouteState(location.search, {
      scraperId: SCRAPER_MULTI_SEARCH_VIEW_ID,
      mode: 'search',
      homepageActive: false,
      homepagePage: 1,
      searchActive: false,
      searchQuery: '',
      searchPage: 1,
      authorActive: false,
      authorQuery: '',
      authorPage: 1,
      tagActive: false,
      tagQuery: '',
      tagPage: 1,
      mangaQuery: '',
      mangaUrl: '',
      bookmarksFilterScraperId: null,
    });

    navigate(
      {
        pathname: '/',
        search: multiSearch,
      },
      {
        state: {
          multiSearchPrefillQuery: titleMultiSearchQuery,
        },
      },
    );
  }, [
    buildTitleMultiSearchTarget,
    location.search,
    navigate,
    onOpenWorkspaceTarget,
    setRuntimeError,
    titleMultiSearchQuery,
  ]);
  const handleOpenTitleMultiSearchInWorkspace = useCallback(() => {
    const target = buildTitleMultiSearchTarget();
    if (!target) {
      setRuntimeError('Aucun titre exploitable n\'est disponible pour pre-remplir la recherche multi-sources.');
      return;
    }

    void openWorkspaceTarget(target)
      .then((opened) => {
        if (!opened) {
          setRuntimeError('Impossible d\'ouvrir la recherche multi-sources dans un onglet workspace.');
        }
      })
      .catch((error: unknown) => {
        setRuntimeError(error instanceof Error ? error.message : 'Impossible d\'ouvrir la recherche multi-sources dans un onglet workspace.');
      });
  }, [buildTitleMultiSearchTarget, setRuntimeError]);
  const buildLibrarySearchTarget = useCallback((title: string): WorkspaceTarget => ({
    kind: 'manga-manager.view',
    viewId: 'library',
    title: 'Bibliotheque',
    locationState: {
      librarySearchQuery: title,
    },
  }), []);
  const buildPotentialMatchTarget = useCallback((match: ScraperPotentialMangaMatch): WorkspaceTarget => {
    if (match.target.kind === 'library') {
      return buildLibrarySearchTarget(match.target.title);
    }

    return {
      kind: 'scraper.details',
      scraperId: match.target.scraperId,
      sourceUrl: match.target.sourceUrl,
      title: match.target.title,
    };
  }, [buildLibrarySearchTarget]);
  const buildLibraryRouteSearch = useCallback((title: string): string => {
    const clearedSearch = clearScraperRouteState(location.search);
    const searchParams = new URLSearchParams(clearedSearch.startsWith('?') ? clearedSearch.slice(1) : clearedSearch);
    searchParams.set('q', title);
    const nextSearch = searchParams.toString();
    return nextSearch ? `?${nextSearch}` : '';
  }, [location.search]);
  const handleOpenPotentialMatch = useCallback((match: ScraperPotentialMangaMatch) => {
    if (match.target.kind === 'library') {
      if (onOpenWorkspaceTarget && !routeSyncEnabled) {
        onOpenWorkspaceTarget(buildLibrarySearchTarget(match.target.title));
        return;
      }

      navigate({
        pathname: location.pathname,
        search: buildLibraryRouteSearch(match.target.title),
      });
      return;
    }

    if (onOpenWorkspaceTarget && !routeSyncEnabled) {
      onOpenWorkspaceTarget(buildPotentialMatchTarget(match));
      return;
    }

    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId: match.target.scraperId,
        mode: 'manga',
        searchActive: false,
        searchQuery: '',
        searchPage: 1,
        authorActive: false,
        authorQuery: '',
        authorPage: 1,
        tagActive: false,
        tagQuery: '',
        tagPage: 1,
        mangaQuery: '',
        mangaUrl: match.target.sourceUrl,
        bookmarksFilterScraperId: null,
      }),
    }, {
      state: {
        ...(locationState ?? {}),
        scraperBrowserHistorySource: {
          kind: 'manga',
        },
        scraperBrowserListingReturnState: null,
        scraperBrowserAuthorTemplateContext: null,
      },
    });
  }, [
    buildLibraryRouteSearch,
    buildLibrarySearchTarget,
    buildPotentialMatchTarget,
    location.pathname,
    location.search,
    locationState,
    navigate,
    onOpenWorkspaceTarget,
    routeSyncEnabled,
  ]);
  const handleOpenPotentialMatchInWorkspace = useCallback((match: ScraperPotentialMangaMatch) => {
    const target = buildPotentialMatchTarget(match);

    void openWorkspaceTarget(target)
      .then((opened) => {
        if (!opened) {
          setRuntimeError('Impossible d\'ouvrir cette correspondance dans un onglet workspace.');
        }
      })
      .catch((error: unknown) => {
        setRuntimeError(error instanceof Error ? error.message : 'Impossible d\'ouvrir cette correspondance dans un onglet workspace.');
      });
  }, [buildPotentialMatchTarget, setRuntimeError]);
  const handleSwitchAuthorCombinedView = useCallback((enabled: boolean) => {
    setParams({ scraperAuthorCombinedView: enabled }, { remount: false });
  }, [setParams]);
  const authorCombinedViewAction = mode === 'author' && !scraperAuthorCombinedViewEnabled ? (
    <button
      type="button"
      className="scraper-browser__back-to-search"
      onClick={() => handleSwitchAuthorCombinedView(true)}
      title="Afficher cette page auteur avec la vue combinee"
    >
      Vue combinee
    </button>
  ) : null;
  const authorMultiSearchAction = mode === 'author' ? (
    <button
      type="button"
      className="scraper-browser__author-multi-search"
      onClick={handleOpenAuthorMultiSearch}
      disabled={loading || !authorMultiSearchQuery}
      title={authorMultiSearchQuery
        ? `Pre-remplir la recherche multi-sources avec ${authorMultiSearchQuery}`
        : 'Aucun nom auteur disponible'}
    >
      <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
      <span>Recherche multi-source</span>
    </button>
  ) : null;
  const authorFavoriteAction = mode === 'author' && query.trim() ? (
    <ScraperAuthorFavoriteButton
      scraperId={scraper.id}
      scraperName={scraper.name}
      authorUrl={query}
      sourceName={authorSourceName}
      cover={listingResults[0]?.thumbnailUrl}
      templateContext={authorTemplateContext ?? undefined}
      onOpenFavorite={handleOpenAuthorFavorite}
      disabled={loading}
    />
  ) : null;
  const tagFavoriteAction = mode === 'tag' && query.trim() ? (
    <ScraperTagFavoriteButton
      scraperId={scraper.id}
      scraperName={scraper.name}
      tagUrl={query}
      sourceName={tagSourceName}
      cover={listingResults[0]?.thumbnailUrl}
      onOpenFavorite={handleOpenTagFavorite}
      disabled={loading}
    />
  ) : null;
  const authorHeaderAction = mode === 'author' ? (
    <>
      {authorCombinedViewAction}
      {authorMultiSearchAction}
      {authorFavoriteAction}
    </>
  ) : null;
  const tagHeaderAction = mode === 'tag' ? (
    <>
      {tagFavoriteAction}
    </>
  ) : null;
  const listingHeaderAction = mode === 'tag' ? tagHeaderAction : authorHeaderAction;
  const shouldShowSearchPagination = Boolean(
    listingPage && (listingPageIndex > 0 || listingPage.nextPageUrl || usesActiveTemplatePaging),
  );
  const shouldShowAuthorCombinedView = Boolean(
    mode === 'author'
    && scraperAuthorCombinedViewEnabled
    && hasExecutedListing
    && query.trim().length > 0,
  );
  const paginationInfoLabel = useMemo(
    () => buildPaginationInfoLabel(
      listingPage,
      usesActiveTemplatePaging,
      mode === 'author'
        ? 'page auteur'
        : mode === 'tag'
          ? 'page tag'
          : mode === 'homepage'
            ? 'homepage'
            : 'recherche',
    ),
    [listingPage, mode, usesActiveTemplatePaging],
  );
  const currentSearchPageLabel = useMemo(
    () => `Page ${listingPageIndex + 1}`,
    [listingPageIndex],
  );

  const buildCurrentListingReturnState = useCallback((): ScraperListingReturnState | null => {
    if ((mode !== 'homepage' && mode !== 'search' && mode !== 'author' && mode !== 'tag') || !hasExecutedListing) {
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

    if (routeSyncEnabled) {
      cacheScraperListingReturnState(
        buildScraperListingReturnStateCacheKey(location.pathname, location.search),
        returnState,
      );
    }

    setListingReturnState(returnState);
    return returnState;
  }, [buildCurrentListingReturnState, location.pathname, location.search, routeSyncEnabled]);

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

  const handleOpenAuthorFromDetails = useCallback((value: string, authorTitle: string) => {
    const templateContext = detailsResult ? buildScraperTemplateContextFromDetails(detailsResult) : null;
    setAuthorTemplateContext(templateContext);
    const nextAuthorQuery = formatScraperValueForDisplay(value);
    setAuthorSourceNameHint(authorTitle ? { query: nextAuthorQuery, name: authorTitle } : null);

    if (!routeSyncEnabled) {
      setMode('author');
      setQuery(nextAuthorQuery);
      void runAuthorLookup(nextAuthorQuery, { templateContext });
      return;
    }

    const routeState = parseScraperRouteState(location.search);
    const nextSearch = writeScraperRouteState(location.search, {
      scraperId: scraper.id,
      mode: 'author',
      homepageActive: routeState.homepageActive,
      homepagePage: routeState.homepagePage,
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
          scraperBrowserListingReturnState: null,
          scraperBrowserAuthorTemplateContext: templateContext,
        },
      },
    );
  }, [
    detailsResult,
    location.pathname,
    location.search,
    locationState,
    navigate,
    routeSyncEnabled,
    runAuthorLookup,
    scraper.id,
    setMode,
    setQuery,
  ]);

  const handleOpenTagFromDetails = useCallback((value: string, tagTitle: string) => {
    const nextTagQuery = formatScraperValueForDisplay(value);
    setTagSourceNameHint(tagTitle ? { query: nextTagQuery, name: tagTitle } : null);

    if (!routeSyncEnabled) {
      setMode('tag');
      setQuery(nextTagQuery);
      void runTagLookup(nextTagQuery);
      return;
    }

    const routeState = parseScraperRouteState(location.search);
    const nextSearch = writeScraperRouteState(location.search, {
      scraperId: scraper.id,
      mode: 'tag',
      homepageActive: routeState.homepageActive,
      homepagePage: routeState.homepagePage,
      searchActive: routeState.searchActive,
      searchQuery: routeState.searchQuery,
      searchPage: routeState.searchPage,
      authorActive: routeState.authorActive,
      authorQuery: routeState.authorQuery,
      authorPage: routeState.authorPage,
      tagActive: true,
      tagQuery: nextTagQuery,
      tagPage: 1,
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
          scraperBrowserListingReturnState: null,
          scraperBrowserAuthorTemplateContext: null,
        },
      },
    );
  }, [
    location.pathname,
    location.search,
    locationState,
    navigate,
    routeSyncEnabled,
    runTagLookup,
    scraper.id,
    setMode,
    setQuery,
  ]);

  const handleOpenAuthorFromDetailsInWorkspace = useCallback((value: string, authorTitle: string) => {
    if (!hasScraperFieldSelectorValue(authorConfig?.titleSelector) || !authorConfig?.resultItemSelector) {
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

  const handleOpenTagFromDetailsInWorkspace = useCallback((value: string, tagTitle: string) => {
    if (!hasScraperFieldSelectorValue(tagConfig?.titleSelector) || !tagConfig?.resultItemSelector) {
      setRuntimeError('Le composant Tag doit etre configure pour ouvrir cette page dans le workspace.');
      return;
    }

    if (!window.api || typeof window.api.openWorkspaceTarget !== 'function') {
      setRuntimeError('L\'ouverture dans une fenetre workspace n\'est pas disponible dans cette version.');
      return;
    }

    const target: WorkspaceTarget = {
      kind: 'scraper.tag',
      scraperId: scraper.id,
      query: value,
      title: tagTitle || formatScraperValueForDisplay(value),
    };

    void window.api.openWorkspaceTarget(target)
      .then((opened: boolean) => {
        if (!opened) {
          setRuntimeError('Impossible d\'ouvrir cette page tag dans le workspace.');
        }
      })
      .catch((error: unknown) => {
        setRuntimeError(error instanceof Error ? error.message : 'Impossible d\'ouvrir cette page tag dans le workspace.');
      });
  }, [scraper.id, setRuntimeError, tagConfig]);

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

  const handleOpenAuthorCombinedSource = useCallback((source: MultiSearchSourceResult) => {
    handleOpenListingResult(source.result);
  }, [handleOpenListingResult]);

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

    if (!hasScraperFieldSelectorValue(authorConfig?.titleSelector) || !authorConfig?.resultItemSelector) {
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

  const getSearchResultLanguageCodes = useCallback((result: ScraperSearchResultItem): string[] => (
    getScraperBookmarkLanguageCodes({ languageCodes: result.languageCodes }, scraper)
  ), [scraper]);

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
        fallbackLanguageCodes: getSearchResultLanguageCodes(result),
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
    getSearchResultLanguageCodes,
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
          languageCodes={getSearchResultLanguageCodes(result)}
          excludedFields={scraper.globalConfig.bookmark.excludedFields}
          size="sm"
        />
      ),
    };
  }, [getSearchResultLanguageCodes, scraper.globalConfig.bookmark.excludedFields, scraper.id]);

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
          fallbackLanguageCodes: getSearchResultLanguageCodes(result),
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
    getSearchResultLanguageCodes,
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
          `Recherche`, `Auteur` ou `Tag` pour afficher une vue temporaire ici.
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

      {shouldShowAuthorCombinedView ? (
        <ScraperAuthorCombinedView
          scraper={scraper}
          authorUrl={query.trim()}
          authorTitle={authorResultsTitle}
          authorMultiSearchQuery={authorMultiSearchQuery}
          initialPageCount={params?.scraperAuthorFavoritePageCount ?? 1}
          cover={listingResults[0]?.thumbnailUrl}
          templateContext={authorTemplateContext}
          favoriteAction={authorFavoriteAction}
          onOpenMultiSearch={handleOpenAuthorMultiSearch}
          onSwitchToPagedView={() => handleSwitchAuthorCombinedView(false)}
          onOpenSourceDetails={routeSyncEnabled ? undefined : handleOpenAuthorCombinedSource}
        />
      ) : (
        <ScraperSearchResultsSection
          scraperId={scraper.id}
          mode={mode === 'author' ? 'author' : mode === 'tag' ? 'tag' : mode === 'homepage' ? 'homepage' : 'search'}
          backLabel={authorResultsBackLabel}
          authorTitle={mode === 'tag' ? tagResultsTitle : authorResultsTitle}
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
          headerAction={listingHeaderAction}
          canOpenSearchResultsAsDetails={canOpenSearchResultsAsDetails}
          canOpenSearchResultsAsAuthor={canOpenSearchResultsAsAuthor}
          viewHistoryRecordsById={viewHistoryRecordsById}
          newViewHistoryIds={newSearchResultIds}
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
        />
      )}

      <ScraperDetailsPanel
        scraperId={scraper.id}
        bookmarkExcludedFields={scraper.globalConfig.bookmark.excludedFields}
        detailsResult={detailsResult}
        chapters={chaptersResult}
        hasAuthor={hasAuthor}
        hasTag={hasTag}
        backLabel={detailsBackLabel}
        canResolveAuthorName={authorConfig?.urlStrategy === 'template'}
        canResolveTagName={tagConfig?.urlStrategy === 'template'}
        hasPages={hasPages}
        usesChapters={usesChaptersForPages}
        openingReader={openingReader}
        downloading={downloading}
        addingToLibrary={addingToLibrary}
        loadingMoreThumbnails={loadingMoreThumbnails}
        potentialReadingMatches={potentialReadingMatches}
        potentialBookmarkMatches={potentialBookmarkMatches}
        loadingPotentialMatches={loadingPotentialMatches}
        multiSearchTitle={titleMultiSearchQuery}
        getLinkedMangaForSource={getLinkedMangaForSource}
        getLinkedLocalMangaForSource={getLinkedLocalMangaForSource}
        onBack={canNavigateBack ? handleNavigateBack : () => void handleBackToListing()}
        onOpenAuthor={(value, title) => {
          handleOpenAuthorFromDetails(value, title);
        }}
        onOpenAuthorInWorkspace={handleOpenAuthorFromDetailsInWorkspace}
        onOpenTag={(value, title) => {
          handleOpenTagFromDetails(value, title);
        }}
        onOpenTagInWorkspace={handleOpenTagFromDetailsInWorkspace}
        onOpenReader={(options) => void handleOpenReader(options)}
        onAddToLibrary={(chapter) => {
          void handleAddToLibrary(chapter);
        }}
        onLinkSourceToManga={(chapter) => handleLinkSourceToManga(chapter)}
        onLoadMoreThumbnails={() => void handleLoadMoreThumbnails()}
        onOpenPotentialMatch={handleOpenPotentialMatch}
        onOpenPotentialMatchInWorkspace={handleOpenPotentialMatchInWorkspace}
        onOpenTitleMultiSearch={handleOpenTitleMultiSearch}
        onOpenTitleMultiSearchInWorkspace={handleOpenTitleMultiSearchInWorkspace}
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
