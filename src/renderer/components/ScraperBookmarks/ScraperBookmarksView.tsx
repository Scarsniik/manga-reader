import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, DownloadArrowIcon, OpenBookIcon, PlusSignIcon, TrashCanIcon } from '@/renderer/components/icons';
import { ScraperBrowserLocationState } from '@/renderer/components/ScraperBrowser/types';
import type { ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import {
  type ScraperBookmarkRecord,
  type ScraperBookmarkViewRequest,
  type ScraperRecord,
} from '@/shared/scraper';
import ScraperBookmarkFilters from '@/renderer/components/ScraperBookmarks/ScraperBookmarkFilters';
import ScraperBookmarkCard from '@/renderer/components/ScraperBookmarks/ScraperBookmarkCard';
import VirtualizedScraperBookmarkGrid from '@/renderer/components/ScraperBookmarks/VirtualizedScraperBookmarkGrid';
import useScraperBookmarkView from '@/renderer/components/ScraperBookmarks/useScraperBookmarkView';
import buildScraperBookmarkDuplicateReviewModal from '@/renderer/components/ScraperBookmarks/ScraperBookmarkDuplicateReviewModal';
import buildScraperBookmarkSurpriseModal from '@/renderer/components/ScraperBookmarks/ScraperBookmarkSurpriseModal';
import buildScraperBookmarkTagStatsModal from '@/renderer/components/ScraperBookmarks/ScraperBookmarkTagStatsDialog';
import buildScraperBookmarkReadingListModal from '@/renderer/components/ScraperBookmarks/ScraperBookmarkReadingListModal';
import {
  findScraperBookmarkDuplicateGroups,
  type ScraperBookmarkDuplicateDetectionProgress,
  type ScraperBookmarkDuplicateGroup,
} from '@/renderer/components/ScraperBookmarks/bookmarkDuplicateDetection';
import { removeScraperBookmark } from '@/renderer/stores/scraperBookmarks';
import { useScraperTagFavorites } from '@/renderer/stores/scraperTagFavorites';
import useScraperBookmarkRefresh from '@/renderer/components/ScraperBookmarks/useScraperBookmarkRefresh';
import {
  DEFAULT_BOOKMARK_FILTERS,
  type ScraperBookmarkFilterState,
} from '@/renderer/components/ScraperBookmarks/bookmarkFiltering';
import type { Manga } from '@/renderer/types';
import { findMangaLinkedToSource } from '@/renderer/utils/mangaSource';
import { writeScraperRouteState } from '@/renderer/utils/scraperBrowserNavigation';
import { buildBookmarkViewHistoryIdentity } from '@/renderer/utils/scraperViewHistory';
import {
  buildScraperDownloadQueuedMessage,
  canQueueStandaloneScraperDownload,
  queueStandaloneScraperCardDownload,
} from '@/renderer/utils/scraperDownload';
import { findLocalMangaLinkedToSource } from '@/renderer/utils/mangaSource';
import { openWorkspaceTarget } from '@/renderer/utils/workspaceTargets';
import {
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  isScraperFeatureConfigured,
} from '@/renderer/utils/scraperRuntime';
import {
  getScraperTagBlacklistEntries,
} from '@/renderer/utils/scraperTagBlacklist';
import { getScraperTagFavoriteSources } from '@/renderer/utils/scraperTagFavorites';
import BlacklistedCardsDisplayToggle, {
  useLocalBlacklistedCardsDisplay,
} from '@/renderer/components/BlacklistedCardsDisplayToggle';
import { saveStandaloneScraperCardToLibrary } from '@/renderer/utils/scraperLibrary';
import type { WorkspaceTarget } from '@/renderer/types/workspace';
import type { ReadingListItem } from '@/renderer/types/readingList';
import { useModal } from '@/renderer/hooks/useModal';
import { useParams } from '@/renderer/hooks/useParams';
import '@/renderer/components/ScraperBrowser/style.scss';
import './style.scss';

type Props = {
  scrapers: ScraperRecord[];
  filterScraperId?: string | null;
  initialFilters?: Partial<ScraperBookmarkFilterState> | null;
};

type ScraperBookmarksLocationState = ScraperBrowserLocationState & {
  bookmarksReturn?: {
    pathname: string;
    search?: string;
  };
} | null;

const getStandaloneDownloadConfig = (scraper: ScraperRecord | null | undefined) => {
  if (!scraper) {
    return null;
  }

  const detailsConfig = getScraperDetailsFeatureConfig(getScraperFeature(scraper, 'details'));
  const pagesConfig = getScraperPagesFeatureConfig(getScraperFeature(scraper, 'pages'));
  const detailsFeature = getScraperFeature(scraper, 'details');
  const pagesFeature = getScraperFeature(scraper, 'pages');
  if (!isScraperFeatureConfigured(detailsFeature) || !isScraperFeatureConfigured(pagesFeature)) {
    return null;
  }

  if (!canQueueStandaloneScraperDownload(detailsConfig, pagesConfig)) {
    return null;
  }

  return {
    detailsConfig,
    pagesConfig,
  };
};

const normalizeTitleLineCount = (value: unknown): number => {
  const parsed = typeof value === 'number'
    ? value
    : Number.parseInt(String(value ?? ''), 10);

  if (!Number.isFinite(parsed)) {
    return 2;
  }

  return Math.min(4, Math.max(1, Math.floor(parsed)));
};

const getBookmarkKey = (bookmark: ScraperBookmarkRecord): string => (
  `${bookmark.scraperId}::${bookmark.sourceUrl}`
);

const MIDDLE_BUTTON = 1;

const normalizeInitialBookmarkFilters = (
  filters: Partial<ScraperBookmarkFilterState> | null | undefined,
): ScraperBookmarkFilterState => ({
  ...DEFAULT_BOOKMARK_FILTERS,
  ...filters,
  languageFilterModes: filters?.languageFilterModes ?? DEFAULT_BOOKMARK_FILTERS.languageFilterModes,
  readingStatuses: Array.isArray(filters?.readingStatuses)
    ? filters.readingStatuses
    : DEFAULT_BOOKMARK_FILTERS.readingStatuses,
  sortBy: filters?.sortBy ?? DEFAULT_BOOKMARK_FILTERS.sortBy,
});

export default function ScraperBookmarksView({
  scrapers,
  filterScraperId = null,
  initialFilters = null,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { openModal } = useModal();
  const { params } = useParams();
  const locationState = location.state as ScraperBookmarksLocationState;
  const { favorites: tagFavorites } = useScraperTagFavorites();
  const [libraryMangas, setLibraryMangas] = useState<Manga[]>([]);
  const [bookmarkFilters, setBookmarkFilters] = useState<ScraperBookmarkFilterState>(() => (
    normalizeInitialBookmarkFilters(initialFilters)
  ));
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [downloadingSourceUrl, setDownloadingSourceUrl] = useState<string | null>(null);
  const [addingSourceUrl, setAddingSourceUrl] = useState<string | null>(null);
  const [removingBookmarkKey, setRemovingBookmarkKey] = useState<string | null>(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateCheckProgress, setDuplicateCheckProgress] = useState<ScraperBookmarkDuplicateDetectionProgress>({
    compared: 0,
    total: 0,
  });
  const [duplicateCheckError, setDuplicateCheckError] = useState<string | null>(null);
  const seenCardsQueueRef = useRef(new Map<string, ReturnType<typeof buildBookmarkViewHistoryIdentity>>());
  const seenCardsTimerRef = useRef<number | null>(null);
  const initialFiltersKey = useMemo(() => JSON.stringify(initialFilters ?? null), [initialFilters]);

  const scrapersById = useMemo(
    () => new Map(scrapers.map((scraper) => [scraper.id, scraper])),
    [scrapers],
  );
  const filteredScraper = filterScraperId ? scrapersById.get(filterScraperId) ?? null : null;
  const bookmarksReturn = locationState?.bookmarksReturn ?? null;
  const hideBlacklistedBookmarkCards = params?.scraperHideBlacklistedTagCards === true;
  const {
    shouldHideBlacklistedCards: shouldHideBlacklistedBookmarkCards,
    showBlacklistedCardsLocally,
    setShowBlacklistedCardsLocally,
  } = useLocalBlacklistedCardsDisplay(hideBlacklistedBookmarkCards);
  const bookmarkViewRequest = useMemo((): ScraperBookmarkViewRequest => ({
    scraperId: filterScraperId ?? null,
    filters: bookmarkFilters,
    hideBlacklistedCards: shouldHideBlacklistedBookmarkCards,
    blacklistedTagsByScraper: params?.scraperBlacklistedTagsByScraper ?? null,
  }), [
    bookmarkFilters,
    filterScraperId,
    params?.scraperBlacklistedTagsByScraper,
    shouldHideBlacklistedBookmarkCards,
  ]);
  const {
    loaded,
    loading,
    response: bookmarkView,
    error,
    reload: reloadBookmarkView,
  } = useScraperBookmarkView(bookmarkViewRequest);
  const displayedBookmarks = useMemo(
    () => bookmarkView.bookmarks.map((record) => record.bookmark),
    [bookmarkView.bookmarks],
  );
  const bookmarkViewRecordsByKey = useMemo(
    () => new Map(bookmarkView.bookmarks.map((record) => [
      getBookmarkKey(record.bookmark),
      record,
    ])),
    [bookmarkView.bookmarks],
  );
  const bookmarkLanguageFilterCodes = bookmarkView.languageCodes;
  const hiddenBlacklistedBookmarkCount = bookmarkView.hiddenBlacklistedCount;
  const surpriseBookmarkPool = useMemo(() => (
    displayedBookmarks.filter((bookmark) => (
      Boolean(scrapersById.get(bookmark.scraperId))
    ))
  ), [displayedBookmarks, scrapersById]);
  const bookmarkDuplicateMergeOptions = useMemo(() => ({
    enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
  }), [params?.multiSearchEnableRomajiPhoneticMerge]);
  const titleLineCount = useMemo(
    () => normalizeTitleLineCount(params?.titleLineCount),
    [params?.titleLineCount],
  );
  const clearRefreshFeedback = useCallback(() => {
    setDownloadMessage(null);
    setDownloadError(null);
    setLibraryMessage(null);
    setLibraryError(null);
    setDuplicateCheckError(null);
  }, []);

  useEffect(() => {
    if (!initialFilters) {
      return;
    }

    setBookmarkFilters(normalizeInitialBookmarkFilters(initialFilters));
  }, [initialFilters, initialFiltersKey]);

  const handleOpenBookmarkTag = useCallback((tag: string) => {
    setBookmarkFilters((currentFilters) => ({
      ...currentFilters,
      query: tag,
    }));
  }, []);

  const handleOpenBookmarkTagInWorkspace = useCallback((tag: string) => {
    void openWorkspaceTarget({
      kind: 'manga-manager.view',
      viewId: 'bookmarks',
      title: `Bookmarks - ${tag}`,
      locationState: {
        bookmarksFilterScraperId: filterScraperId ?? null,
        bookmarkFilters: {
          ...bookmarkFilters,
          query: tag,
        },
      },
    }).then((opened) => {
      if (!opened) {
        setHistoryError('Impossible d\'ouvrir ce tag dans un onglet workspace.');
      }
    }).catch((error: unknown) => {
      setHistoryError(error instanceof Error ? error.message : 'Impossible d\'ouvrir ce tag dans un onglet workspace.');
    });
  }, [bookmarkFilters, filterScraperId]);

  const handleOpenBookmarkTagStats = useCallback(() => {
    openModal(buildScraperBookmarkTagStatsModal({
      filterScraperId,
      filters: bookmarkFilters,
      onOpenTag: handleOpenBookmarkTag,
      onOpenTagInWorkspace: handleOpenBookmarkTagInWorkspace,
    }));
  }, [
    bookmarkFilters,
    filterScraperId,
    handleOpenBookmarkTag,
    handleOpenBookmarkTagInWorkspace,
    openModal,
  ]);

  const handleOpenBookmarkTagStatsInWorkspace = useCallback(() => {
    void openWorkspaceTarget({
      kind: 'scraper.bookmarkTags',
      filterScraperId: filterScraperId ?? null,
      filters: bookmarkFilters,
      title: 'Tags bookmarks',
    }).then((opened) => {
      if (!opened) {
        setHistoryError('Impossible d\'ouvrir les tags dans un onglet workspace.');
      }
    }).catch((error: unknown) => {
      setHistoryError(error instanceof Error ? error.message : 'Impossible d\'ouvrir les tags dans un onglet workspace.');
    });
  }, [bookmarkFilters, filterScraperId]);
  const loadBookmarksForScope = useCallback(async (): Promise<ScraperBookmarkRecord[]> => {
    if (!window.api || typeof window.api.getScraperBookmarks !== 'function') {
      return [];
    }

    const data = await window.api.getScraperBookmarks(filterScraperId ?? null);
    return Array.isArray(data) ? data : [];
  }, [filterScraperId]);
  const loadAllBookmarks = useCallback(async (): Promise<ScraperBookmarkRecord[]> => {
    if (!window.api || typeof window.api.getScraperBookmarks !== 'function') {
      return [];
    }

    const data = await window.api.getScraperBookmarks();
    return Array.isArray(data) ? data : [];
  }, []);
  const {
    refreshAllBookmarks,
    refreshingBookmarks,
    refreshProgress,
    refreshMessage,
    refreshError,
  } = useScraperBookmarkRefresh({
    loadBookmarks: loadAllBookmarks,
    scrapersById,
    onAfterRefresh: reloadBookmarkView,
    onBeforeRefresh: clearRefreshFeedback,
  });

  const loadLibraryMangas = useCallback(async () => {
    if (!window.api || typeof window.api.getMangas !== 'function') {
      setLibraryMangas([]);
      return;
    }

    try {
      const data = await window.api.getMangas();
      setLibraryMangas(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load library mangas for bookmark download state', err);
      setLibraryMangas([]);
    }
  }, []);

  useEffect(() => {
    void loadLibraryMangas();

    const onMangasUpdated = () => {
      void loadLibraryMangas();
    };

    window.addEventListener('mangas-updated', onMangasUpdated as EventListener);
    return () => window.removeEventListener('mangas-updated', onMangasUpdated as EventListener);
  }, [loadLibraryMangas]);

  const handleBack = useCallback(() => {
    const historyIndex = window.history.state && typeof window.history.state.idx === 'number'
      ? window.history.state.idx
      : null;
    if (historyIndex !== null && historyIndex > 0) {
      navigate(-1);
      return;
    }

    if (!bookmarksReturn) {
      return;
    }

    navigate(
      {
        pathname: bookmarksReturn.pathname,
        search: bookmarksReturn.search ?? '',
      },
      { replace: true },
    );
  }, [bookmarksReturn, navigate]);

  const handleShowAllBookmarks = useCallback(() => {
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
        bookmarksFilterScraperId: null,
      }),
    }, {
      replace: true,
      state: locationState,
    });
  }, [location.pathname, location.search, locationState, navigate]);

  const handleOpenBookmark = useCallback((bookmark: ScraperBookmarkRecord) => {
    const scraper = scrapersById.get(bookmark.scraperId);
    if (!scraper) {
      return;
    }

    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId: scraper.id,
        mode: 'manga',
        searchActive: false,
        searchQuery: '',
        searchPage: 1,
        authorActive: false,
        authorQuery: '',
        authorPage: 1,
        mangaQuery: '',
        mangaUrl: bookmark.sourceUrl,
      }),
    }, {
      state: {
        ...(locationState ?? {}),
        scraperBrowserHistorySource: {
          kind: 'bookmarks',
        },
      },
    });
  }, [location.pathname, location.search, locationState, navigate, scrapersById]);

  const handleOpenBookmarkInWorkspace = useCallback((bookmark: ScraperBookmarkRecord) => {
    const scraper = scrapersById.get(bookmark.scraperId);
    if (!scraper) {
      return;
    }

    if (!window.api || typeof window.api.openWorkspaceTarget !== 'function') {
      setDownloadError('L\'ouverture dans une fenetre workspace n\'est pas disponible dans cette version.');
      return;
    }

    const target: WorkspaceTarget = {
      kind: 'scraper.details',
      scraperId: scraper.id,
      sourceUrl: bookmark.sourceUrl,
      title: bookmark.title,
    };

    void window.api.openWorkspaceTarget(target)
      .then((opened: boolean) => {
        if (!opened) {
          setDownloadError('Impossible d\'ouvrir cette fiche dans le workspace.');
        }
      })
      .catch((error: unknown) => {
        setDownloadError(error instanceof Error ? error.message : 'Impossible d\'ouvrir cette fiche dans le workspace.');
      });
  }, [scrapersById]);

  const handleOpenSurpriseBookmarks = useCallback(() => {
    openModal(buildScraperBookmarkSurpriseModal({
      bookmarks: surpriseBookmarkPool,
      scrapersById,
      titleLineCount,
      onOpenBookmark: handleOpenBookmark,
      onOpenBookmarkInWorkspace: handleOpenBookmarkInWorkspace,
    }));
  }, [
    handleOpenBookmark,
    handleOpenBookmarkInWorkspace,
    openModal,
    scrapersById,
    surpriseBookmarkPool,
    titleLineCount,
  ]);

  const handleCreateBookmarkReadingList = useCallback(async (items: ReadingListItem[]) => {
    const opened = await openWorkspaceTarget(
      {
        kind: 'reading-list',
        items,
        title: 'Liste de lecture - Bookmarks',
      },
      { activate: true },
    );

    if (!opened) {
      throw new Error('Impossible d\'ouvrir la liste de lecture dans le workspace.');
    }
  }, []);

  const handleOpenReadingListModal = useCallback(() => {
    openModal(buildScraperBookmarkReadingListModal({
      bookmarks: displayedBookmarks,
      onCreate: handleCreateBookmarkReadingList,
    }));
  }, [displayedBookmarks, handleCreateBookmarkReadingList, openModal]);

  const handleKeepOnlyDuplicateBookmark = useCallback(async (
    group: ScraperBookmarkDuplicateGroup,
    bookmarkToKeep: ScraperBookmarkRecord,
  ) => {
    const keepKey = `${bookmarkToKeep.scraperId}::${bookmarkToKeep.sourceUrl}`;
    const bookmarksToRemove = group.bookmarks.filter((bookmark) => (
      `${bookmark.scraperId}::${bookmark.sourceUrl}` !== keepKey
    ));

    await Promise.all(bookmarksToRemove.map((bookmark) => (
      removeScraperBookmark({
        scraperId: bookmark.scraperId,
        sourceUrl: bookmark.sourceUrl,
      })
    )));
    await reloadBookmarkView();
  }, [reloadBookmarkView]);

  const handleCheckBookmarkDuplicates = useCallback(async () => {
    if (checkingDuplicates || bookmarkView.scopeCount < 2) {
      return;
    }

    setCheckingDuplicates(true);
    setDuplicateCheckError(null);

    try {
      const bookmarks = await loadBookmarksForScope();
      if (bookmarks.length < 2) {
        setDuplicateCheckProgress({
          compared: 0,
          total: 0,
        });
        return;
      }

      setDuplicateCheckProgress({
        compared: 0,
        total: Math.max(0, (bookmarks.length * (bookmarks.length - 1)) / 2),
      });

      const groups = await findScraperBookmarkDuplicateGroups({
        bookmarks,
        scrapersById,
        mergeOptions: bookmarkDuplicateMergeOptions,
        onProgress: setDuplicateCheckProgress,
      });

      openModal(buildScraperBookmarkDuplicateReviewModal({
        groups,
        scrapersById,
        titleLineCount,
        onOpenBookmarkInWorkspace: handleOpenBookmarkInWorkspace,
        onKeepOnly: handleKeepOnlyDuplicateBookmark,
      }));
    } catch (err) {
      setDuplicateCheckError(err instanceof Error ? err.message : 'Impossible de verifier les doublons.');
    } finally {
      setCheckingDuplicates(false);
    }
  }, [
    bookmarkDuplicateMergeOptions,
    bookmarkView.scopeCount,
    checkingDuplicates,
    handleKeepOnlyDuplicateBookmark,
    handleOpenBookmarkInWorkspace,
    loadBookmarksForScope,
    openModal,
    scrapersById,
    titleLineCount,
  ]);

  const getLinkedMangaForBookmark = useCallback((bookmark: ScraperBookmarkRecord): Manga | null => (
    findMangaLinkedToSource(libraryMangas, {
      scraperId: bookmark.scraperId,
      sourceUrl: bookmark.sourceUrl,
    })
  ), [libraryMangas]);

  const getLinkedLocalMangaForBookmark = useCallback((bookmark: ScraperBookmarkRecord): Manga | null => (
    findLocalMangaLinkedToSource(libraryMangas, {
      scraperId: bookmark.scraperId,
      sourceUrl: bookmark.sourceUrl,
    })
  ), [libraryMangas]);

  const getLanguageCodesForBookmark = useCallback((
    bookmark: ScraperBookmarkRecord,
    _scraper: ScraperRecord | null,
  ): string[] => (
    bookmarkViewRecordsByKey.get(getBookmarkKey(bookmark))?.languageCodes
    ?? bookmark.languageCodes
    ?? []
  ), [bookmarkViewRecordsByKey]);

  const handleDownloadBookmark = useCallback(async (
    bookmark: ScraperBookmarkRecord,
    scraper: ScraperRecord,
  ) => {
    if (downloadingSourceUrl) {
      return;
    }

    setLibraryMessage(null);
    setLibraryError(null);
    const downloadConfig = getStandaloneDownloadConfig(scraper);
    if (!downloadConfig) {
      setDownloadError('Le telechargement direct depuis une card requiert `Fiche` et `Pages` sans liaison chapitre.');
      return;
    }

    const linkedManga = getLinkedMangaForBookmark(bookmark);

    setDownloadingSourceUrl(bookmark.sourceUrl);
    setDownloadMessage(null);
    setDownloadError(null);

    try {
      const downloadResult = await queueStandaloneScraperCardDownload({
        scraper,
        detailsConfig: downloadConfig.detailsConfig,
        pagesConfig: downloadConfig.pagesConfig,
        sourceUrl: bookmark.sourceUrl,
        fallbackTitle: bookmark.title,
        fallbackLanguageCodes: getLanguageCodesForBookmark(bookmark, scraper),
        libraryMangas,
        replaceMangaId: linkedManga?.id ?? null,
      });

      setDownloadMessage(buildScraperDownloadQueuedMessage({
        queueResult: downloadResult.queueResult,
        isReplacement: Boolean(downloadResult.replaceMangaId),
      }));
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Le telechargement du manga a echoue.');
    } finally {
      setDownloadingSourceUrl(null);
    }
  }, [
    downloadingSourceUrl,
    getLinkedMangaForBookmark,
    getLanguageCodesForBookmark,
    libraryMangas,
  ]);

  const handleAddBookmarkToLibrary = useCallback(async (
    bookmark: ScraperBookmarkRecord,
    scraper: ScraperRecord,
  ) => {
    if (addingSourceUrl) {
      return;
    }

    setAddingSourceUrl(bookmark.sourceUrl);
    setLibraryMessage(null);
    setLibraryError(null);
    setDownloadMessage(null);
    setDownloadError(null);

    try {
      const downloadConfig = getStandaloneDownloadConfig(scraper);
      if (!downloadConfig) {
        throw new Error('L\'ajout direct depuis une card requiert `Fiche` et `Pages` sans liaison chapitre.');
      }

      const result = await saveStandaloneScraperCardToLibrary({
        scraper,
        detailsConfig: downloadConfig.detailsConfig,
        pagesConfig: downloadConfig.pagesConfig,
        sourceUrl: bookmark.sourceUrl,
        fallbackTitle: bookmark.title,
        fallbackLanguageCodes: getLanguageCodesForBookmark(bookmark, scraper),
        libraryMangas,
      });

      await loadLibraryMangas();
      setLibraryMessage(
        result.created
          ? 'Le manga distant a ete ajoute a la bibliotheque.'
          : 'Le manga distant en bibliotheque a ete mis a jour.',
      );
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : 'Impossible d\'ajouter ce manga a la bibliotheque.');
    } finally {
      setAddingSourceUrl(null);
    }
  }, [
    addingSourceUrl,
    getLanguageCodesForBookmark,
    libraryMangas,
    loadLibraryMangas,
  ]);

  const handleSetBookmarkRead = useCallback(async (
    bookmark: ScraperBookmarkRecord,
    read: boolean,
  ) => {
    setHistoryError(null);

    try {
      if (!window.api || typeof window.api.setScraperCardRead !== 'function') {
        throw new Error('L\'historique scraper n\'est pas disponible dans cette version.');
      }

      await window.api.setScraperCardRead({
        ...buildBookmarkViewHistoryIdentity(bookmark),
        read,
      });
      await reloadBookmarkView();
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Impossible de mettre a jour l\'historique de lecture.');
    }
  }, [reloadBookmarkView]);

  const flushSeenCardsQueue = useCallback(() => {
    if (seenCardsTimerRef.current !== null) {
      window.clearTimeout(seenCardsTimerRef.current);
      seenCardsTimerRef.current = null;
    }

    const cards = Array.from(seenCardsQueueRef.current.values());
    seenCardsQueueRef.current.clear();

    if (!cards.length || !window.api || typeof window.api.recordScraperCardsSeenCompact !== 'function') {
      return;
    }

    void window.api.recordScraperCardsSeenCompact({ cards }).catch((err: unknown) => {
      console.warn('Failed to record scraper bookmark view', err);
    });
  }, []);

  const handleBookmarkViewed = useCallback((bookmark: ScraperBookmarkRecord) => {
    if (!window.api || typeof window.api.recordScraperCardsSeenCompact !== 'function') {
      return;
    }

    const identity = buildBookmarkViewHistoryIdentity(bookmark);
    seenCardsQueueRef.current.set(getBookmarkKey(bookmark), identity);

    if (seenCardsTimerRef.current !== null) {
      return;
    }

    seenCardsTimerRef.current = window.setTimeout(flushSeenCardsQueue, 300);
  }, [flushSeenCardsQueue]);

  useEffect(() => () => {
    if (seenCardsTimerRef.current !== null) {
      window.clearTimeout(seenCardsTimerRef.current);
      seenCardsTimerRef.current = null;
    }

    seenCardsQueueRef.current.clear();
  }, []);

  const getBookmarkViewState = useCallback((bookmark: ScraperBookmarkRecord) => {
    return bookmarkViewRecordsByKey.get(getBookmarkKey(bookmark))?.viewState ?? 'new';
  }, [bookmarkViewRecordsByKey]);

  const renderBookmarkReadAction = useCallback((bookmark: ScraperBookmarkRecord): ScraperCardAction => {
    const identity = buildBookmarkViewHistoryIdentity(bookmark);
    const viewRecord = bookmarkViewRecordsByKey.get(getBookmarkKey(bookmark));
    const isRead = viewRecord?.viewState === 'read';
    const label = isRead ? 'Lu' : 'Marquer lu';

    return {
      id: `read-${identity.sourceUrl || identity.title}`,
      type: 'secondary',
      label,
      ariaLabel: `${isRead ? 'Marquer non lu' : 'Marquer lu'} ${bookmark.title}`,
      icon: <OpenBookIcon aria-hidden="true" focusable="false" />,
      className: [
        'is-read-toggle',
        isRead ? 'is-read' : '',
      ].join(' ').trim(),
      onClick: () => {
        void handleSetBookmarkRead(bookmark, !isRead);
      },
    };
  }, [bookmarkViewRecordsByKey, handleSetBookmarkRead]);

  const handleRemoveBookmark = useCallback(async (bookmark: ScraperBookmarkRecord) => {
    const bookmarkKey = getBookmarkKey(bookmark);
    if (removingBookmarkKey) {
      return;
    }

    setRemovingBookmarkKey(bookmarkKey);
    setHistoryError(null);

    try {
      await removeScraperBookmark({
        scraperId: bookmark.scraperId,
        sourceUrl: bookmark.sourceUrl,
      });
      await reloadBookmarkView();
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Impossible de retirer ce bookmark.');
    } finally {
      setRemovingBookmarkKey(null);
    }
  }, [reloadBookmarkView, removingBookmarkKey]);

  const renderBookmarkRemoveAction = useCallback((bookmark: ScraperBookmarkRecord): ScraperCardAction => {
    const bookmarkKey = getBookmarkKey(bookmark);
    const isRemoving = removingBookmarkKey === bookmarkKey;

    return {
      id: `remove-bookmark-${bookmark.scraperId}-${bookmark.sourceUrl}`,
      type: 'icon-secondary',
      label: isRemoving ? 'Retrait...' : 'Retirer',
      ariaLabel: `Retirer ${bookmark.title} des bookmarks`,
      icon: <TrashCanIcon aria-hidden="true" focusable="false" />,
      className: 'is-remove-bookmark',
      disabled: Boolean(removingBookmarkKey),
      onClick: () => {
        void handleRemoveBookmark(bookmark);
      },
    };
  }, [handleRemoveBookmark, removingBookmarkKey]);

  const renderBookmarkDownloadAction = useCallback((
    bookmark: ScraperBookmarkRecord,
    scraper: ScraperRecord | null,
  ): ScraperCardAction | null => {
    if (!scraper || !getStandaloneDownloadConfig(scraper)) {
      return null;
    }

    const linkedLocalManga = getLinkedLocalMangaForBookmark(bookmark);
    const isDownloading = downloadingSourceUrl === bookmark.sourceUrl;
    const label = isDownloading
      ? 'Telechargement...'
      : linkedLocalManga
        ? 'Retelecharger'
        : 'Telecharger';

    return {
      id: `download-${bookmark.scraperId}-${bookmark.sourceUrl}`,
      type: 'icon-secondary',
      label,
      ariaLabel: `${label} ${bookmark.title}`,
      icon: <DownloadArrowIcon aria-hidden="true" focusable="false" />,
      className: [
        'is-download',
        linkedLocalManga ? 'is-linked' : '',
      ].join(' ').trim(),
      onClick: () => {
        void handleDownloadBookmark(bookmark, scraper);
      },
      disabled: Boolean(downloadingSourceUrl),
    };
  }, [
    downloadingSourceUrl,
    getLinkedLocalMangaForBookmark,
    handleDownloadBookmark,
  ]);

  const renderBookmarkAddToLibraryAction = useCallback((
    bookmark: ScraperBookmarkRecord,
    scraper: ScraperRecord | null,
  ): ScraperCardAction | null => {
    if (!scraper || !getStandaloneDownloadConfig(scraper)) {
      return null;
    }

    const linkedManga = getLinkedMangaForBookmark(bookmark);
    const isAdding = addingSourceUrl === bookmark.sourceUrl;
    const label = isAdding
      ? 'Ajout...'
      : linkedManga
        ? 'Mettre a jour la bibliotheque'
        : 'Ajouter a la bibliotheque';

    return {
      id: `add-library-${bookmark.scraperId}-${bookmark.sourceUrl}`,
      type: 'icon-secondary',
      label,
      ariaLabel: `${label} ${bookmark.title}`,
      icon: <PlusSignIcon aria-hidden="true" focusable="false" />,
      className: [
        'is-add-library',
        linkedManga ? 'is-linked' : '',
      ].join(' ').trim(),
      onClick: () => {
        void handleAddBookmarkToLibrary(bookmark, scraper);
      },
      disabled: Boolean(addingSourceUrl),
    };
  }, [
    addingSourceUrl,
    getLinkedMangaForBookmark,
    handleAddBookmarkToLibrary,
  ]);

  const renderDisplayedBookmark = useCallback((bookmark: ScraperBookmarkRecord) => {
    const scraper = scrapersById.get(bookmark.scraperId) ?? null;

    return (
      <ScraperBookmarkCard
        bookmark={bookmark}
        scraper={scraper}
        languageCodes={getLanguageCodesForBookmark(bookmark, scraper)}
        viewState={getBookmarkViewState(bookmark)}
        bookmarkAction={renderBookmarkRemoveAction(bookmark)}
        readAction={renderBookmarkReadAction(bookmark)}
        addToLibraryAction={renderBookmarkAddToLibraryAction(bookmark, scraper)}
        downloadAction={renderBookmarkDownloadAction(bookmark, scraper)}
        tagBlacklistEntries={getScraperTagBlacklistEntries(
          params?.scraperBlacklistedTagsByScraper,
          bookmark.scraperId,
        )}
        tagFavoriteSources={getScraperTagFavoriteSources(tagFavorites, bookmark.scraperId)}
        onOpenBookmark={handleOpenBookmark}
        onOpenBookmarkInWorkspace={handleOpenBookmarkInWorkspace}
        onViewed={handleBookmarkViewed}
      />
    );
  }, [
    getBookmarkViewState,
    getLanguageCodesForBookmark,
    handleBookmarkViewed,
    handleOpenBookmark,
    handleOpenBookmarkInWorkspace,
    params?.scraperBlacklistedTagsByScraper,
    renderBookmarkAddToLibraryAction,
    renderBookmarkDownloadAction,
    renderBookmarkRemoveAction,
    renderBookmarkReadAction,
    scrapersById,
    tagFavorites,
  ]);

  return (
    <section className="scraper-bookmarks-view scraper-browser__panel">
      <div className="scraper-bookmarks-view__header">
        <div>
          <span className="scraper-browser__eyebrow">Bookmarks scraper</span>
          <div className="scraper-bookmarks-view__title-row">
            {bookmarksReturn ? (
              <button
                type="button"
                className="scraper-bookmarks-view__back"
                onClick={handleBack}
                aria-label="Retour"
                title="Retour"
              >
                <ChevronLeftIcon aria-hidden="true" focusable="false" />
              </button>
            ) : null}
            <h2>
              {filteredScraper
                ? `Bookmarks de ${filteredScraper.name}`
                : filterScraperId
                  ? `Bookmarks du scrapper ${filterScraperId}`
                  : 'Tous les bookmarks'}
            </h2>
          </div>
          <p>
            {filterScraperId
              ? 'Cette vue regroupe les mangas sauvegardes pour ce scrapper uniquement.'
              : 'Cette vue regroupe tous les bookmarks sauvegardes, quel que soit leur scrapper.'}
          </p>
        </div>

        <div className="scraper-bookmarks-view__header-actions">
          <BlacklistedCardsDisplayToggle
            blacklistedCardCount={hiddenBlacklistedBookmarkCount}
            hideBlacklistedCards={hideBlacklistedBookmarkCards}
            showBlacklistedCardsLocally={showBlacklistedCardsLocally}
            onShowBlacklistedCardsLocallyChange={setShowBlacklistedCardsLocally}
          />

          <button
            type="button"
            className="scraper-bookmarks-view__clear"
            onClick={handleOpenReadingListModal}
            disabled={displayedBookmarks.length === 0}
            title="Créer une liste avec les bookmarks affichés et leur ordre actuel"
          >
            <OpenBookIcon aria-hidden="true" focusable="false" />
            Créer une liste de lecture
          </button>

          <button
            type="button"
            className="scraper-bookmarks-view__clear"
            onClick={handleOpenBookmarkTagStats}
            onMouseDown={(event) => {
              if (event.button === MIDDLE_BUTTON) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onAuxClick={(event) => {
              if (event.button !== MIDDLE_BUTTON) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              handleOpenBookmarkTagStatsInWorkspace();
            }}
            disabled={bookmarkView.scopeCount === 0}
            title="Voir les tags les plus presents. Clic molette : nouvel onglet workspace"
            data-prevent-middle-click-autoscroll="true"
          >
            Tags frequents
          </button>

          <button
            type="button"
            className="scraper-bookmarks-view__clear"
            onClick={handleOpenSurpriseBookmarks}
            disabled={surpriseBookmarkPool.length === 0}
            title={surpriseBookmarkPool.length
              ? 'Tirer 3 bookmarks au hasard dans la selection actuelle'
              : 'Aucun bookmark ouvrable en fiche dans la selection actuelle'}
          >
            Surprends moi
          </button>

          <button
            type="button"
            className="scraper-bookmarks-view__clear"
            onClick={() => {
              void handleCheckBookmarkDuplicates();
            }}
            disabled={checkingDuplicates || bookmarkView.scopeCount < 2}
          >
            {checkingDuplicates
              ? `Verification ${duplicateCheckProgress.compared}/${duplicateCheckProgress.total}`
              : 'Verifier les doublons'}
          </button>

          <button
            type="button"
            className="scraper-bookmarks-view__clear"
            onClick={() => {
              void refreshAllBookmarks();
            }}
            disabled={refreshingBookmarks || bookmarkView.allBookmarkCount === 0}
          >
            {refreshingBookmarks
              ? `Rescrape ${refreshProgress.current}/${refreshProgress.total}`
              : 'Rescraper les bookmarks'}
          </button>

          {filterScraperId ? (
            <button
              type="button"
              className="scraper-bookmarks-view__clear"
              onClick={handleShowAllBookmarks}
            >
              Voir tous les scrappers
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="scraper-browser__message is-error">{error}</div>
      ) : null}

      {downloadMessage ? (
        <div className="scraper-browser__message is-success">{downloadMessage}</div>
      ) : null}

      {downloadError ? (
        <div className="scraper-browser__message is-error">{downloadError}</div>
      ) : null}

      {libraryMessage ? (
        <div className="scraper-browser__message is-success">{libraryMessage}</div>
      ) : null}

      {libraryError ? (
        <div className="scraper-browser__message is-error">{libraryError}</div>
      ) : null}

      {refreshingBookmarks ? (
        <div className="scraper-browser__message">
          {`Rescrape des bookmarks ${refreshProgress.current}/${refreshProgress.total} - ${refreshProgress.updated} maj, ${refreshProgress.failed} erreur(s).`}
        </div>
      ) : null}

      {refreshMessage ? (
        <div className="scraper-browser__message is-success">{refreshMessage}</div>
      ) : null}

      {refreshError ? (
        <div className="scraper-browser__message is-error">{refreshError}</div>
      ) : null}

      {historyError ? (
        <div className="scraper-browser__message is-error">{historyError}</div>
      ) : null}

      {duplicateCheckError ? (
        <div className="scraper-browser__message is-error">{duplicateCheckError}</div>
      ) : null}

      {bookmarkView.scopeCount > 0 ? (
        <ScraperBookmarkFilters
          filters={bookmarkFilters}
          languageCodes={bookmarkLanguageFilterCodes}
          resultCount={displayedBookmarks.length}
          totalCount={bookmarkView.scopeCount}
          onChange={setBookmarkFilters}
        />
      ) : null}

      {!loaded && loading ? (
        <div className="scraper-browser__message">Chargement des bookmarks...</div>
      ) : bookmarkView.scopeCount === 0 ? (
        <div className="scraper-browser__message is-warning">
          {filterScraperId
            ? 'Aucun bookmark n\'a encore ete enregistre pour ce scrapper.'
            : 'Aucun bookmark scraper n\'a encore ete enregistre.'}
        </div>
      ) : displayedBookmarks.length === 0 && shouldHideBlacklistedBookmarkCards && hiddenBlacklistedBookmarkCount > 0 ? (
        <div className="scraper-browser__message is-warning">
          Tous les bookmarks visibles sont masques par la blacklist.
        </div>
      ) : displayedBookmarks.length === 0 ? (
        <div className="scraper-browser__message is-warning">
          Aucun bookmark ne correspond aux filtres actuels.
        </div>
      ) : (
        <VirtualizedScraperBookmarkGrid
          bookmarks={displayedBookmarks}
          renderBookmark={renderDisplayedBookmark}
        />
      )}
    </section>
  );
}
