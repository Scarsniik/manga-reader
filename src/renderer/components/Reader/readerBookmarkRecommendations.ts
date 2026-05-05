import type { Manga, Tag } from "@/renderer/types";
import type {
  ScraperBookmarkRecord,
  ScraperReaderProgressRecord,
  ScraperRecord,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import {
  buildBookmarkViewHistoryIdentity,
  getScraperViewHistoryRecord,
} from "@/renderer/utils/scraperViewHistory";
import { canQueueStandaloneScraperDownload } from "@/renderer/utils/scraperDownload";
import { getScraperBookmarkLanguageCodes } from "@/renderer/utils/scraperBookmarkMetadata";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";
import {
  createScraperMangaId,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime";
import type { EndOfReadingRecommendation } from "@/renderer/components/Reader/endOfReadingRecommendations";

type BuildBookmarkRecommendationMangasOptions = {
  bookmarks: ScraperBookmarkRecord[];
  scrapersById: Map<string, ScraperRecord>;
  tags: Tag[];
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  progressRecords: ScraperReaderProgressRecord[];
  libraryMangas: Manga[];
  currentManga: Manga | null;
};

type BookmarkProgress = {
  currentPage: number | null;
  totalPages: number | null;
};

const normalizeText = (value: unknown): string => (
  String(value ?? "").trim().toLowerCase()
);

const toPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const parseBookmarkPageCount = (value: string | undefined): number | null => {
  const match = String(value ?? "").match(/\d+(?:[\s.,]\d{3})*/);
  if (!match) {
    return null;
  }

  return toPositiveInteger(match[0].replace(/[^\d]/g, ""));
};

const buildSourceKey = (
  scraperId?: string | null,
  sourceUrl?: string | null,
): string => {
  const normalizedScraperId = String(scraperId ?? "").trim();
  const normalizedSourceUrl = normalizeScraperViewHistorySourceUrl(sourceUrl);

  return normalizedScraperId && normalizedSourceUrl
    ? `${normalizedScraperId}::${normalizedSourceUrl}`
    : "";
};

const getLibrarySourceKeys = (libraryMangas: Manga[]): Set<string> => (
  new Set(
    libraryMangas
      .map((manga) => buildSourceKey(manga.scraperId, manga.sourceUrl))
      .filter(Boolean),
  )
);

const buildTagIdByName = (tags: Tag[]): Map<string, string> => (
  new Map(
    tags.map((tag) => [
      normalizeText(tag.name),
      tag.id,
    ]),
  )
);

const getBookmarkTagIds = (
  bookmark: ScraperBookmarkRecord,
  tagIdByName: Map<string, string>,
): string[] => (
  Array.from(new Set(
    (bookmark.tags ?? [])
      .map((tagName) => tagIdByName.get(normalizeText(tagName)))
      .filter((tagId): tagId is string => Boolean(tagId)),
  ))
);

const getLatestProgressRecord = (
  records: ScraperReaderProgressRecord[],
): ScraperReaderProgressRecord | null => (
  records
    .filter((record) => toPositiveInteger(record.currentPage) !== null)
    .sort((left, right) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""))[0]
  ?? null
);

const getBookmarkProgressRecord = (
  bookmark: ScraperBookmarkRecord,
  progressRecords: ScraperReaderProgressRecord[],
): ScraperReaderProgressRecord | null => {
  const standaloneReaderId = createScraperMangaId(bookmark.scraperId, bookmark.sourceUrl);
  const standaloneProgress = progressRecords.find((record) => record.id === standaloneReaderId);
  if (standaloneProgress) {
    return standaloneProgress;
  }

  const bookmarkSourceKey = buildSourceKey(bookmark.scraperId, bookmark.sourceUrl);
  if (!bookmarkSourceKey) {
    return null;
  }

  return getLatestProgressRecord(
    progressRecords.filter((record) => (
      buildSourceKey(record.scraperId, record.sourceUrl) === bookmarkSourceKey
    )),
  );
};

const getBookmarkProgress = (
  bookmark: ScraperBookmarkRecord,
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>,
  progressRecords: ScraperReaderProgressRecord[],
): BookmarkProgress => {
  const pageCount = parseBookmarkPageCount(bookmark.pageCount);
  const viewHistoryRecord = getScraperViewHistoryRecord(
    viewHistoryRecordsById,
    buildBookmarkViewHistoryIdentity(bookmark),
  );

  if (viewHistoryRecord?.readAt) {
    return {
      currentPage: pageCount ?? 1,
      totalPages: pageCount ?? 1,
    };
  }

  const progressRecord = getBookmarkProgressRecord(bookmark, progressRecords);
  if (!progressRecord) {
    return {
      currentPage: null,
      totalPages: pageCount,
    };
  }

  return {
    currentPage: toPositiveInteger(progressRecord.currentPage),
    totalPages: toPositiveInteger(progressRecord.totalPages) ?? pageCount,
  };
};

const getRecommendationLanguage = (
  languageCodes: string[],
  currentLanguage: string,
): string | null => {
  if (currentLanguage && languageCodes.includes(currentLanguage)) {
    return currentLanguage;
  }

  return languageCodes[0] ?? null;
};

export const canOpenStandaloneBookmarkInReader = (
  scraper: ScraperRecord | null | undefined,
): boolean => {
  if (!scraper) {
    return false;
  }

  const detailsFeature = getScraperFeature(scraper, "details");
  const pagesFeature = getScraperFeature(scraper, "pages");

  return isScraperFeatureConfigured(detailsFeature)
    && isScraperFeatureConfigured(pagesFeature)
    && canQueueStandaloneScraperDownload(
      getScraperDetailsFeatureConfig(detailsFeature),
      getScraperPagesFeatureConfig(pagesFeature),
    );
};

export const buildBookmarkRecommendationMangas = ({
  bookmarks,
  scrapersById,
  tags,
  viewHistoryRecordsById,
  progressRecords,
  libraryMangas,
  currentManga,
}: BuildBookmarkRecommendationMangasOptions): EndOfReadingRecommendation[] => {
  const currentLanguage = normalizeText(currentManga?.language);
  if (!currentLanguage) {
    return [];
  }

  const librarySourceKeys = getLibrarySourceKeys(libraryMangas);
  const tagIdByName = buildTagIdByName(tags);

  return bookmarks.reduce<EndOfReadingRecommendation[]>((recommendations, bookmark) => {
    const scraper = scrapersById.get(bookmark.scraperId) ?? null;
    if (!canOpenStandaloneBookmarkInReader(scraper)) {
      return recommendations;
    }

    const bookmarkSourceKey = buildSourceKey(bookmark.scraperId, bookmark.sourceUrl);
    if (!bookmarkSourceKey || librarySourceKeys.has(bookmarkSourceKey)) {
      return recommendations;
    }

    const languageCodes = getScraperBookmarkLanguageCodes(bookmark, scraper);
    if (!languageCodes.includes(currentLanguage)) {
      return recommendations;
    }

    const progress = getBookmarkProgress(bookmark, viewHistoryRecordsById, progressRecords);
    recommendations.push({
      id: createScraperMangaId(bookmark.scraperId, bookmark.sourceUrl),
      title: bookmark.title,
      path: "",
      thumbnailPath: buildRemoteThumbnailUrl(bookmark.cover, bookmark.sourceUrl) || bookmark.cover || null,
      createdAt: bookmark.createdAt || new Date().toISOString(),
      currentPage: progress.currentPage,
      pages: progress.totalPages,
      language: getRecommendationLanguage(languageCodes, currentLanguage),
      authorIds: [],
      tagIds: getBookmarkTagIds(bookmark, tagIdByName),
      seriesId: null,
      chapters: undefined,
      sourceKind: "scraper",
      scraperId: bookmark.scraperId,
      sourceUrl: bookmark.sourceUrl,
      recommendationSource: "bookmark",
      recommendationLanguageCodes: languageCodes,
    });

    return recommendations;
  }, []);
};
