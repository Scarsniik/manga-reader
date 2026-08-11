import { useEffect, useMemo, useState } from "react";
import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";
import type { MangaMergeOptions, MatchableManga } from "@/renderer/utils/mangaMatching/titleProfiles";
import { enrichMatchableMangasWithJapaneseRomanization } from "@/renderer/utils/mangaMatching/advancedRomanization";
import { buildCurrentMatchable } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchCandidates";
import { matchPotentialMangaCandidates } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchMatching";
import type {
  ScraperPotentialMangaMatch,
  ScraperPotentialMangaMatchState,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import type { PotentialMangaMatchCandidateCollections } from "@/renderer/components/ScraperBrowser/hooks/usePotentialMangaMatchCandidates";

type Options = {
  scraperId: string;
  detailsResult: ScraperRuntimeDetailsResult | null;
  mergeOptions: MangaMergeOptions;
  candidates: PotentialMangaMatchCandidateCollections;
  enabled?: boolean;
};

const EMPTY_MATCH_STATE: ScraperPotentialMangaMatchState = {
  readingMatches: [],
  bookmarkMatches: [],
  readingListMatches: [],
  loading: false,
};

const splitEnrichedCandidates = (
  enrichedCandidates: MatchableManga[],
  readingCandidateCount: number,
  bookmarkCandidateCount: number,
): Omit<ScraperPotentialMangaMatchState, "loading"> => ({
  readingMatches: enrichedCandidates.slice(0, readingCandidateCount) as ScraperPotentialMangaMatch[],
  bookmarkMatches: enrichedCandidates.slice(
    readingCandidateCount,
    readingCandidateCount + bookmarkCandidateCount,
  ) as ScraperPotentialMangaMatch[],
  readingListMatches: enrichedCandidates.slice(
    readingCandidateCount + bookmarkCandidateCount,
  ) as ScraperPotentialMangaMatch[],
});

const isCurrentScraperMatch = (
  candidate: ScraperPotentialMangaMatch,
  scraperId: string,
  currentSourceUrl: string,
): boolean => (
  candidate.target.kind === "scraperDetails"
  && candidate.target.scraperId === scraperId
  && normalizeScraperViewHistorySourceUrl(candidate.target.sourceUrl) === currentSourceUrl
);

export default function useScraperPotentialMangaMatches({
  scraperId,
  detailsResult,
  mergeOptions,
  candidates,
  enabled = true,
}: Options): ScraperPotentialMangaMatchState {
  const [matches, setMatches] = useState<ScraperPotentialMangaMatchState>(EMPTY_MATCH_STATE);
  const currentMatchable = useMemo(() => buildCurrentMatchable(detailsResult), [detailsResult]);
  const currentSourceUrl = useMemo(() => normalizeScraperViewHistorySourceUrl(
    detailsResult?.finalUrl || detailsResult?.requestedUrl,
  ), [detailsResult?.finalUrl, detailsResult?.requestedUrl]);

  const readingCandidates = useMemo(() => (
    currentSourceUrl
      ? candidates.readingCandidates.filter((candidate) => !isCurrentScraperMatch(
        candidate,
        scraperId,
        currentSourceUrl,
      ))
      : candidates.readingCandidates
  ), [candidates.readingCandidates, currentSourceUrl, scraperId]);
  const bookmarkCandidates = useMemo(() => (
    currentSourceUrl
      ? candidates.bookmarkCandidates.filter((candidate) => !isCurrentScraperMatch(
        candidate,
        scraperId,
        currentSourceUrl,
      ))
      : candidates.bookmarkCandidates
  ), [candidates.bookmarkCandidates, currentSourceUrl, scraperId]);

  useEffect(() => {
    let cancelled = false;

    if (!enabled || !currentMatchable) {
      setMatches(EMPTY_MATCH_STATE);
      return () => {
        cancelled = true;
      };
    }

    setMatches({
      readingMatches: matchPotentialMangaCandidates(currentMatchable, readingCandidates, mergeOptions),
      bookmarkMatches: matchPotentialMangaCandidates(currentMatchable, bookmarkCandidates, mergeOptions),
      readingListMatches: matchPotentialMangaCandidates(
        currentMatchable,
        candidates.readingListCandidates,
        mergeOptions,
      ),
      loading: true,
    });

    const enrichAndMatch = async () => {
      const enrichedMangas = await enrichMatchableMangasWithJapaneseRomanization([
        currentMatchable,
        ...readingCandidates,
        ...bookmarkCandidates,
        ...candidates.readingListCandidates,
      ]);
      if (cancelled) {
        return;
      }

      const [enrichedCurrent, ...enrichedCandidates] = enrichedMangas;
      const enriched = splitEnrichedCandidates(
        enrichedCandidates,
        readingCandidates.length,
        bookmarkCandidates.length,
      );

      setMatches({
        readingMatches: matchPotentialMangaCandidates(
          enrichedCurrent,
          enriched.readingMatches,
          mergeOptions,
        ),
        bookmarkMatches: matchPotentialMangaCandidates(
          enrichedCurrent,
          enriched.bookmarkMatches,
          mergeOptions,
        ),
        readingListMatches: matchPotentialMangaCandidates(
          enrichedCurrent,
          enriched.readingListMatches,
          mergeOptions,
        ),
        loading: false,
      });
    };

    void enrichAndMatch()
      .catch(() => {
        // The synchronous pass already produced usable matches.
      })
      .finally(() => {
        if (!cancelled) {
          setMatches((current) => ({
            ...current,
            loading: candidates.loading,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    bookmarkCandidates,
    candidates.loading,
    candidates.readingListCandidates,
    currentMatchable,
    enabled,
    mergeOptions,
    readingCandidates,
  ]);

  return matches;
}
