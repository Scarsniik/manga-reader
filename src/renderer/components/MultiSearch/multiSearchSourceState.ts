import type { ScraperReaderProgressRecord } from "@/shared/scraper";
import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import type { Manga } from "@/renderer/types";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import type { MultiSearchReadingStatusFilter } from "@/renderer/components/MultiSearch/types";
import { getScraperBookmarkKey } from "@/renderer/stores/scraperBookmarks";
import { findMangaLinkedToSource } from "@/renderer/utils/mangaSource";
import { createScraperMangaId } from "@/renderer/utils/scraperRuntime";

export type MultiSearchReadingStatus = "inProgress" | "completed";

export type MultiSearchSourceProgress = {
  status: MultiSearchReadingStatus;
  currentPage: number;
  totalPages: number | null;
  percent: number | null;
  label: string;
  shortLabel: string;
  updatedAt?: string;
};

export type MultiSearchSourceAvailability = {
  inLibrary: boolean;
  inBookmarks: boolean;
  progress: MultiSearchSourceProgress | null;
};

export type MultiSearchProgressIndex = {
  recordsById: Map<string, ScraperReaderProgressRecord>;
  recordsBySourceKey: Map<string, ScraperReaderProgressRecord[]>;
};

type SourceAvailabilityOptions = {
  source: MultiSearchSourceResult;
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  progressIndex: MultiSearchProgressIndex;
};

const toPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const buildProgressSourceKey = (
  scraperId: string,
  sourceUrl: string | null | undefined,
): string => {
  const normalizedScraperId = String(scraperId ?? "").trim();
  const normalizedSourceUrl = normalizeScraperViewHistorySourceUrl(sourceUrl);

  return normalizedScraperId && normalizedSourceUrl
    ? `${normalizedScraperId}::${normalizedSourceUrl}`
    : "";
};

const getProgressStatus = (
  currentPage: number | null,
  totalPages: number | null,
): MultiSearchReadingStatus | null => {
  if (currentPage === null) {
    return null;
  }

  if (totalPages !== null && currentPage >= totalPages) {
    return "completed";
  }

  return currentPage > 1 ? "inProgress" : null;
};

const buildProgress = (
  currentPageValue: unknown,
  totalPagesValue: unknown,
  updatedAt?: string,
): MultiSearchSourceProgress | null => {
  const currentPage = toPositiveInteger(currentPageValue);
  const totalPages = toPositiveInteger(totalPagesValue);
  const status = getProgressStatus(currentPage, totalPages);

  if (!status || currentPage === null) {
    return null;
  }

  const percent = totalPages === null
    ? null
    : Math.max(0, Math.min(100, Math.round((currentPage / totalPages) * 100)));
  const pageLabel = totalPages === null
    ? `page ${currentPage}`
    : `${Math.min(currentPage, totalPages)}/${totalPages}`;

  return {
    status,
    currentPage,
    totalPages,
    percent,
    label: status === "completed" ? `Termine ${pageLabel}` : `En cours ${pageLabel}`,
    shortLabel: status === "completed" ? "Termine" : pageLabel,
    updatedAt,
  };
};

const compareProgress = (
  left: MultiSearchSourceProgress,
  right: MultiSearchSourceProgress,
): number => {
  const leftDate = Date.parse(left.updatedAt || "");
  const rightDate = Date.parse(right.updatedAt || "");
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate) && leftDate !== rightDate) {
    return leftDate - rightDate;
  }

  const leftPercent = left.percent ?? left.currentPage;
  const rightPercent = right.percent ?? right.currentPage;
  if (leftPercent !== rightPercent) {
    return leftPercent - rightPercent;
  }

  const statusScore = (status: MultiSearchReadingStatus) => (status === "completed" ? 1 : 0);
  return statusScore(left.status) - statusScore(right.status);
};

const getLatestProgress = (
  records: ScraperReaderProgressRecord[],
): MultiSearchSourceProgress | null => {
  const progressRecords = records
    .map((record) => buildProgress(record.currentPage, record.totalPages, record.updatedAt))
    .filter((progress): progress is MultiSearchSourceProgress => Boolean(progress))
    .sort(compareProgress);

  return progressRecords[progressRecords.length - 1] ?? null;
};

const getSourceReaderProgress = (
  source: MultiSearchSourceResult,
  progressIndex: MultiSearchProgressIndex,
): MultiSearchSourceProgress | null => {
  const sourceUrl = source.result.detailUrl || "";
  if (!sourceUrl) {
    return null;
  }

  const standaloneProgress = progressIndex.recordsById.get(createScraperMangaId(source.scraper.id, sourceUrl));
  const standaloneDisplay = standaloneProgress
    ? buildProgress(standaloneProgress.currentPage, standaloneProgress.totalPages, standaloneProgress.updatedAt)
    : null;
  if (standaloneDisplay) {
    return standaloneDisplay;
  }

  const sourceProgressRecords = progressIndex.recordsBySourceKey.get(
    buildProgressSourceKey(source.scraper.id, sourceUrl),
  ) ?? [];

  return getLatestProgress(sourceProgressRecords);
};

export const buildMultiSearchProgressIndex = (
  records: ScraperReaderProgressRecord[],
): MultiSearchProgressIndex => {
  const recordsById = new Map<string, ScraperReaderProgressRecord>();
  const recordsBySourceKey = new Map<string, ScraperReaderProgressRecord[]>();

  records.forEach((record) => {
    recordsById.set(record.id, record);

    const sourceKey = buildProgressSourceKey(record.scraperId, record.sourceUrl);
    if (!sourceKey) {
      return;
    }

    const sourceRecords = recordsBySourceKey.get(sourceKey) ?? [];
    sourceRecords.push(record);
    recordsBySourceKey.set(sourceKey, sourceRecords);
  });

  return {
    recordsById,
    recordsBySourceKey,
  };
};

export const getMultiSearchSourceAvailability = ({
  source,
  libraryMangas,
  bookmarkedSourceKeys,
  progressIndex,
}: SourceAvailabilityOptions): MultiSearchSourceAvailability => {
  const sourceUrl = source.result.detailUrl || "";
  const linkedManga = sourceUrl
    ? findMangaLinkedToSource(libraryMangas, {
      scraperId: source.scraper.id,
      sourceUrl,
    })
    : null;
  const bookmarkKey = getScraperBookmarkKey(source.scraper.id, sourceUrl);
  const libraryProgress = linkedManga
    ? buildProgress(linkedManga.currentPage, linkedManga.pages)
    : null;

  return {
    inLibrary: Boolean(linkedManga),
    inBookmarks: Boolean(bookmarkKey && bookmarkedSourceKeys.has(bookmarkKey)),
    progress: libraryProgress ?? getSourceReaderProgress(source, progressIndex),
  };
};

export const getMultiSearchAvailabilityReadingStatus = (
  availability: MultiSearchSourceAvailability,
): MultiSearchReadingStatusFilter => {
  if (availability.progress?.status === "completed") {
    return "read";
  }

  if (availability.progress?.status === "inProgress") {
    return "inProgress";
  }

  return "unread";
};

export const pickPrimarySourceProgress = (
  availabilities: MultiSearchSourceAvailability[],
): MultiSearchSourceProgress | null => {
  const progressRecords = availabilities
    .map((availability) => availability.progress)
    .filter((progress): progress is MultiSearchSourceProgress => Boolean(progress))
    .sort(compareProgress);

  return progressRecords[progressRecords.length - 1] ?? null;
};
