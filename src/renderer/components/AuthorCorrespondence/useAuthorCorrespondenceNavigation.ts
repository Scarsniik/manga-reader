import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  ScraperAuthorWorkspaceTarget,
  ScraperDetailsWorkspaceTarget,
} from "@/renderer/types/workspace";
import { writeScraperRouteState } from "@/renderer/utils/scraperBrowserNavigation";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";

type OpenCorrespondenceTarget = (
  target: ScraperAuthorWorkspaceTarget | ScraperDetailsWorkspaceTarget,
) => void;

const buildAuthorTarget = (
  scraperId: string,
  authorUrl: string,
  authorName: string,
  templateContext?: Record<string, string | undefined> | null,
): ScraperAuthorWorkspaceTarget => ({
  kind: "scraper.author",
  scraperId,
  query: authorUrl,
  title: authorName,
  templateContext: templateContext ?? undefined,
});

const buildMangaTarget = (
  scraperId: string,
  sourceUrl: string,
  title: string,
): ScraperDetailsWorkspaceTarget => ({
  kind: "scraper.details",
  scraperId,
  sourceUrl,
  title,
});

export default function useAuthorCorrespondenceNavigation(onOpenTarget?: OpenCorrespondenceTarget) {
  const location = useLocation();
  const navigate = useNavigate();
  const openAuthor = React.useCallback((
    scraperId: string,
    authorUrl: string,
    authorName: string,
    templateContext?: Record<string, string | undefined> | null,
  ) => {
    const target = buildAuthorTarget(scraperId, authorUrl, authorName, templateContext);
    if (onOpenTarget) {
      onOpenTarget(target);
      return;
    }
    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId,
        mode: "author",
        homepageActive: false,
        homepagePage: 1,
        searchActive: false,
        searchQuery: "",
        searchPage: 1,
        authorActive: true,
        authorQuery: authorUrl,
        authorPage: 1,
        mangaQuery: "",
        mangaUrl: "",
        bookmarksFilterScraperId: null,
      }),
    }, {
      state: { scraperBrowserAuthorTemplateContext: templateContext ?? null },
    });
  }, [location.pathname, location.search, navigate, onOpenTarget]);
  const openAuthorInWorkspace = React.useCallback((
    scraperId: string,
    authorUrl: string,
    authorName: string,
    templateContext?: Record<string, string | undefined> | null,
  ) => {
    void openWorkspaceTarget(buildAuthorTarget(
      scraperId,
      authorUrl,
      authorName,
      templateContext,
    ));
  }, []);
  const openManga = React.useCallback((
    scraperId: string,
    sourceUrl: string,
    title: string,
  ) => {
    const target = buildMangaTarget(scraperId, sourceUrl, title);
    if (onOpenTarget) {
      onOpenTarget(target);
      return;
    }
    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId,
        mode: "manga",
        homepageActive: false,
        homepagePage: 1,
        searchActive: false,
        searchQuery: "",
        searchPage: 1,
        authorActive: false,
        authorQuery: "",
        authorPage: 1,
        mangaQuery: title,
        mangaUrl: sourceUrl,
        bookmarksFilterScraperId: null,
      }),
    });
  }, [location.pathname, location.search, navigate, onOpenTarget]);
  const openMangaInWorkspace = React.useCallback((
    scraperId: string,
    sourceUrl: string,
    title: string,
  ) => {
    void openWorkspaceTarget(buildMangaTarget(scraperId, sourceUrl, title));
  }, []);
  return {
    openAuthor,
    openAuthorInWorkspace,
    openManga,
    openMangaInWorkspace,
  };
}
