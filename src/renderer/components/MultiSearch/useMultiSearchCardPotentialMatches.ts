import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Manga } from "@/renderer/types";
import type { WorkspaceTarget } from "@/renderer/types/workspace";
import type { ScraperRecord } from "@/shared/scraper";
import type { MultiSearchMergedResult } from "@/renderer/components/MultiSearch/types";
import useParams from "@/renderer/hooks/useParams";
import usePotentialMangaMatchCandidates from "@/renderer/components/ScraperBrowser/hooks/usePotentialMangaMatchCandidates";
import useScraperCardPotentialMatches, {
  type ScraperCardPotentialMatchInput,
} from "@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches";
import type { ScraperPotentialMangaMatch } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import {
  clearScraperRouteState,
  writeScraperRouteState,
} from "@/renderer/utils/scraperBrowserNavigation";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";

type Options = {
  results: MultiSearchMergedResult[];
  libraryMangas: Manga[];
  fallbackScraper: ScraperRecord | null;
};

const buildLibraryTarget = (title: string): WorkspaceTarget => ({
  kind: "manga-manager.view",
  viewId: "library",
  title: "Bibliotheque",
  locationState: {
    librarySearchQuery: title,
  },
});

const buildWorkspaceTarget = (match: ScraperPotentialMangaMatch): WorkspaceTarget => (
  match.target.kind === "library"
    ? buildLibraryTarget(match.target.title)
    : {
      kind: "scraper.details",
      scraperId: match.target.scraperId,
      sourceUrl: match.target.sourceUrl,
      title: match.target.title,
    }
);

export default function useMultiSearchCardPotentialMatches({
  results,
  libraryMangas,
  fallbackScraper,
}: Options) {
  const { params } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const enabled = params?.scraperCardPotentialMatchesEnabled !== false;
  const candidates = usePotentialMangaMatchCandidates({
    scraper: fallbackScraper,
    libraryMangas,
    enabled,
  });
  const mergeOptions = useMemo(() => ({
    enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
  }), [params?.multiSearchEnableRomajiPhoneticMerge]);
  const inputs = useMemo<ScraperCardPotentialMatchInput[]>(() => results.flatMap((result) => {
    const primarySource = result.sources[0];
    if (!primarySource) {
      return [];
    }

    return [{
      key: result.id,
      scraperId: primarySource.scraper.id,
      title: result.title,
      sourceUrl: primarySource.result.detailUrl,
      sourceIdentities: result.sources.map((source) => ({
        scraperId: source.scraper.id,
        sourceUrl: source.result.detailUrl,
      })),
      authorNames: [
        ...result.tentativeAuthorNames,
        ...result.sources.flatMap((source) => source.tentativeAuthorNames),
      ],
    }];
  }), [results]);
  const potentialMatches = useScraperCardPotentialMatches({
    inputs,
    candidates,
    mergeOptions,
    enabled,
  });

  const openMatch = useCallback((match: ScraperPotentialMangaMatch) => {
    if (match.target.kind === "library") {
      const clearedSearch = clearScraperRouteState(location.search);
      const searchParams = new URLSearchParams(
        clearedSearch.startsWith("?") ? clearedSearch.slice(1) : clearedSearch,
      );
      searchParams.set("q", match.target.title);
      const nextSearch = searchParams.toString();
      navigate({
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      }, {
        state: {
          ...(location.state && typeof location.state === "object" ? location.state : {}),
          librarySearchQuery: match.target.title,
        },
      });
      return;
    }

    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId: match.target.scraperId,
        mode: "manga",
        searchActive: false,
        searchQuery: "",
        searchPage: 1,
        authorActive: false,
        authorQuery: "",
        authorPage: 1,
        mangaQuery: "",
        mangaUrl: match.target.sourceUrl,
        bookmarksFilterScraperId: null,
      }),
    });
  }, [location.pathname, location.search, location.state, navigate]);

  const openMatchInWorkspace = useCallback((match: ScraperPotentialMangaMatch) => {
    void openWorkspaceTarget(buildWorkspaceTarget(match));
  }, []);

  return {
    ...potentialMatches,
    openMatch,
    openMatchInWorkspace,
  };
}
