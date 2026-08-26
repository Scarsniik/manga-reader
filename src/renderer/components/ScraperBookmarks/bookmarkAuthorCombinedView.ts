import type {
  AuthorCorrespondenceBackgroundInput,
  BackgroundSearchJob,
} from "@/shared/backgroundSearch";
import type { ScraperRecord } from "@/shared/scraper";
import { enqueueBackgroundSearch } from "@/renderer/backgroundSearch/backgroundSearchClient";
import { getDepthPages } from "@/renderer/components/MultiSearch/MultiSearchControls";
import type {
  MultiSearchAdvancedPages,
  MultiSearchDepthMode,
  MultiSearchPaceMode,
} from "@/renderer/components/MultiSearch/types";
import type { AppParams } from "@/renderer/hooks/useParams";
import { buildMangaCorrespondenceSafetySettings } from "@/shared/mangaCorrespondenceSafetySettings";
import { buildUniqueAuthorSearchNames } from "@/renderer/utils/authorSearchNames";
import type { BookmarkAuthorStat } from "@/renderer/components/ScraperBookmarks/bookmarkAuthorStats";

const loadScrapers = async (): Promise<ScraperRecord[]> => {
  const api = window.api ?? {};
  if (typeof api.getScrapers !== "function") {
    throw new Error("La liste des scrappers n'est pas disponible.");
  }

  const records = await api.getScrapers();
  return Array.isArray(records) ? records : [];
};

export const createBookmarkAuthorCombinedJob = async (
  stat: BookmarkAuthorStat,
  params: AppParams | null | undefined,
): Promise<BackgroundSearchJob> => {
  const scrapers = await loadScrapers();
  if (!scrapers.length) {
    throw new Error("Aucun scrapper n'est disponible pour rechercher cet auteur.");
  }

  const depthMode = (["quick", "extended", "advanced"].includes(params?.multiSearchDepthMode ?? "")
    ? params?.multiSearchDepthMode
    : "quick") as MultiSearchDepthMode;
  const advancedPages = (params?.multiSearchAdvancedPages ?? 3) as MultiSearchAdvancedPages;
  const paceMode = (params?.multiSearchPaceMode === "careful"
    ? "careful"
    : "fast") as MultiSearchPaceMode;
  const names = buildUniqueAuthorSearchNames([
    stat.author,
    stat.favoriteName ?? "",
    ...stat.variants.map((variant) => variant.author),
    ...stat.referenceSources.map((source) => source.name),
  ]);
  const input: AuthorCorrespondenceBackgroundInput = {
    referenceName: stat.author,
    names,
    referenceSources: stat.referenceSources,
    scraperFilterValues: params?.multiSearchSelectedScraperIds ?? [],
    scrapers,
    maxPages: getDepthPages(depthMode, advancedPages),
    authorPageCount: Math.max(1, Math.floor(params?.scraperAuthorFavoritePageCount ?? 1)),
    paceMode,
    scrapingConcurrency: Math.max(1, Math.floor(params?.scraperLatestConcurrency ?? 3)),
    scrapeDetailsWithCards: params?.multiSearchScrapeDetailsWithCards === true,
    correspondenceSafety: buildMangaCorrespondenceSafetySettings(params),
  };
  const metadata = await enqueueBackgroundSearch({
    input,
    kind: "authorCorrespondence",
    params,
    primaryTerm: stat.author,
    title: `Auteur combiné · ${stat.author}`,
  });
  const api = window.api ?? {};
  if (typeof api.getBackgroundSearchJob !== "function") {
    throw new Error("La recherche a été lancée, mais sa vue ne peut pas être ouverte.");
  }

  const job = await api.getBackgroundSearchJob(metadata.id) as BackgroundSearchJob | null;
  if (!job?.input) {
    throw new Error("La recherche a été lancée, mais son résultat est momentanément indisponible.");
  }
  return job;
};
