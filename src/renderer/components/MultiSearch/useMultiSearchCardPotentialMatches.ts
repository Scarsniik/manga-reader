import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Manga } from "@/renderer/types";
import type { ScraperRecord } from "@/shared/scraper";
import type { MultiSearchMergedResult } from "@/renderer/components/MultiSearch/types";
import useParams from "@/renderer/hooks/useParams";
import usePotentialMangaMatchCandidates from "@/renderer/components/ScraperBrowser/hooks/usePotentialMangaMatchCandidates";
import useScraperCardPotentialMatches, {
  type ScraperCardPotentialMatchInput,
} from "@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches";
import type { ScraperPotentialMangaMatch } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import { buildPotentialMangaMatchWorkspaceTarget } from "@/renderer/components/ScraperBrowser/utils/potentialMatchWorkspaceTarget";
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

    const matchTitles = Array.from(new Set([
      result.title,
      ...result.sources.map((source) => source.result.detailsTitle),
    ].map((title) => String(title ?? "").trim()).filter(Boolean)));
    const sourceIdentities = result.sources.flatMap((source) => ([
      source.result.detailUrl,
      source.result.detailsSourceUrl,
    ].filter(Boolean).map((sourceUrl) => ({
      scraperId: source.scraper.id,
      sourceUrl,
    }))));

    return [{
      key: result.id,
      scraperId: primarySource.scraper.id,
      title: matchTitles.join(" | "),
      sourceUrl: primarySource.result.detailsSourceUrl || primarySource.result.detailUrl,
      sourceIdentities,
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
    void openWorkspaceTarget(buildPotentialMangaMatchWorkspaceTarget(match));
  }, []);

  return {
    ...potentialMatches,
    openMatch,
    openMatchInWorkspace,
  };
}
