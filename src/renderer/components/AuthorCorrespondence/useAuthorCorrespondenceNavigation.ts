import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ScraperAuthorWorkspaceTarget } from "@/renderer/types/workspace";
import { writeScraperRouteState } from "@/renderer/utils/scraperBrowserNavigation";
import { openWorkspaceTarget } from "@/renderer/utils/workspaceTargets";

type OpenAuthorTarget = (target: ScraperAuthorWorkspaceTarget) => void;

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

export default function useAuthorCorrespondenceNavigation(onOpenAuthorTarget?: OpenAuthorTarget) {
  const location = useLocation();
  const navigate = useNavigate();
  const openAuthor = React.useCallback((
    scraperId: string,
    authorUrl: string,
    authorName: string,
    templateContext?: Record<string, string | undefined> | null,
  ) => {
    const target = buildAuthorTarget(scraperId, authorUrl, authorName, templateContext);
    if (onOpenAuthorTarget) {
      onOpenAuthorTarget(target);
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
  }, [location.pathname, location.search, navigate, onOpenAuthorTarget]);
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
  return { openAuthor, openAuthorInWorkspace };
}
