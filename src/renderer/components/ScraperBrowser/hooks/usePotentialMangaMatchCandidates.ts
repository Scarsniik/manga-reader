import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AppHistoryRecords } from "@/shared/history";
import type { SavedReadingList } from "@/shared/readingList";
import type {
  ScraperReaderProgressRecord,
  ScraperRecord,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import type { ReaderLocationState } from "@/renderer/components/Reader/types";
import type { Manga } from "@/renderer/types";
import { useScraperBookmarks } from "@/renderer/stores/scraperBookmarks";
import { useScraperViewHistory } from "@/renderer/stores/scraperViewHistory";
import {
  buildBookmarkCandidate,
  buildReadingCandidates,
  buildReadingListCandidates,
  EMPTY_HISTORY_RECORDS,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchCandidates";
import type { ScraperPotentialMangaMatch } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";

type SharedPotentialMatchRecordsSnapshot = {
  historyRecords: AppHistoryRecords;
  progressRecords: ScraperReaderProgressRecord[];
  savedReadingLists: SavedReadingList<ReaderLocationState>[];
  scrapers: ScraperRecord[];
  loading: boolean;
};

export type PotentialMangaMatchCandidateCollections = {
  readingCandidates: ScraperPotentialMangaMatch[];
  bookmarkCandidates: ScraperPotentialMangaMatch[];
  readingListCandidates: ScraperPotentialMangaMatch[];
  loading: boolean;
};

type Options = {
  scraper: ScraperRecord | null;
  libraryMangas?: Manga[];
  enabled?: boolean;
};

type PotentialMatchLibraryState = {
  mangas: Manga[];
  loading: boolean;
};

const sharedRecordsListeners = new Set<() => void>();
let sharedRecordsSnapshot: SharedPotentialMatchRecordsSnapshot = {
  historyRecords: EMPTY_HISTORY_RECORDS,
  progressRecords: [],
  savedReadingLists: [],
  scrapers: [],
  loading: false,
};
let sharedRecordsLoadPromise: Promise<void> | null = null;
let sharedRecordsReloadQueued = false;
const subscribeDisabled = () => () => {};

const getApi = (): any => (
  typeof window === "undefined" ? null : (window as any).api
);

const usePotentialMatchLibrary = (enabled: boolean): PotentialMatchLibraryState => {
  const [state, setState] = useState<PotentialMatchLibraryState>({
    mangas: [],
    loading: false,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ mangas: [], loading: false });
      return undefined;
    }

    let cancelled = false;
    const load = () => {
      const api = getApi();
      if (typeof api?.getMangas !== "function") {
        setState({ mangas: [], loading: false });
        return;
      }

      setState((current) => ({ ...current, loading: true }));
      void api.getMangas()
        .then((mangas: unknown) => {
          if (!cancelled) {
            setState({ mangas: Array.isArray(mangas) ? mangas as Manga[] : [], loading: false });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setState((current) => ({ ...current, loading: false }));
          }
        });
    };

    load();
    window.addEventListener("mangas-updated", load);
    return () => {
      cancelled = true;
      window.removeEventListener("mangas-updated", load);
    };
  }, [enabled]);

  return state;
};

const subscribe = (listener: () => void): (() => void) => {
  sharedRecordsListeners.add(listener);
  return () => {
    sharedRecordsListeners.delete(listener);
  };
};

const emit = (): void => {
  sharedRecordsListeners.forEach((listener) => listener());
};

const setSnapshot = (snapshot: SharedPotentialMatchRecordsSnapshot): void => {
  sharedRecordsSnapshot = snapshot;
  emit();
};

const normalizeHistoryRecords = (records: unknown): AppHistoryRecords => (
  records && typeof records === "object"
    ? records as AppHistoryRecords
    : EMPTY_HISTORY_RECORDS
);

const normalizeScrapers = (records: unknown, fallback: ScraperRecord): ScraperRecord[] => (
  Array.isArray(records) && records.length ? records as ScraperRecord[] : [fallback]
);

export const getPotentialMatchReadHistoryRevision = (
  records: ScraperViewHistoryRecord[],
): string => JSON.stringify(records
  .filter((record) => Boolean(record.readAt))
  .map((record) => [
    record.id,
    record.scraperId,
    record.sourceUrl ?? "",
    record.readAt,
  ])
  .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));

export const shouldReloadPotentialMatchCandidatesForHistoryUpdate = (
  change: unknown,
): boolean => {
  if (!change || typeof change !== "object" || Array.isArray(change)) {
    return true;
  }

  const kind = (change as { kind?: unknown }).kind;
  return kind !== "details" && kind !== "search";
};

const loadSharedRecords = (
  fallbackScraper: ScraperRecord,
  queueReload = false,
): Promise<void> => {
  if (sharedRecordsLoadPromise) {
    sharedRecordsReloadQueued = sharedRecordsReloadQueued || queueReload;
    return sharedRecordsLoadPromise;
  }

  setSnapshot({
    ...sharedRecordsSnapshot,
    loading: true,
  });

  sharedRecordsLoadPromise = (async () => {
    const api = getApi();
    if (!api) {
      setSnapshot({
        historyRecords: EMPTY_HISTORY_RECORDS,
        progressRecords: [],
        savedReadingLists: [],
        scrapers: [fallbackScraper],
        loading: false,
      });
      return;
    }

    const [historyRecords, progressRecords, savedReadingLists, scrapers] = await Promise.all([
      typeof api.getHistoryRecords === "function"
        ? api.getHistoryRecords().catch(() => EMPTY_HISTORY_RECORDS)
        : Promise.resolve(EMPTY_HISTORY_RECORDS),
      typeof api.getScraperReaderProgressRecords === "function"
        ? api.getScraperReaderProgressRecords().catch(() => [])
        : Promise.resolve([]),
      typeof api.getSavedReadingLists === "function"
        ? api.getSavedReadingLists().catch(() => [])
        : Promise.resolve([]),
      typeof api.getScrapers === "function"
        ? api.getScrapers().catch(() => [fallbackScraper])
        : Promise.resolve([fallbackScraper]),
    ]);

    setSnapshot({
      historyRecords: normalizeHistoryRecords(historyRecords),
      progressRecords: Array.isArray(progressRecords) ? progressRecords : [],
      savedReadingLists: Array.isArray(savedReadingLists) ? savedReadingLists : [],
      scrapers: normalizeScrapers(scrapers, fallbackScraper),
      loading: false,
    });
  })()
    .catch(() => {
      setSnapshot({
        ...sharedRecordsSnapshot,
        loading: false,
      });
    })
    .finally(() => {
      sharedRecordsLoadPromise = null;
      if (sharedRecordsReloadQueued) {
        sharedRecordsReloadQueued = false;
        void loadSharedRecords(fallbackScraper);
      }
    });

  return sharedRecordsLoadPromise;
};

export default function usePotentialMangaMatchCandidates({
  scraper,
  libraryMangas,
  enabled = true,
}: Options): PotentialMangaMatchCandidateCollections {
  const active = enabled && Boolean(scraper);
  const automaticLibrary = usePotentialMatchLibrary(active && libraryMangas === undefined);
  const resolvedLibraryMangas = libraryMangas ?? automaticLibrary.mangas;
  const bookmarkState = useScraperBookmarks({ enabled: active });
  const viewHistoryState = useScraperViewHistory({ enabled: active });
  const sharedRecords = useSyncExternalStore(
    active ? subscribe : subscribeDisabled,
    () => sharedRecordsSnapshot,
    () => sharedRecordsSnapshot,
  );

  useEffect(() => {
    if (!active || !scraper) {
      return undefined;
    }

    void loadSharedRecords(scraper);
    const reload = () => {
      void loadSharedRecords(scraper, true);
    };
    const reloadHistory = (event: Event) => {
      if (shouldReloadPotentialMatchCandidatesForHistoryUpdate(
        (event as CustomEvent<unknown>).detail,
      )) {
        reload();
      }
    };

    window.addEventListener("history-updated", reloadHistory as EventListener);
    window.addEventListener("mangas-updated", reload as EventListener);
    window.addEventListener("scrapers-updated", reload as EventListener);
    const api = getApi();
    const unsubscribeReadingLists = typeof api?.onSavedReadingListsUpdated === "function"
      ? api.onSavedReadingListsUpdated(reload)
      : undefined;

    return () => {
      window.removeEventListener("history-updated", reloadHistory as EventListener);
      window.removeEventListener("mangas-updated", reload as EventListener);
      window.removeEventListener("scrapers-updated", reload as EventListener);
      unsubscribeReadingLists?.();
    };
  }, [active, scraper]);

  const scrapersById = useMemo(() => new Map(
    (sharedRecords.scrapers.length ? sharedRecords.scrapers : scraper ? [scraper] : [])
      .map((candidate) => [candidate.id, candidate]),
  ), [scraper, sharedRecords.scrapers]);
  const viewHistoryReadRevision = useMemo(
    () => getPotentialMatchReadHistoryRevision(viewHistoryState.records),
    [viewHistoryState.records],
  );
  const viewHistoryReadRecords = useMemo(
    () => viewHistoryState.records.filter((record) => Boolean(record.readAt)),
    // Seen-only history updates must not rebuild the potential-reading candidate collection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewHistoryReadRevision],
  );

  const readingCandidates = useMemo(() => buildReadingCandidates({
    historyRecords: sharedRecords.historyRecords,
    libraryMangas: resolvedLibraryMangas,
    progressRecords: sharedRecords.progressRecords,
    viewHistoryRecords: viewHistoryReadRecords,
    bookmarks: bookmarkState.bookmarks,
    scrapersById,
  }), [
    bookmarkState.bookmarks,
    resolvedLibraryMangas,
    scrapersById,
    sharedRecords.historyRecords,
    sharedRecords.progressRecords,
    viewHistoryReadRecords,
  ]);

  const bookmarkCandidates = useMemo(() => bookmarkState.bookmarks
    .map((bookmark) => buildBookmarkCandidate(bookmark, scrapersById))
    .filter((candidate): candidate is ScraperPotentialMangaMatch => Boolean(candidate)), [
    bookmarkState.bookmarks,
    scrapersById,
  ]);

  const readingListCandidates = useMemo(() => buildReadingListCandidates({
    lists: sharedRecords.savedReadingLists,
    libraryMangas: resolvedLibraryMangas,
    scrapersById,
  }), [resolvedLibraryMangas, scrapersById, sharedRecords.savedReadingLists]);

  return {
    readingCandidates,
    bookmarkCandidates,
    readingListCandidates,
    loading: active && (
      sharedRecords.loading
      || bookmarkState.loading
      || viewHistoryState.loading
      || automaticLibrary.loading
    ),
  };
}
