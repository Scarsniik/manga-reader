import type {
  ScraperBookmarkRecord,
  ScraperReaderProgressRecord,
  ScraperRecord,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import type { MultiSearchLanguageFilterModes } from "@/renderer/components/MultiSearch/types";
import {
  getMultiSearchLanguageFilterMode,
  hasActiveMultiSearchLanguageFilter,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import {
  UNKNOWN_MULTI_SEARCH_VALUE,
  getLanguageLabel,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import { createScraperMangaId } from "@/renderer/utils/scraperRuntime";
import {
  buildBookmarkViewHistoryIdentity,
  getScraperViewHistoryRecord,
} from "@/renderer/utils/scraperViewHistory";
import { getScraperBookmarkLanguageCodes } from "@/renderer/utils/scraperBookmarkMetadata";

export type ScraperBookmarkReadingStatus = "read" | "inProgress" | "unread";

export type ScraperBookmarkSortKey =
  | "created-desc"
  | "created-asc"
  | "updated-desc"
  | "title-asc"
  | "title-desc"
  | "page-desc"
  | "page-asc"
  | "scraper-asc";

export type ScraperBookmarkFilterState = {
  query: string;
  languageFilterModes: MultiSearchLanguageFilterModes;
  minPages: string;
  maxPages: string;
  readingStatuses: ScraperBookmarkReadingStatus[];
  sortBy: ScraperBookmarkSortKey;
};

type FilterBookmarksOptions = {
  bookmarks: ScraperBookmarkRecord[];
  scrapersById: Map<string, ScraperRecord>;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  progressRecords: ScraperReaderProgressRecord[];
  filters: ScraperBookmarkFilterState;
};

const READING_STATUS_ORDER: Record<ScraperBookmarkReadingStatus, number> = {
  inProgress: 0,
  unread: 1,
  read: 2,
};

export const DEFAULT_BOOKMARK_FILTERS: ScraperBookmarkFilterState = {
  query: "",
  languageFilterModes: {},
  minPages: "",
  maxPages: "",
  readingStatuses: [],
  sortBy: "created-desc",
};

const normalizeSearchText = (value: unknown): string => (
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
);

const toPositiveNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

export const parseBookmarkPageCount = (value: string | undefined): number | null => {
  const match = String(value ?? "").match(/\d+(?:[\s.,]\d{3})*/);
  if (!match) {
    return null;
  }

  return toPositiveNumber(match[0].replace(/[^\d]/g, ""));
};

const getReaderProgressStatus = (
  currentPageValue: unknown,
  totalPagesValue: unknown,
): ScraperBookmarkReadingStatus => {
  const currentPage = toPositiveNumber(currentPageValue);
  const totalPages = toPositiveNumber(totalPagesValue);

  if (currentPage === null) {
    return "unread";
  }

  if (totalPages !== null && currentPage >= totalPages) {
    return "read";
  }

  if (currentPage > 1 && (totalPages === null || currentPage < totalPages)) {
    return "inProgress";
  }

  return "unread";
};

const buildProgressSourceKey = (scraperId: string, sourceUrl: string | undefined): string => {
  const normalizedScraperId = String(scraperId ?? "").trim();
  const normalizedSourceUrl = normalizeScraperViewHistorySourceUrl(sourceUrl);

  return normalizedScraperId && normalizedSourceUrl
    ? `${normalizedScraperId}::${normalizedSourceUrl}`
    : "";
};

const buildProgressIndex = (records: ScraperReaderProgressRecord[]) => {
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

const getBookmarkReadingStatusFromIndex = (
  bookmark: ScraperBookmarkRecord,
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>,
  progressIndex: ReturnType<typeof buildProgressIndex>,
): ScraperBookmarkReadingStatus => {
  const viewHistoryRecord = getScraperViewHistoryRecord(
    viewHistoryRecordsById,
    buildBookmarkViewHistoryIdentity(bookmark),
  );

  if (viewHistoryRecord?.readAt) {
    return "read";
  }

  const standaloneProgress = progressIndex.recordsById.get(createScraperMangaId(
    bookmark.scraperId,
    bookmark.sourceUrl,
  ));

  if (standaloneProgress) {
    const standaloneStatus = getReaderProgressStatus(standaloneProgress.currentPage, standaloneProgress.totalPages);
    if (standaloneStatus !== "unread") {
      return standaloneStatus;
    }
  }

  const sourceProgressRecords = progressIndex.recordsBySourceKey.get(
    buildProgressSourceKey(bookmark.scraperId, bookmark.sourceUrl),
  ) ?? [];
  const hasStartedSourceProgress = sourceProgressRecords.some((record) => (
    getReaderProgressStatus(record.currentPage, record.totalPages) !== "unread"
  ));

  return hasStartedSourceProgress ? "inProgress" : "unread";
};

export const getBookmarkReadingStatus = (
  bookmark: ScraperBookmarkRecord,
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>,
  progressRecords: ScraperReaderProgressRecord[],
): ScraperBookmarkReadingStatus => (
  getBookmarkReadingStatusFromIndex(bookmark, viewHistoryRecordsById, buildProgressIndex(progressRecords))
);

const getBookmarkLanguageValues = (
  bookmark: ScraperBookmarkRecord,
  scraper: ScraperRecord | null | undefined,
): string[] => {
  const languageCodes = getScraperBookmarkLanguageCodes(bookmark, scraper);
  return languageCodes.length ? languageCodes : [UNKNOWN_MULTI_SEARCH_VALUE];
};

const matchesLanguageFilters = (
  bookmark: ScraperBookmarkRecord,
  scraper: ScraperRecord | null | undefined,
  modes: MultiSearchLanguageFilterModes,
): boolean => {
  if (!hasActiveMultiSearchLanguageFilter(modes)) {
    return true;
  }

  const bookmarkLanguages = getBookmarkLanguageValues(bookmark, scraper);
  const onlyLanguages = Object.keys(modes).filter((languageCode) => (
    getMultiSearchLanguageFilterMode(modes, languageCode) === "only"
  ));
  const excludedLanguages = Object.keys(modes).filter((languageCode) => (
    getMultiSearchLanguageFilterMode(modes, languageCode) === "without"
  ));

  if (excludedLanguages.some((languageCode) => bookmarkLanguages.includes(languageCode))) {
    return false;
  }

  if (onlyLanguages.length && !onlyLanguages.some((languageCode) => bookmarkLanguages.includes(languageCode))) {
    return false;
  }

  return true;
};

const matchesQuery = (
  bookmark: ScraperBookmarkRecord,
  scraper: ScraperRecord | null | undefined,
  query: string,
): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeSearchText([
    bookmark.title,
    bookmark.sourceUrl,
    bookmark.summary,
    bookmark.description,
    bookmark.mangaStatus,
    scraper?.name,
    ...(bookmark.authors ?? []),
    ...(bookmark.tags ?? []),
  ].filter(Boolean).join(" "));

  return haystack.includes(normalizedQuery);
};

const compareDates = (left: string | undefined, right: string | undefined): number => (
  Date.parse(left || "") - Date.parse(right || "")
);

const comparePageCounts = (left: ScraperBookmarkRecord, right: ScraperBookmarkRecord): number => {
  const leftPages = parseBookmarkPageCount(left.pageCount);
  const rightPages = parseBookmarkPageCount(right.pageCount);

  if (leftPages === null && rightPages === null) {
    return 0;
  }

  if (leftPages === null) {
    return 1;
  }

  if (rightPages === null) {
    return -1;
  }

  return leftPages - rightPages;
};

const getTieBreaker = (
  left: ScraperBookmarkRecord,
  right: ScraperBookmarkRecord,
): number => (
  left.title.localeCompare(right.title)
  || left.sourceUrl.localeCompare(right.sourceUrl)
  || left.scraperId.localeCompare(right.scraperId)
);

export const filterAndSortScraperBookmarks = ({
  bookmarks,
  scrapersById,
  viewHistoryRecordsById,
  progressRecords,
  filters,
}: FilterBookmarksOptions): ScraperBookmarkRecord[] => {
  const minPages = toPositiveNumber(filters.minPages);
  const maxPages = toPositiveNumber(filters.maxPages);
  const selectedStatuses = new Set(filters.readingStatuses);
  const progressIndex = buildProgressIndex(progressRecords);
  const getStatus = (bookmark: ScraperBookmarkRecord) => (
    getBookmarkReadingStatusFromIndex(bookmark, viewHistoryRecordsById, progressIndex)
  );

  const filtered = bookmarks.filter((bookmark) => {
    const scraper = scrapersById.get(bookmark.scraperId) ?? null;

    if (!matchesQuery(bookmark, scraper, filters.query)) {
      return false;
    }

    if (!matchesLanguageFilters(bookmark, scraper, filters.languageFilterModes)) {
      return false;
    }

    const pageCount = parseBookmarkPageCount(bookmark.pageCount);
    if (minPages !== null && (pageCount === null || pageCount < minPages)) {
      return false;
    }

    if (maxPages !== null && (pageCount === null || pageCount > maxPages)) {
      return false;
    }

    if (selectedStatuses.size) {
      const readingStatus = getStatus(bookmark);
      if (!selectedStatuses.has(readingStatus)) {
        return false;
      }
    }

    return true;
  });

  return filtered.slice().sort((left, right) => {
    let compare = 0;

    switch (filters.sortBy) {
      case "created-asc":
        compare = compareDates(left.createdAt, right.createdAt);
        break;
      case "updated-desc":
        compare = compareDates(right.updatedAt, left.updatedAt);
        break;
      case "title-asc":
        compare = left.title.localeCompare(right.title);
        break;
      case "title-desc":
        compare = right.title.localeCompare(left.title);
        break;
      case "page-desc":
        compare = comparePageCounts(right, left);
        break;
      case "page-asc":
        compare = comparePageCounts(left, right);
        break;
      case "scraper-asc":
        compare = (scrapersById.get(left.scraperId)?.name ?? left.scraperId)
          .localeCompare(scrapersById.get(right.scraperId)?.name ?? right.scraperId);
        break;
      case "created-desc":
      default:
        compare = compareDates(right.createdAt, left.createdAt);
        break;
    }

    if (compare !== 0) {
      return compare;
    }

    if (filters.sortBy === "scraper-asc") {
      return getTieBreaker(left, right);
    }

    const leftStatus = getStatus(left);
    const rightStatus = getStatus(right);
    const statusCompare = READING_STATUS_ORDER[leftStatus] - READING_STATUS_ORDER[rightStatus];

    return statusCompare || getTieBreaker(left, right);
  });
};

export const buildBookmarkLanguageFilterCodes = (
  bookmarks: ScraperBookmarkRecord[],
  scrapersById: Map<string, ScraperRecord>,
): string[] => {
  const seen = new Set<string>();

  bookmarks.forEach((bookmark) => {
    getBookmarkLanguageValues(bookmark, scrapersById.get(bookmark.scraperId)).forEach((languageCode) => {
      seen.add(languageCode);
    });
  });

  return Array.from(seen)
    .sort((left, right) => getLanguageLabel(left).localeCompare(getLanguageLabel(right)));
};
