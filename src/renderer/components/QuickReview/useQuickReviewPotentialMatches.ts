import React from "react";
import usePotentialMangaMatchCandidates from "@/renderer/components/ScraperBrowser/hooks/usePotentialMangaMatchCandidates";
import useScraperCardPotentialMatches, {
  type ScraperCardPotentialMatchInput,
} from "@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches";
import type {
  ScraperPotentialMangaMatch,
  ScraperPotentialMangaMatchState,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import { buildPotentialMangaMatchWorkspaceTarget } from "@/renderer/components/ScraperBrowser/utils/potentialMatchWorkspaceTarget";
import { buildQuickReviewSourceUrls } from "@/renderer/components/QuickReview/quickReviewImages";
import type { QuickReviewItem } from "@/renderer/components/QuickReview/types";
import { uniqueQuickReviewText } from "@/renderer/components/QuickReview/quickReviewText";
import useParams from "@/renderer/hooks/useParams";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";

type Options = {
  item: QuickReviewItem | null;
  details: ScraperRuntimeDetailsResult | null;
  enabled: boolean;
  onOpenError: (message: string | null) => void;
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
  item,
  details,
  enabled,
  onOpenError,
}: Options): Result {
  const { params } = useParams();
  const scraper = item?.primarySource.scraper ?? null;
  const candidates = usePotentialMangaMatchCandidates({ scraper, enabled });
  const input = React.useMemo<ScraperCardPotentialMatchInput | null>(() => {
    if (!item) return null;

    const result = item.primarySource.result;
    const sourceUrls = buildQuickReviewSourceUrls(item, details);
    const titles = uniqueQuickReviewText([
      details?.title,
      item.displayTitle,
      result.detailsTitle,
      result.title,
    ]);
    const title = titles.join(" | ");
    if (!title) return null;

    return {
      key: item.id,
      scraperId: item.primarySource.scraper.id,
      title,
      sourceUrl: sourceUrls[0],
      sourceIdentities: sourceUrls.map((sourceUrl) => ({
        scraperId: item.primarySource.scraper.id,
        sourceUrl,
      })),
      authorNames: uniqueQuickReviewText([
        ...(details?.authors ?? []),
        ...(result.authorNames ?? []),
      ]),
    };
  }, [details, item]);
  const inputs = React.useMemo(() => input ? [input] : [], [input]);
  const mergeOptions = React.useMemo(() => ({
    enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
  }), [params?.multiSearchEnableRomajiPhoneticMerge]);
  const matches = useScraperCardPotentialMatches({
    inputs,
    candidates,
    mergeOptions,
    enabled,
  });
  const currentMatches = input ? matches.matchesByKey.get(input.key) : null;
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

  return {
    readingMatches: currentMatches?.readingMatches ?? EMPTY_MATCHES.readingMatches,
    bookmarkMatches: currentMatches?.bookmarkMatches ?? EMPTY_MATCHES.bookmarkMatches,
    readingListMatches: currentMatches?.readingListMatches ?? EMPTY_MATCHES.readingListMatches,
    loading: enabled && Boolean(input) && (matches.loading || candidates.loading),
    openMatch,
  };
}
