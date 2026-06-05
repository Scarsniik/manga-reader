import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function useScraperPotentialMangaMatches({
  scraper,
  detailsResult,
  libraryMangas,
  mergeOptions,
}: UseScraperPotentialMangaMatchesOptions): ScraperPotentialMangaMatchState {
  const [historyRecords, setHistoryRecords] = useState<AppHistoryRecords>(EMPTY_HISTORY_RECORDS);
  const [progressRecords, setProgressRecords] = useState<ScraperReaderProgressRecord[]>([]);
  const [scrapers, setScrapers] = useState<ScraperRecord[]>([scraper]);
  const [matches, setMatches] = useState<ScraperPotentialMangaMatchState>(EMPTY_MATCH_STATE);
  const { bookmarks } = useScraperBookmarks();
  const { records: viewHistoryRecords } = useScraperViewHistory();

  const loadRecords = useCallback(async () => {
    const api = getApi();
    if (!api) {
      setHistoryRecords(EMPTY_HISTORY_RECORDS);
      setProgressRecords([]);
      setScrapers([scraper]);
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
        ? api.getScrapers().catch(() => [scraper])
        : Promise.resolve([scraper]),
    ]);

    setHistoryRecords(
      nextHistoryRecords && typeof nextHistoryRecords === "object"
        ? nextHistoryRecords as AppHistoryRecords
        : EMPTY_HISTORY_RECORDS,
    );
    setProgressRecords(Array.isArray(nextProgressRecords) ? nextProgressRecords : []);
    setScrapers(Array.isArray(nextScrapers) && nextScrapers.length ? nextScrapers : [scraper]);
  }, [scraper]);

  useEffect(() => {
    void loadRecords();

    const reload = () => {
      void loadRecords();
    };

    window.addEventListener("history-updated", reload as EventListener);
    window.addEventListener("mangas-updated", reload as EventListener);
    window.addEventListener("scrapers-updated", reload as EventListener);
    return () => {
      window.removeEventListener("history-updated", reload as EventListener);
      window.removeEventListener("mangas-updated", reload as EventListener);
      window.removeEventListener("scrapers-updated", reload as EventListener);
    };
  }, [loadRecords]);

  const scrapersById = useMemo(() => (
    new Map(scrapers.map((candidate) => [candidate.id, candidate]))
  ), [scrapers]);

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

  const comparableReadingCandidates = useMemo(() => (
    currentSourceUrl
      ? readingCandidates.filter((candidate) => !isCurrentScraperMatch(candidate, scraper.id, currentSourceUrl))
      : readingCandidates
  ), [currentSourceUrl, readingCandidates, scraper.id]);

  const comparableBookmarkCandidates = useMemo(() => (
    currentSourceUrl
      ? bookmarkCandidates.filter((candidate) => !isCurrentScraperMatch(candidate, scraper.id, currentSourceUrl))
      : bookmarkCandidates
  ), [bookmarkCandidates, currentSourceUrl, scraper.id]);

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
