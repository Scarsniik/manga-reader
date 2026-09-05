import { useMemo } from "react";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";
import type { MangaMergeOptions } from "@/renderer/utils/mangaMatching/titleProfiles";
import useScraperCardPotentialMatches, {
  buildScraperCardPotentialMatchInput,
  type ScraperCardPotentialMatchInput,
} from "@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches";
import type { PotentialMangaMatchCandidateCollections } from "@/renderer/components/ScraperBrowser/hooks/usePotentialMangaMatchCandidates";
import type { ScraperPotentialMangaMatchState } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";

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
  seriesProgress: null,
  seriesReadingWarning: null,
  loading: false,
};

export const buildScraperDetailsPotentialMatchInput = (
  scraperId: string,
  detailsResult: ScraperRuntimeDetailsResult | null,
): ScraperCardPotentialMatchInput | null => {
  if (!detailsResult) {
    return null;
  }

  const sourceUrl = detailsResult.finalUrl || detailsResult.requestedUrl;
  const title = detailsResult.title || sourceUrl;
  if (!title) {
    return null;
  }

  return buildScraperCardPotentialMatchInput(scraperId, {
    title,
    detailUrl: detailsResult.requestedUrl,
    detailsMetadataFetched: true,
    detailsTitle: title,
    detailsSourceUrl: sourceUrl,
    authorNames: detailsResult.authors,
  });
};

export default function useScraperPotentialMangaMatches({
  scraperId,
  detailsResult,
  mergeOptions,
  candidates,
  enabled = true,
}: Options): ScraperPotentialMangaMatchState {
  const input = useMemo(
    () => buildScraperDetailsPotentialMatchInput(scraperId, detailsResult),
    [detailsResult, scraperId],
  );
  const inputs = useMemo(() => input ? [input] : [], [input]);
  const matches = useScraperCardPotentialMatches({
    inputs,
    candidates,
    mergeOptions,
    enabled,
  });
  const result = input ? matches.matchesByKey.get(input.key) : null;

  if (!enabled || !input) {
    return EMPTY_MATCH_STATE;
  }

  return {
    readingMatches: result?.readingMatches ?? [],
    bookmarkMatches: result?.bookmarkMatches ?? [],
    readingListMatches: result?.readingListMatches ?? [],
    seriesProgress: result?.seriesProgress ?? null,
    seriesReadingWarning: result?.seriesReadingWarning ?? null,
    loading: matches.loading || candidates.loading,
  };
}
