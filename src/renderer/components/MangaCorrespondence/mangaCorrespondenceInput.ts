import type { AppParams } from "@/renderer/hooks/useParams";
import { getDepthPages } from "@/renderer/components/MultiSearch/MultiSearchControls";
import type {
  MultiSearchAdvancedPages,
  MultiSearchDepthMode,
  MultiSearchPaceMode,
} from "@/renderer/components/MultiSearch/types";
import type {
  MangaCorrespondenceBackgroundInput,
  MangaCorrespondenceReference,
  MangaCorrespondenceRequest,
  MangaCorrespondenceStrategy,
} from "@/shared/backgroundSearch";
import { buildMangaCorrespondenceSafetySettings } from "@/shared/mangaCorrespondenceSafetySettings";
import type { ScraperRecord } from "@/shared/scraper";

type Options = {
  params: AppParams | null | undefined;
  reference: MangaCorrespondenceReference;
  request: MangaCorrespondenceRequest;
  strategy: MangaCorrespondenceStrategy;
  scrapers: ScraperRecord[];
};

export const buildMangaCorrespondenceInput = ({
  params,
  reference,
  request,
  strategy,
  scrapers,
}: Options): MangaCorrespondenceBackgroundInput => {
  const configuredDepthMode = params?.multiSearchDepthMode;
  const depthMode = (
    typeof configuredDepthMode === "string"
    && ["quick", "extended", "advanced"].includes(configuredDepthMode)
      ? configuredDepthMode
      : "quick"
  ) as MultiSearchDepthMode;
  const advancedPages = (params?.multiSearchAdvancedPages ?? 3) as MultiSearchAdvancedPages;
  const paceMode = (
    params?.multiSearchPaceMode === "careful" ? "careful" : "fast"
  ) as MultiSearchPaceMode;

  return {
    reference,
    request,
    strategy,
    scraperFilterValues: [],
    scrapers,
    maxPages: getDepthPages(depthMode, advancedPages),
    paceMode,
    scrapingConcurrency: Math.max(1, Math.floor(params?.scraperLatestConcurrency ?? 3)),
    scrapeDetailsWithCards: params?.multiSearchScrapeDetailsWithCards === true,
    enableRomajiPhoneticMerge: params?.multiSearchEnableRomajiPhoneticMerge === true,
    safety: buildMangaCorrespondenceSafetySettings(params),
  };
};
