import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AppHistoryRecords } from "@/shared/history";
import type { ScraperReaderProgressRecord, ScraperRecord } from "@/shared/scraper";
import type { Manga } from "@/renderer/types";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";
import { useScraperBookmarks } from "@/renderer/stores/scraperBookmarks";
import { useScraperViewHistory } from "@/renderer/stores/scraperViewHistory";
import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import type {
  MatchableManga,
  MangaMergeOptions,
} from "@/renderer/utils/mangaMatching/titleProfiles";
import { enrichMatchableMangasWithJapaneseRomanization } from "@/renderer/utils/mangaMatching/advancedRomanization";
import {
  buildBookmarkCandidate,
  buildCurrentMatchable,
  buildReadingCandidates,
  EMPTY_HISTORY_RECORDS,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchCandidates";
import { matchPotentialMangaCandidates } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchMatching";
import type {
  ScraperPotentialMangaMatch,
  ScraperPotentialMangaMatchState,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";

type UseScraperPotentialMangaMatchesOptions = {
  scraper: ScraperRecord;
  detailsResult: ScraperRuntimeDetailsResult | null;
  libraryMangas: Manga[];
  mergeOptions: MangaMergeOptions;
};

const EMPTY_MATCH_STATE: ScraperPotentialMangaMatchState = {
  readingMatches: [],
  bookmarkMatches: [],
  loading: false,
};

const getApi = (): any => (
  typeof window === "undefined" ? null : (window as any).api
);

type SharedPotentialMatchRecordsSnapshot = {
  historyRecords: AppHistoryRecords;
  progressRecords: ScraperReaderProgressRecord[];
  scrapers: ScraperRecord[];
};

const sharedRecordsListeners = new Set<() => void>();
let sharedRecordsSnapshot: SharedPotentialMatchRecordsSnapshot = {
  historyRecords: EMPTY_HISTORY_RECORDS,
  progressRecords: [],
  scrapers: [],
};
let sharedRecordsLoadPromise: Promise<void> | null = null;
let sharedRecordsReloadQueued = false;

const getSharedPotentialMatchRecordsSnapshot = (): SharedPotentialMatchRecordsSnapshot => (
  sharedRecordsSnapshot
);

const subscribeSharedPotentialMatchRecords = (listener: () => void): (() => void) => {
  sharedRecordsListeners.add(listener);
  return () => {
    sharedRecordsListeners.delete(listener);
  };
};

const emitSharedPotentialMatchRecords = (): void => {
  sharedRecordsListeners.forEach((listener) => listener());
};

const normalizeHistoryRecords = (records: unknown): AppHistoryRecords => (
  records && typeof records === "object"
    ? records as AppHistoryRecords
    : EMPTY_HISTORY_RECORDS
);

const normalizeScraperRecords = (
  records: unknown,
  fallbackScraper: ScraperRecord,
): ScraperRecord[] => (
  Array.isArray(records) && records.length
    ? records as ScraperRecord[]
    : [fallbackScraper]
);

const setSharedPotentialMatchRecordsSnapshot = (
  snapshot: SharedPotentialMatchRecordsSnapshot,
): void => {
  sharedRecordsSnapshot = snapshot;
  emitSharedPotentialMatchRecords();
};

const loadSharedPotentialMatchRecords = (
  fallbackScraper: ScraperRecord,
  queueReload = false,
): Promise<void> => {
  if (sharedRecordsLoadPromise) {
    sharedRecordsReloadQueued = sharedRecordsReloadQueued || queueReload;
    return sharedRecordsLoadPromise;
  }

  sharedRecordsLoadPromise = (async () => {
    const api = getApi();
    if (!api) {
      setSharedPotentialMatchRecordsSnapshot({
        historyRecords: EMPTY_HISTORY_RECORDS,
        progressRecords: [],
        scrapers: [fallbackScraper],
      });
      return;
    }

    const [
      nextHistoryRecords,
      nextProgressRecords,
      nextScrapers,
    ] = await Promise.all([
      typeof api.getHistoryRecords === "function"
        ? api.getHistoryRecords().catch(() => EMPTY_HISTORY_RECORDS)
        : Promise.resolve(EMPTY_HISTORY_RECORDS),
      typeof api.getScraperReaderProgressRecords === "function"
        ? api.getScraperReaderProgressRecords().catch(() => [])
        : Promise.resolve([]),
      typeof api.getScrapers === "function"
        ? api.getScrapers().catch(() => [fallbackScraper])
        : Promise.resolve([fallbackScraper]),
    ]);

    setSharedPotentialMatchRecordsSnapshot({
      historyRecords: normalizeHistoryRecords(nextHistoryRecords),
      progressRecords: Array.isArray(nextProgressRecords) ? nextProgressRecords : [],
      scrapers: normalizeScraperRecords(nextScrapers, fallbackScraper),
    });
  })()
    .finally(() => {
      sharedRecordsLoadPromise = null;
      if (sharedRecordsReloadQueued) {
        sharedRecordsReloadQueued = false;
        void loadSharedPotentialMatchRecords(fallbackScraper);
      }
    });

  return sharedRecordsLoadPromise;
};

const splitEnrichedCandidates = (
  enrichedCandidates: MatchableManga[],
  readingCandidateCount: number,
): {
  readingCandidates: ScraperPotentialMangaMatch[];
  bookmarkCandidates: ScraperPotentialMangaMatch[];
} => ({
  readingCandidates: enrichedCandidates.slice(0, readingCandidateCount) as ScraperPotentialMangaMatch[],
  bookmarkCandidates: enrichedCandidates.slice(readingCandidateCount) as ScraperPotentialMangaMatch[],
});

const isCurrentScraperMatch = (
  candidate: ScraperPotentialMangaMatch,
  scraperId: string,
  sourceUrl: string,
): boolean => (
  candidate.target.kind === "scraperDetails"
  && candidate.target.scraperId === scraperId
  && normalizeScraperViewHistorySourceUrl(candidate.target.sourceUrl) === sourceUrl
);

const getPotentialMatchTargetSignature = (match: ScraperPotentialMangaMatch): unknown[] => (
  match.target.kind === "library"
    ? [match.target.kind, match.target.title]
    : [
      match.target.kind,
      match.target.scraperId,
      normalizeScraperViewHistorySourceUrl(match.target.sourceUrl),
      match.target.title,
    ]
);

const getPotentialMatchCandidateSignature = (match: ScraperPotentialMangaMatch): string => (
  JSON.stringify([
    match.id,
    match.category,
    match.title,
    normalizeScraperViewHistorySourceUrl(match.sourceUrl),
    match.authorNames ?? [],
    match.sourceLabel,
    match.detailLabel,
    match.updatedAt,
    match.readingStatus ?? "",
    getPotentialMatchTargetSignature(match),
  ])
);

const getPotentialMatchCandidatesSignature = (
  candidates: ScraperPotentialMangaMatch[],
): string => (
  candidates.map(getPotentialMatchCandidateSignature).join("\n")
);

const useStablePotentialMatchCandidates = (
  candidates: ScraperPotentialMangaMatch[],
): ScraperPotentialMangaMatch[] => {
  const previousRef = useRef<{
    signature: string;
    candidates: ScraperPotentialMangaMatch[];
  } | null>(null);

  return useMemo(() => {
    const signature = getPotentialMatchCandidatesSignature(candidates);
    if (previousRef.current?.signature === signature) {
      return previousRef.current.candidates;
    }

    previousRef.current = {
      signature,
      candidates,
    };
    return candidates;
  }, [candidates]);
};

export default function useScraperPotentialMangaMatches({
  scraper,
  detailsResult,
  libraryMangas,
  mergeOptions,
}: UseScraperPotentialMangaMatchesOptions): ScraperPotentialMangaMatchState {
  const [matches, setMatches] = useState<ScraperPotentialMangaMatchState>(EMPTY_MATCH_STATE);
  const { bookmarks } = useScraperBookmarks();
  const { records: viewHistoryRecords } = useScraperViewHistory();
  const {
    historyRecords,
    progressRecords,
    scrapers,
  } = useSyncExternalStore(
    subscribeSharedPotentialMatchRecords,
    getSharedPotentialMatchRecordsSnapshot,
    getSharedPotentialMatchRecordsSnapshot,
  );

  useEffect(() => {
    void loadSharedPotentialMatchRecords(scraper);

    const reload = () => {
      void loadSharedPotentialMatchRecords(scraper, true);
    };

    if (typeof window === "undefined") {
      return undefined;
    }

    window.addEventListener("history-updated", reload as EventListener);
    window.addEventListener("mangas-updated", reload as EventListener);
    window.addEventListener("scrapers-updated", reload as EventListener);
    return () => {
      window.removeEventListener("history-updated", reload as EventListener);
      window.removeEventListener("mangas-updated", reload as EventListener);
      window.removeEventListener("scrapers-updated", reload as EventListener);
    };
  }, [scraper]);

  const scrapersById = useMemo(() => (
    new Map((scrapers.length ? scrapers : [scraper]).map((candidate) => [candidate.id, candidate]))
  ), [scraper, scrapers]);

  const currentMatchable = useMemo(
    () => buildCurrentMatchable(detailsResult),
    [detailsResult],
  );
  const currentSourceUrl = useMemo(() => (
    normalizeScraperViewHistorySourceUrl(detailsResult?.finalUrl || detailsResult?.requestedUrl)
  ), [detailsResult?.finalUrl, detailsResult?.requestedUrl]);

  const readingCandidates = useMemo(() => (
    buildReadingCandidates({
      historyRecords,
      libraryMangas,
      progressRecords,
      viewHistoryRecords,
      bookmarks,
      scrapersById,
    })
  ), [
    bookmarks,
    historyRecords,
    libraryMangas,
    progressRecords,
    scrapersById,
    viewHistoryRecords,
  ]);

  const bookmarkCandidates = useMemo(() => (
    bookmarks
      .map((bookmark) => buildBookmarkCandidate(bookmark, scrapersById))
      .filter((candidate): candidate is ScraperPotentialMangaMatch => Boolean(candidate))
  ), [bookmarks, scrapersById]);

  const rawComparableReadingCandidates = useMemo(() => (
    currentSourceUrl
      ? readingCandidates.filter((candidate) => !isCurrentScraperMatch(candidate, scraper.id, currentSourceUrl))
      : readingCandidates
  ), [currentSourceUrl, readingCandidates, scraper.id]);

  const rawComparableBookmarkCandidates = useMemo(() => (
    currentSourceUrl
      ? bookmarkCandidates.filter((candidate) => !isCurrentScraperMatch(candidate, scraper.id, currentSourceUrl))
      : bookmarkCandidates
  ), [bookmarkCandidates, currentSourceUrl, scraper.id]);
  const comparableReadingCandidates = useStablePotentialMatchCandidates(rawComparableReadingCandidates);
  const comparableBookmarkCandidates = useStablePotentialMatchCandidates(rawComparableBookmarkCandidates);

  useEffect(() => {
    let cancelled = false;

    if (!currentMatchable) {
      setMatches(EMPTY_MATCH_STATE);
      return () => {
        cancelled = true;
      };
    }

    setMatches({
      readingMatches: matchPotentialMangaCandidates(currentMatchable, comparableReadingCandidates, mergeOptions),
      bookmarkMatches: matchPotentialMangaCandidates(currentMatchable, comparableBookmarkCandidates, mergeOptions),
      loading: true,
    });

    const enrichAndMatch = async () => {
      const enrichedMangas = await enrichMatchableMangasWithJapaneseRomanization([
        currentMatchable,
        ...comparableReadingCandidates,
        ...comparableBookmarkCandidates,
      ]);
      if (cancelled) {
        return;
      }

      const [enrichedCurrent, ...enrichedCandidates] = enrichedMangas;
      const enriched = splitEnrichedCandidates(enrichedCandidates, comparableReadingCandidates.length);

      setMatches({
        readingMatches: matchPotentialMangaCandidates(
          enrichedCurrent,
          enriched.readingCandidates,
          mergeOptions,
        ),
        bookmarkMatches: matchPotentialMangaCandidates(
          enrichedCurrent,
          enriched.bookmarkCandidates,
          mergeOptions,
        ),
        loading: false,
      });
    };

    void enrichAndMatch()
      .catch(() => {
        // The initial synchronous pass already produced usable matches.
      })
      .finally(() => {
        if (!cancelled) {
          setMatches((current) => ({
            ...current,
            loading: false,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    comparableBookmarkCandidates,
    comparableReadingCandidates,
    currentMatchable,
    mergeOptions,
  ]);

  return matches;
}
