import type { NavigateFunction } from "react-router-dom";
import {
  type FetchScraperDocumentRequest,
  type FetchScraperDocumentResult,
  hasScraperFieldSelectorValue,
  type ScraperReaderProgressRecord,
} from "@/shared/scraper";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { resolveScraperReaderPageUrls } from "@/renderer/utils/scraperReaderPages";
import { usesScraperPagesChapters } from "@/renderer/utils/scraperPages";
import { buildScraperTemplateContextFromDetails } from "@/renderer/utils/scraperTemplateContext";
import {
  createScraperMangaId,
  extractScraperDetailsFromDocumentWithImageFallbacks,
  getScraperChaptersFeatureConfig,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  hasRenderableDetails,
  resolveScraperChapters,
  type ScraperRuntimeChapterResult,
} from "@/renderer/utils/scraperRuntime";

type OpenMultiSearchSourceReaderOptions = {
  source: MultiSearchSourceResult;
  page?: number | null;
  knownTotalPages?: number | null;
  readerMangaId?: string | null;
  navigate: NavigateFunction;
  from: {
    pathname: string;
    search: string;
  };
};

type FetchScraperDocumentApi = (
  request: FetchScraperDocumentRequest,
) => Promise<FetchScraperDocumentResult>;

const normalizeRequestedReaderPage = (
  value: number | null | undefined,
  totalPages: number,
): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || totalPages <= 0) {
    return null;
  }

  return Math.max(1, Math.min(totalPages, Math.floor(value)));
};

const getApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

const getSavedProgress = async (
  api: any,
  readerMangaId: string | null | undefined,
): Promise<ScraperReaderProgressRecord | null> => (
  readerMangaId && typeof api?.getScraperReaderProgress === "function"
    ? await api.getScraperReaderProgress(readerMangaId)
    : null
);

const findChapterByReaderMangaId = (
  scraperId: string,
  sourceUrls: string[],
  chapters: ScraperRuntimeChapterResult[],
  readerMangaId: string,
): ScraperRuntimeChapterResult | null => (
  chapters.find((chapter) => (
    sourceUrls.some((sourceUrl) => createScraperMangaId(scraperId, sourceUrl, chapter.url) === readerMangaId)
  )) ?? null
);

export const openMultiSearchSourceReader = async ({
  source,
  page,
  knownTotalPages,
  readerMangaId: progressReaderMangaId,
  navigate,
  from,
}: OpenMultiSearchSourceReaderOptions): Promise<void> => {
  const detailUrl = source.result.detailUrl;
  if (!detailUrl) {
    throw new Error("Cette source ne fournit pas d'URL de fiche.");
  }

  const detailsConfig = getScraperDetailsFeatureConfig(getScraperFeature(source.scraper, "details"));
  if (!detailsConfig || !hasScraperFieldSelectorValue(detailsConfig.titleSelector)) {
    throw new Error("Le composant Fiche n'est pas configure pour cette source.");
  }

  const pagesConfig = getScraperPagesFeatureConfig(getScraperFeature(source.scraper, "pages"));
  if (!pagesConfig) {
    throw new Error("Le composant Pages n'est pas configure pour cette source.");
  }

  const api = getApi();
  if (!api || typeof api.fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
  }

  const fetchScraperDocument = api.fetchScraperDocument as FetchScraperDocumentApi;
  const documentResult = await fetchScraperDocument({
    baseUrl: source.scraper.baseUrl,
    targetUrl: detailUrl,
  });

  if (!documentResult?.ok || !documentResult.html) {
    throw new Error(
      documentResult?.error
      || (typeof documentResult?.status === "number"
        ? `La fiche a repondu avec le code HTTP ${documentResult.status}.`
        : "Impossible de charger la fiche demandee."),
    );
  }

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(documentResult.html, "text/html");
  const detailsResult = await extractScraperDetailsFromDocumentWithImageFallbacks(documentNode, detailsConfig, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
    status: documentResult.status,
    contentType: documentResult.contentType,
    html: documentResult.html,
  }, async (request) => fetchScraperDocument(request));

  if (!hasRenderableDetails(detailsResult)) {
    throw new Error("La fiche a ete chargee, mais aucun contenu exploitable n'a ete extrait.");
  }

  const detailsSourceUrl = detailsResult.finalUrl || detailsResult.requestedUrl || detailUrl;
  let savedProgress = await getSavedProgress(api, progressReaderMangaId);
  let sourceUrl = savedProgress?.sourceUrl || detailsSourceUrl;
  let readerMangaId = progressReaderMangaId || createScraperMangaId(source.scraper.id, sourceUrl);
  let targetChapter: ScraperRuntimeChapterResult | null = null;
  let chaptersResult: ScraperRuntimeChapterResult[] = [];

  if (usesScraperPagesChapters(pagesConfig)) {
    if (!progressReaderMangaId) {
      throw new Error("Impossible de retrouver le chapitre associe a cette progression.");
    }

    const chaptersConfig = getScraperChaptersFeatureConfig(getScraperFeature(source.scraper, "chapters"));
    if (!chaptersConfig) {
      throw new Error("Le composant Chapitres n'est pas configure pour cette source.");
    }

    const chaptersResolution = await resolveScraperChapters(
      source.scraper.baseUrl,
      detailsSourceUrl,
      chaptersConfig,
      buildScraperTemplateContextFromDetails(detailsResult),
      async (request) => fetchScraperDocument(request),
    );

    if (!chaptersResolution.sourceResult?.ok || !chaptersResolution.sourceResult.html) {
      throw new Error("Impossible de charger les chapitres associes a cette progression.");
    }

    chaptersResult = chaptersResolution.chapters;
    targetChapter = findChapterByReaderMangaId(
      source.scraper.id,
      Array.from(new Set([sourceUrl, detailsSourceUrl, detailUrl].filter(Boolean))),
      chaptersResult,
      progressReaderMangaId,
    );

    if (!targetChapter) {
      throw new Error("Impossible de retrouver le chapitre associe a cette progression.");
    }

    readerMangaId = progressReaderMangaId;
  } else if (!savedProgress) {
    savedProgress = await getSavedProgress(api, readerMangaId);
    sourceUrl = savedProgress?.sourceUrl || sourceUrl;
  }

  const pageUrls = await resolveScraperReaderPageUrls(
    source.scraper,
    detailsResult,
    pagesConfig,
    async (request) => fetchScraperDocument(request),
    {
      chapter: targetChapter,
      knownTotalPages: knownTotalPages ?? savedProgress?.totalPages,
    },
  );

  if (!pageUrls.length) {
    throw new Error("Aucune page n'a ete resolue pour cette source.");
  }

  const requestedPage = normalizeRequestedReaderPage(page ?? savedProgress?.currentPage, pageUrls.length);
  const initialPage = requestedPage
    ?? (typeof savedProgress?.currentPage === "number" && savedProgress.currentPage > 0
      ? savedProgress.currentPage
      : 1);

  navigate(
    `/reader?id=${encodeURIComponent(readerMangaId)}&page=${encodeURIComponent(String(initialPage))}`,
    {
      state: {
        from,
        mangaId: readerMangaId,
        scraperBrowserReturn: {
          scraperId: source.scraper.id,
          query: source.searchTerm || source.result.title || "",
          detailsResult,
          chaptersResult,
          listingReturnState: null,
        },
        scraperReader: {
          id: readerMangaId,
          scraperId: source.scraper.id,
          title: detailsResult.title || source.result.title || "manga",
          sourceUrl,
          cover: targetChapter?.image || detailsResult.cover || source.result.thumbnailUrl,
          language: detailsResult.languageCodes?.[0]
            || source.sourceLanguageCodes[0]
            || source.scraper.globalConfig.defaultLanguage
            || null,
          pageUrls,
          chapter: targetChapter ?? undefined,
          bookmarkExcludedFields: source.scraper.globalConfig.bookmark.excludedFields,
          ignoreSavedProgress: requestedPage !== null,
        },
      },
    },
  );
};
