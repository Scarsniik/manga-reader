import type { ScraperPotentialMangaMatch } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";
import type { WorkspaceTarget } from "@/renderer/types/workspace";

export const buildPotentialMangaMatchWorkspaceTarget = (
  match: ScraperPotentialMangaMatch,
): WorkspaceTarget => match.target.kind === "library"
  ? {
    kind: "manga-manager.view",
    viewId: "library",
    title: "Bibliotheque",
    locationState: {
      librarySearchQuery: match.target.title,
    },
  }
  : {
    kind: "scraper.details",
    scraperId: match.target.scraperId,
    sourceUrl: match.target.sourceUrl,
    title: match.target.title,
  };
