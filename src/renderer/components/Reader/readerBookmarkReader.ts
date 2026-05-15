import type { Manga } from "@/renderer/types";
import type {
  FetchScraperDocumentResult,
  ScraperRecord,
} from "@/shared/scraper";
import type { EndOfReadingRecommendation } from "@/renderer/components/Reader/endOfReadingRecommendations";
import { canOpenStandaloneBookmarkInReader } from "@/renderer/components/Reader/readerBookmarkRecommendations";
import { findMangaLinkedToSource, normalizeMangaSourceUrl } from "@/renderer/utils/mangaSource";
import { resolveScraperReaderPageUrls } from "@/renderer/utils/scraperReaderPages";
import {
  createScraperMangaId,
  extractScraperDetailsFromDocumentWithImageFallbacks,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  hasRenderableDetails,
  type ScraperRuntimeDetailsResult,
} from "@/renderer/utils/scraperRuntime";

type BookmarkReaderResolution = {
  scraper: ScraperRecord;
  readerMangaId: string;
  initialPage: number;
  sourceUrl: string;
  title: string;
  cover?: string;
  pageUrls: string[];
  detailsResult: ScraperRuntimeDetailsResult;
};

type FetchScraperDocumentApi = (request: {
  baseUrl: string;
  targetUrl: string;
}) => Promise<FetchScraperDocumentResult>;

const toPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const loadScraperById = async (
  scraperId: string,
  scrapersById: Map<string, ScraperRecord>,
): Promise<ScraperRecord | null> => {
  const cachedScraper = scrapersById.get(scraperId) ?? null;
  if (cachedScraper) {
    return cachedScraper;
  }

  const api = (window as any).api;
  if (!api || typeof api.getScrapers !== "function") {
    return null;
  }

  const scrapers = await api.getScrapers();
  return Array.isArray(scrapers)
    ? scrapers.find((scraper: ScraperRecord) => scraper.id === scraperId) ?? null
    : null;
};

const getFetchScraperDocumentApi = (): FetchScraperDocumentApi => {
  const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
  if (typeof fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
  }

  return fetchScraperDocument as FetchScraperDocumentApi;
};

const getResolvedDetails = async (
  scraper: ScraperRecord,
  sourceUrl: string,
  fallbackTitle: string,
  fallbackLanguageCodes: string[],
): Promise<ScraperRuntimeDetailsResult> => {
  const detailsConfig = getScraperDetailsFeatureConfig(getScraperFeature(scraper, "details"));
  if (!detailsConfig) {
    throw new Error("Le composant Fiche n'est pas configure pour ce scrapper.");
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
  const details = await extractScraperDetailsFromDocumentWithImageFallbacks(documentNode, detailsConfig, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
    status: documentResult.status,
    contentType: documentResult.contentType,
    html: documentResult.html,
  }, async (request) => fetchScraperDocument(request));

  if (!hasRenderableDetails(details)) {
    throw new Error("La fiche a bien ete chargee, mais aucun contenu exploitable n'a ete extrait avec la configuration actuelle.");
  }

  return {
    ...details,
    title: details.title || fallbackTitle || "manga",
    languageCodes: details.languageCodes.length ? details.languageCodes : fallbackLanguageCodes,
  };
};

export const resolveBookmarkRecommendationForReader = async (
  targetManga: EndOfReadingRecommendation,
  scrapersById: Map<string, ScraperRecord>,
): Promise<BookmarkReaderResolution> => {
  const scraperId = String(targetManga.scraperId ?? "").trim();
  const sourceUrl = normalizeMangaSourceUrl(targetManga.sourceUrl);
  if (!scraperId || !sourceUrl) {
    throw new Error("La recommandation bookmark est incomplete.");
  }

  const scraper = await loadScraperById(scraperId, scrapersById);
  if (!scraper) {
    throw new Error("Le scrapper source est introuvable.");
  }

  if (!canOpenStandaloneBookmarkInReader(scraper)) {
    throw new Error("Ce bookmark ne peut pas etre ouvert directement dans le lecteur.");
  }

  const pagesConfig = getScraperPagesFeatureConfig(getScraperFeature(scraper, "pages"));
  if (!pagesConfig) {
    throw new Error("Le composant Pages n'est pas configure pour ce scrapper.");
  }

  const fallbackLanguageCodes = targetManga.recommendationLanguageCodes?.length
    ? targetManga.recommendationLanguageCodes
    : targetManga.language ? [targetManga.language] : [];
  const details = await getResolvedDetails(
    scraper,
    sourceUrl,
    targetManga.title,
    fallbackLanguageCodes,
  );
  const resolvedSourceUrl = details.finalUrl || details.requestedUrl || sourceUrl;
  const readerMangaId = createScraperMangaId(scraper.id, resolvedSourceUrl);
  const savedProgress = (window as any).api
    && typeof (window as any).api.getScraperReaderProgress === "function"
    ? await (window as any).api.getScraperReaderProgress(readerMangaId)
    : null;
  const fetchScraperDocument = getFetchScraperDocumentApi();
  const pageUrls = await resolveScraperReaderPageUrls(
    scraper,
    details,
    pagesConfig,
    async (request) => fetchScraperDocument(request),
    {
      knownTotalPages: toPositiveInteger(savedProgress?.totalPages) ?? toPositiveInteger(targetManga.pages),
    },
  );
  if (!pageUrls.length) {
    throw new Error("Aucune page n'a ete resolue pour ce bookmark.");
  }

  const savedPage = toPositiveInteger(savedProgress?.currentPage)
    ?? toPositiveInteger(targetManga.currentPage)
    ?? 1;
  const initialPage = pageUrls.length > 0 && savedPage < pageUrls.length
    ? savedPage
    : 1;

  return {
    scraper,
    readerMangaId,
    initialPage,
    sourceUrl: resolvedSourceUrl,
    title: details.title || targetManga.title || "manga",
    cover: details.cover || targetManga.thumbnailPath || undefined,
    pageUrls,
    detailsResult: details,
  };
};

export const findLinkedLibraryMangaForRecommendation = (
  libraryMangas: Manga[],
  targetManga: EndOfReadingRecommendation,
): Manga | null => {
  if (targetManga.recommendationSource !== "bookmark") {
    return libraryMangas.find((manga) => manga.id === targetManga.id) ?? null;
  }

  return findMangaLinkedToSource(libraryMangas, {
    scraperId: targetManga.scraperId,
    sourceUrl: targetManga.sourceUrl,
  });
};
