import type { Manga } from "@/renderer/types";
import type { ReadingListItem } from "@/renderer/types/readingList";
import type {
  ReaderWorkspaceTarget,
  ScraperDetailsWorkspaceTarget,
} from "@/renderer/types/workspace";
import { resolveBookmarkRecommendationForReader } from "@/renderer/components/Reader/readerBookmarkReader";
import { buildReaderWorkspaceTarget } from "@/renderer/utils/workspaceTargets";

const toPositiveInteger = (value: unknown): number | null => {
  const numberValue = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : null;
};

const getResumePage = (
  currentPage: unknown,
  totalPages: unknown,
): number => {
  const normalizedCurrentPage = toPositiveInteger(currentPage) ?? 1;
  const normalizedTotalPages = toPositiveInteger(totalPages);

  return normalizedTotalPages !== null && normalizedCurrentPage >= normalizedTotalPages
    ? 1
    : normalizedCurrentPage;
};

const resolveExistingReaderTarget = async (
  target: ReaderWorkspaceTarget,
  resumeProgress: boolean,
): Promise<ReaderWorkspaceTarget> => {
  const scraperReader = target.locationState?.scraperReader;

  if (scraperReader) {
    const savedProgress = resumeProgress
      && window.api
      && typeof window.api.getScraperReaderProgress === "function"
      ? await window.api.getScraperReaderProgress(target.mangaId)
      : null;
    const page = resumeProgress
      ? getResumePage(savedProgress?.currentPage ?? target.page, savedProgress?.totalPages ?? scraperReader.pageUrls.length)
      : 1;

    return {
      ...target,
      page,
      locationState: {
        ...target.locationState,
        scraperReader: {
          ...scraperReader,
          ignoreSavedProgress: true,
        },
      },
    };
  }

  const mangas: Manga[] = window.api && typeof window.api.getMangas === "function"
    ? await window.api.getMangas()
    : [];
  const manga = Array.isArray(mangas)
    ? mangas.find((candidate) => String(candidate.id) === String(target.mangaId)) ?? null
    : null;
  const page = resumeProgress
    ? getResumePage(manga?.currentPage ?? target.page, manga?.pages)
    : 1;

  return {
    ...target,
    page,
  };
};

const resolveDetailsTarget = async (
  item: ReadingListItem,
  resumeProgress: boolean,
): Promise<ReaderWorkspaceTarget> => {
  const sourceTarget = item.sourceTarget;
  if (sourceTarget.kind !== "scraper.details") {
    throw new Error("La fiche de la liste de lecture est invalide.");
  }

  const resolution = await resolveBookmarkRecommendationForReader({
    id: `reading-list:${item.id}`,
    title: item.metadata.title,
    path: "",
    thumbnailPath: item.metadata.cover,
    createdAt: "",
    currentPage: null,
    pages: null,
    language: item.metadata.languageCodes?.[0] ?? null,
    authorIds: [],
    tagIds: [],
    sourceKind: "scraper",
    scraperId: sourceTarget.scraperId,
    sourceUrl: sourceTarget.sourceUrl,
    recommendationSource: "bookmark",
    recommendationLanguageCodes: item.metadata.languageCodes,
  }, new Map());
  const page = resumeProgress ? resolution.initialPage : 1;

  return buildReaderWorkspaceTarget({
    mangaId: resolution.readerMangaId,
    page,
    title: resolution.title,
    locationState: {
      mangaId: resolution.readerMangaId,
      scraperReader: {
        id: resolution.readerMangaId,
        scraperId: resolution.scraper.id,
        title: resolution.title,
        sourceUrl: resolution.sourceUrl,
        cover: resolution.cover,
        language: resolution.detailsResult.languageCodes?.[0]
          || resolution.scraper.globalConfig.defaultLanguage
          || null,
        pageUrls: resolution.pageUrls,
        bookmarkExcludedFields: resolution.scraper.globalConfig.bookmark.excludedFields,
        ignoreSavedProgress: true,
      },
    },
  });
};

export const resolveReadingListReaderTarget = async (
  item: ReadingListItem,
  resumeProgress: boolean,
): Promise<ReaderWorkspaceTarget> => (
  item.sourceTarget.kind === "reader"
    ? resolveExistingReaderTarget(item.sourceTarget, resumeProgress)
    : resolveDetailsTarget(item, resumeProgress)
);

export const getReadingListBookmarkTarget = async (item: ReadingListItem): Promise<{
  scraperId: string;
  sourceUrl: string;
} | null> => {
  const sourceTarget = item.sourceTarget;

  if (sourceTarget.kind === "scraper.details") {
    return {
      scraperId: sourceTarget.scraperId,
      sourceUrl: sourceTarget.sourceUrl,
    };
  }

  const scraperReader = sourceTarget.locationState?.scraperReader;
  if (!scraperReader?.scraperId || !scraperReader.sourceUrl) {
    if (!window.api || typeof window.api.getMangas !== "function") {
      return null;
    }

    const mangas: Manga[] = await window.api.getMangas();
    const manga = Array.isArray(mangas)
      ? mangas.find((candidate) => String(candidate.id) === String(sourceTarget.mangaId)) ?? null
      : null;
    const scraperId = String(manga?.scraperId ?? "").trim();
    const sourceUrl = String(manga?.sourceUrl ?? "").trim();

    return scraperId && sourceUrl ? { scraperId, sourceUrl } : null;
  }

  return {
    scraperId: scraperReader.scraperId,
    sourceUrl: scraperReader.sourceUrl,
  };
};

export const resolveReadingListDetailsTarget = async (
  item: ReadingListItem,
): Promise<ScraperDetailsWorkspaceTarget | null> => {
  const sourceTarget = item.sourceTarget;

  if (sourceTarget.kind === "scraper.details") {
    return {
      ...sourceTarget,
      title: item.metadata.title,
    };
  }

  const scraperReader = sourceTarget.locationState?.scraperReader;
  const browserReturn = sourceTarget.locationState?.scraperBrowserReturn;
  const browserDetails = browserReturn?.detailsResult;
  const scraperId = String(scraperReader?.scraperId || browserReturn?.scraperId || "").trim();
  const sourceUrl = String(
    scraperReader?.sourceUrl
    || browserDetails?.finalUrl
    || browserDetails?.requestedUrl
    || "",
  ).trim();

  if (scraperId && sourceUrl) {
    return {
      kind: "scraper.details",
      scraperId,
      sourceUrl,
      title: item.metadata.title,
    };
  }

  if (!window.api || typeof window.api.getMangas !== "function") {
    return null;
  }

  const mangas: Manga[] = await window.api.getMangas();
  const manga = Array.isArray(mangas)
    ? mangas.find((candidate) => String(candidate.id) === String(sourceTarget.mangaId)) ?? null
    : null;
  const libraryScraperId = String(manga?.scraperId ?? "").trim();
  const librarySourceUrl = String(manga?.sourceUrl ?? "").trim();

  if (!libraryScraperId || !librarySourceUrl) {
    return null;
  }

  return {
    kind: "scraper.details",
    scraperId: libraryScraperId,
    sourceUrl: librarySourceUrl,
    title: manga?.title || item.metadata.title,
  };
};
