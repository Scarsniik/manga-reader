import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ScraperBookmarkViewRequest,
  ScraperBookmarkViewResponse,
} from '@/shared/scraper';

type ScraperBookmarkViewState = {
  loaded: boolean;
  loading: boolean;
  response: ScraperBookmarkViewResponse;
  error: string | null;
};

const BOOKMARK_VIEW_LOAD_TIMEOUT_MS = 15000;

const EMPTY_BOOKMARK_VIEW_RESPONSE: ScraperBookmarkViewResponse = {
  bookmarks: [],
  allBookmarkCount: 0,
  scopeCount: 0,
  filteredCount: 0,
  hiddenBlacklistedCount: 0,
  languageCodes: [],
};

const normalizeBookmarkViewResponse = (value: unknown): ScraperBookmarkViewResponse => {
  if (!value || typeof value !== 'object') {
    return EMPTY_BOOKMARK_VIEW_RESPONSE;
  }

  const raw = value as Partial<ScraperBookmarkViewResponse>;

  return {
    bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks : [],
    allBookmarkCount: typeof raw.allBookmarkCount === 'number' ? raw.allBookmarkCount : 0,
    scopeCount: typeof raw.scopeCount === 'number' ? raw.scopeCount : 0,
    filteredCount: typeof raw.filteredCount === 'number' ? raw.filteredCount : 0,
    hiddenBlacklistedCount: typeof raw.hiddenBlacklistedCount === 'number' ? raw.hiddenBlacklistedCount : 0,
    languageCodes: Array.isArray(raw.languageCodes) ? raw.languageCodes : [],
  };
};

const withBookmarkViewTimeout = async (
  promise: Promise<unknown>,
): Promise<unknown> => {
  let timeoutId: number | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error("Le chargement des bookmarks prend trop longtemps."));
        }, BOOKMARK_VIEW_LOAD_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
};

export default function useScraperBookmarkView(request: ScraperBookmarkViewRequest) {
  const requestKey = useMemo(() => JSON.stringify(request), [request]);
  const requestRef = useRef(request);
  const loadSequenceRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<ScraperBookmarkViewState>({
    loaded: false,
    loading: false,
    response: EMPTY_BOOKMARK_VIEW_RESPONSE,
    error: null,
  });

  useEffect(() => {
    requestRef.current = request;
  }, [requestKey, request]);

  const loadBookmarkView = useCallback(async () => {
    const api = typeof window !== 'undefined' ? (window as any).api : null;
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;

    if (!api || typeof api.getScraperBookmarkView !== 'function') {
      setState({
        loaded: true,
        loading: false,
        response: EMPTY_BOOKMARK_VIEW_RESPONSE,
        error: null,
      });
      return EMPTY_BOOKMARK_VIEW_RESPONSE;
    }

    setState((previous) => ({
      ...previous,
      loading: !previous.loaded,
      error: null,
    }));

    try {
      const data = await withBookmarkViewTimeout(api.getScraperBookmarkView(requestRef.current));
      const response = normalizeBookmarkViewResponse(data);

      if (loadSequenceRef.current === sequence) {
        setState({
          loaded: true,
          loading: false,
          response,
          error: null,
        });
      }

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de charger la vue des bookmarks.';

      if (loadSequenceRef.current === sequence) {
        setState((previous) => ({
          ...previous,
          loaded: true,
          loading: false,
          error: message,
        }));
      }

      return EMPTY_BOOKMARK_VIEW_RESPONSE;
    }
  }, []);

  const scheduleBookmarkViewReload = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void loadBookmarkView();
    }, 250);
  }, [loadBookmarkView]);

  useEffect(() => {
    void loadBookmarkView();
  }, [loadBookmarkView, requestKey]);

  useEffect(() => {
    window.addEventListener('scraper-bookmarks-updated', scheduleBookmarkViewReload as EventListener);
    window.addEventListener('scraper-view-history-updated', scheduleBookmarkViewReload as EventListener);
    window.addEventListener('mangas-updated', scheduleBookmarkViewReload as EventListener);

    return () => {
      window.removeEventListener('scraper-bookmarks-updated', scheduleBookmarkViewReload as EventListener);
      window.removeEventListener('scraper-view-history-updated', scheduleBookmarkViewReload as EventListener);
      window.removeEventListener('mangas-updated', scheduleBookmarkViewReload as EventListener);

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [scheduleBookmarkViewReload]);

  return {
    ...state,
    reload: loadBookmarkView,
  };
}
