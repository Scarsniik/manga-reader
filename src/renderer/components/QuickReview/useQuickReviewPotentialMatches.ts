import React from "react";
import usePotentialMangaMatchCandidates from "@/renderer/components/ScraperBrowser/hooks/usePotentialMangaMatchCandidates";
import useScraperCardPotentialMatches from "@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches";
import type {
  ScraperPotentialMangaMatch,
  ScraperPotentialMangaMatchState,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import { buildPotentialMangaMatchWorkspaceTarget } from "@/renderer/components/ScraperBrowser/utils/potentialMatchWorkspaceTarget";
import { buildQuickReviewPotentialMatchInputs } from "@/renderer/components/QuickReview/quickReviewPotentialMatches";
import type { QuickReviewItem } from "@/renderer/components/QuickReview/types";
import useParams from "@/renderer/hooks/useParams";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";
import { normalizeQuickReviewPrefetchCount } from "@/shared/quickReviewSettings";

type Options = {
  currentIndex: number;
  detailsByItemId: ReadonlyMap<string, ScraperRuntimeDetailsResult | null>;
  enabled: boolean;
  items: QuickReviewItem[];
  onOpenError: (message: string | null) => void;
  prefetchCountOverride?: number;
};

type Result = ScraperPotentialMangaMatchState & {
  openMatch: (match: ScraperPotentialMangaMatch) => void;
};

const EMPTY_MATCHES: Pick<
  ScraperPotentialMangaMatchState,
  "readingMatches" | "bookmarkMatches" | "readingListMatches"
> = {
  readingMatches: [],
  bookmarkMatches: [],
  readingListMatches: [],
};

export default function useQuickReviewPotentialMatches({
  currentIndex,
  detailsByItemId,
  enabled,
  items,
  onOpenError,
  prefetchCountOverride,
}: Options): Result {
  const { params } = useParams();
  const item = items[currentIndex] ?? null;
  const scraper = item?.primarySource.scraper ?? null;
  const candidates = usePotentialMangaMatchCandidates({ scraper, enabled });
  const prefetchCount = prefetchCountOverride
    ?? normalizeQuickReviewPrefetchCount(params?.quickReviewPrefetchCount);
  const inputs = React.useMemo(() => buildQuickReviewPotentialMatchInputs({
    currentIndex,
    detailsByItemId,
    items,
    prefetchCount,
  }), [currentIndex, detailsByItemId, items, prefetchCount]);
  const input = item ? inputs.find((candidate) => candidate.key === item.id) ?? null : null;
  const mergeOptions = React.useMemo(() => ({
    enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
  }), [params?.multiSearchEnableRomajiPhoneticMerge]);
  const matches = useScraperCardPotentialMatches({
    inputs,
    candidates,
    mergeOptions,
    enabled,
  });
  const currentInputKey = input?.key;
  const currentMatches = currentInputKey ? matches.matchesByKey.get(currentInputKey) : null;
  const openMatch = React.useCallback((match: ScraperPotentialMangaMatch) => {
    onOpenError(null);
    void openWorkspaceTarget(buildPotentialMangaMatchWorkspaceTarget(match), { activate: false })
      .then((opened) => {
        if (!opened) {
          onOpenError("Impossible d'ouvrir cette correspondance dans un nouvel onglet workspace.");
        }
      })
      .catch((error) => {
        onOpenError(error instanceof Error ? error.message : "Impossible d'ouvrir cette correspondance.");
      });
  }, [onOpenError]);
  const loading = enabled && currentInputKey
    ? candidates.loading || !currentMatches || matches.loadingKeys.has(currentInputKey)
    : false;

  return {
    readingMatches: currentMatches?.readingMatches ?? EMPTY_MATCHES.readingMatches,
    bookmarkMatches: currentMatches?.bookmarkMatches ?? EMPTY_MATCHES.bookmarkMatches,
    readingListMatches: currentMatches?.readingListMatches ?? EMPTY_MATCHES.readingListMatches,
    seriesProgress: currentMatches?.seriesProgress ?? null,
    seriesReadingWarning: currentMatches?.seriesReadingWarning ?? null,
    loading,
    openMatch,
  };
}
