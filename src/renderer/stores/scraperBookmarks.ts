import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type {
  RemoveScraperBookmarkRequest,
  SaveScraperBookmarkRequest,
  ScraperBookmarkRecord,
} from '@/shared/scraper';

type ScraperBookmarksState = {
  loaded: boolean;
  loading: boolean;
  bookmarks: ScraperBookmarkRecord[];
  error: string | null;
};

type UseScraperBookmarksOptions = {
  scraperId?: string | null;
};

const listeners = new Set<() => void>();

let state: ScraperBookmarksState = {
  loaded: false,
  loading: false,
  bookmarks: [],
  error: null,
};

let inFlightLoad: Promise<ScraperBookmarkRecord[]> | null = null;
let hasBoundWindowEvents = false;

const getSnapshot = (): ScraperBookmarksState => state;

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const setState = (updater: Partial<ScraperBookmarksState> | ((previous: ScraperBookmarksState) => ScraperBookmarksState)) => {
  state = typeof updater === 'function'
    ? updater(state)
    : {
      ...state,
      ...updater,
    };
  emitChange();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getApi = (): any => (
  typeof window !== 'undefined' ? (window as any).api : null
);

const sortBookmarks = (records: ScraperBookmarkRecord[]): ScraperBookmarkRecord[] => (
  [...records].sort((left, right) => {
    const updatedAtCompare = right.updatedAt.localeCompare(left.updatedAt);
    if (updatedAtCompare !== 0) {
      return updatedAtCompare;
    }

    const scraperCompare = left.scraperId.localeCompare(right.scraperId);
    if (scraperCompare !== 0) {
      return scraperCompare;
    }

    return left.title.localeCompare(right.title);
  })
);

const upsertBookmark = (
  records: ScraperBookmarkRecord[],
  bookmark: ScraperBookmarkRecord,
): ScraperBookmarkRecord[] => {
  const next = records.filter((record) => !(
    record.scraperId === bookmark.scraperId && record.sourceUrl === bookmark.sourceUrl
  ));
  next.push(bookmark);
  return sortBookmarks(next);
};

const removeBookmark = (
  records: ScraperBookmarkRecord[],
  request: RemoveScraperBookmarkRequest,
): ScraperBookmarkRecord[] => (
  records.filter((record) => !(
    record.scraperId === String(request.scraperId ?? '').trim()
    && record.sourceUrl === String(request.sourceUrl ?? '').trim()
  ))
);

const handleExternalBookmarksUpdate = () => {
  void loadScraperBookmarks(true);
};

const bindWindowEvents = () => {
  if (hasBoundWindowEvents || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('scraper-bookmarks-updated', handleExternalBookmarksUpdate as EventListener);
  hasBoundWindowEvents = true;
};

export const getScraperBookmarkKey = (
  scraperId?: string | null,
  sourceUrl?: string | null,
): string => {
  const normalizedScraperId = String(scraperId ?? '').trim();
  const normalizedSourceUrl = String(sourceUrl ?? '').trim();

  if (!normalizedScraperId || !normalizedSourceUrl) {
    return '';
  }

  return `${normalizedScraperId}::${normalizedSourceUrl}`;
};

export const loadScraperBookmarks = async (force = false): Promise<ScraperBookmarkRecord[]> => {
  bindWindowEvents();

  const api = getApi();
  if (!api || typeof api.getScraperBookmarks !== 'function') {
    if (!state.loaded || state.bookmarks.length || state.error) {
      setState({
        loaded: true,
        loading: false,
        bookmarks: [],
        error: null,
      });
    }
    return [];
  }

  if (!force && state.loaded) {
    return state.bookmarks;
  }

  if (inFlightLoad) {
    return inFlightLoad;
  }

  setState({
    loading: true,
    error: null,
  });

  inFlightLoad = (async () => {
    try {
      const data = await api.getScraperBookmarks();
      const bookmarks = Array.isArray(data) ? sortBookmarks(data) : [];
      setState({
        loaded: true,
        loading: false,
        bookmarks,
        error: null,
      });
      return bookmarks;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de charger les bookmarks scraper.';
      setState((previous) => ({
        ...previous,
        loaded: true,
        loading: false,
        error: message,
      }));
      return state.bookmarks;
    } finally {
      inFlightLoad = null;
    }
  })();

  return inFlightLoad;
};

export const saveScraperBookmark = async (
  request: SaveScraperBookmarkRequest,
): Promise<ScraperBookmarkRecord> => {
  const api = getApi();

  if (!api || typeof api.saveScraperBookmark !== 'function') {
    throw new Error('Les bookmarks scraper ne sont pas disponibles dans cette version.');
  }

  const saved = await api.saveScraperBookmark(request);
  if (!saved) {
    throw new Error('Le bookmark scraper n\'a pas pu etre enregistre.');
  }

  setState((previous) => ({
    ...previous,
    loaded: true,
    loading: false,
    error: null,
    bookmarks: upsertBookmark(previous.bookmarks, saved as ScraperBookmarkRecord),
  }));

  return saved as ScraperBookmarkRecord;
};

export const removeScraperBookmark = async (
  request: RemoveScraperBookmarkRequest,
): Promise<boolean> => {
  const api = getApi();

  if (!api || typeof api.removeScraperBookmark !== 'function') {
    throw new Error('Les bookmarks scraper ne sont pas disponibles dans cette version.');
  }

  const removed = await api.removeScraperBookmark(request);

  if (removed) {
    setState((previous) => ({
      ...previous,
      loaded: true,
      loading: false,
      error: null,
      bookmarks: removeBookmark(previous.bookmarks, request),
    }));
  }

  return Boolean(removed);
};

export const useScraperBookmarks = (options?: UseScraperBookmarksOptions) => {
  bindWindowEvents();

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void loadScraperBookmarks();
  }, []);

  const normalizedScraperId = String(options?.scraperId ?? '').trim();

  const bookmarks = useMemo(
    () => (
      normalizedScraperId
        ? snapshot.bookmarks.filter((bookmark) => bookmark.scraperId === normalizedScraperId)
        : snapshot.bookmarks
    ),
    [normalizedScraperId, snapshot.bookmarks],
  );

  const bookmarkMap = useMemo(
    () => new Map(
      bookmarks.map((bookmark) => [
        getScraperBookmarkKey(bookmark.scraperId, bookmark.sourceUrl),
        bookmark,
      ]),
    ),
    [bookmarks],
  );

  return {
    loaded: snapshot.loaded,
    loading: snapshot.loading,
    error: snapshot.error,
    bookmarks,
    bookmarkMap,
    reload: () => loadScraperBookmarks(true),
  };
};

export const useScraperBookmark = (
  scraperId?: string | null,
  sourceUrl?: string | null,
) => {
  const { loaded, loading, error, bookmarkMap, reload } = useScraperBookmarks({ scraperId });
  const bookmarkKey = getScraperBookmarkKey(scraperId, sourceUrl);
  const bookmark = bookmarkKey ? bookmarkMap.get(bookmarkKey) ?? null : null;

  return {
    loaded,
    loading,
    error,
    bookmark,
    isBookmarked: Boolean(bookmark),
    reload,
  };
};
