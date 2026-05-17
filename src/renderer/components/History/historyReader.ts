import type {
  DetailsHistoryRecord,
  ReadingHistoryRecord,
} from "@/shared/history";
import type {
  FetchScraperDocumentResult,
  ScraperRecord,
} from "@/shared/scraper";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";
import {
  createScraperMangaId,
  extractScraperDetailsFromDocumentWithImageFallbacks,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  hasRenderableDetails,
  isScraperFeatureConfigured,
  type ScraperRuntimeChapterResult,
  type ScraperRuntimeDetailsResult,
} from "@/renderer/utils/scraperRuntime";
import { resolveScraperReaderPageUrls } from "@/renderer/utils/scraperReaderPages";
import { usesScraperPagesChapters } from "@/renderer/utils/scraperPages";
import { toPositiveInteger } from "@/renderer/components/History/historyUtils";

type FetchScraperDocumentApi = (request: {
  baseUrl: string;
  targetUrl: string;
}) => Promise<FetchScraperDocumentResult>;

export type ScraperReaderResolution = {
  readerMangaId: string;
  sourceUrl: string;
  title: string;
  cover?: string;
  initialPage: number;
  pageUrls: string[];
  detailsResult: ScraperRuntimeDetailsResult;
  chapter?: ScraperRuntimeChapterResult;
};

const getHistoryApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

const getFetchScraperDocumentApi = (): FetchScraperDocumentApi => {
  const fetchScraperDocument = getHistoryApi()?.fetchScraperDocument;
  if (typeof fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
  }

  return fetchScraperDocument as FetchScraperDocumentApi;
};

export const canOpenScraperReader = (
  scraper: ScraperRecord | null | undefined,
  chapterUrl?: string | null,
): boolean => {
  if (!scraper) {
    return false;
  }

  const detailsFeature = getScraperFeature(scraper, "details");
  const pagesFeature = getScraperFeature(scraper, "pages");
  const pagesConfig = getScraperPagesFeatureConfig(pagesFeature);

  if (!isScraperFeatureConfigured(detailsFeature) || !isScraperFeatureConfigured(pagesFeature) || !pagesConfig) {
    return false;
  }

  return !usesScraperPagesChapters(pagesConfig) || Boolean(chapterUrl);
};

export const getScraperHistoryCover = (
  cover: string | null | undefined,
  sourceUrl: string | null | undefined,
): string | undefined => (
  buildRemoteThumbnailUrl(cover, sourceUrl) || String(cover ?? "").trim() || undefined
);

export const resolveScraperReader = async (
  record: ReadingHistoryRecord | DetailsHistoryRecord,
  scraper: ScraperRecord,
): Promise<ScraperReaderResolution> => {
  const sourceUrl = record.sourceUrl;
  if (!sourceUrl) {
    throw new Error("Cette entree d'historique n'a pas d'URL source.");
  }

  const pagesConfig = getScraperPagesFeatureConfig(getScraperFeature(scraper, "pages"));
  const detailsConfig = getScraperDetailsFeatureConfig(getScraperFeature(scraper, "details"));
  if (!pagesConfig || !detailsConfig) {
    throw new Error("Le scrapper n'est pas configure pour ouvrir le lecteur.");
  }

  const fetchScraperDocument = getFetchScraperDocumentApi();
  const documentResult = await fetchScraperDocument({
    baseUrl: scraper.baseUrl,
    targetUrl: sourceUrl,
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

  const readingRecord = "sourceKind" in record ? record : null;
  const chapter = readingRecord?.chapterUrl
    ? {
      url: readingRecord.chapterUrl,
      label: readingRecord.chapterLabel || "Chapitre",
      image: readingRecord.cover || detailsResult.cover,
    }
    : undefined;
  const resolvedSourceUrl = detailsResult.finalUrl || detailsResult.requestedUrl || sourceUrl;
  const readerMangaId = readingRecord?.readerProgressId
    || createScraperMangaId(scraper.id, resolvedSourceUrl, chapter?.url);
  const savedProgress = typeof getHistoryApi()?.getScraperReaderProgress === "function"
    ? await getHistoryApi().getScraperReaderProgress(readerMangaId)
    : null;
  const savedPage = toPositiveInteger(savedProgress?.currentPage)
    ?? toPositiveInteger(readingRecord?.currentPage)
    ?? 1;
  const pageUrls = await resolveScraperReaderPageUrls(
    scraper,
    detailsResult,
    pagesConfig,
    async (request) => fetchScraperDocument(request),
    {
      chapter: chapter ?? null,
      initialPage: savedPage,
      knownTotalPages: toPositiveInteger(savedProgress?.totalPages)
        ?? toPositiveInteger(readingRecord?.totalPages),
    },
  );

  if (!pageUrls.length) {
    throw new Error("Aucune page n'a ete resolue pour cette lecture.");
  }

  return {
    readerMangaId,
    sourceUrl: resolvedSourceUrl,
    title: detailsResult.title || record.title || "manga",
    cover: detailsResult.cover || ("cover" in record ? record.cover : undefined),
    initialPage: savedPage >= pageUrls.length ? 1 : savedPage,
    pageUrls,
    detailsResult,
    chapter,
  };
};
