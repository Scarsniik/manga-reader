import type {
  AppHistoryRecords,
  DetailsHistoryRecord,
  ReadingHistoryRecord,
  SearchHistoryRecord,
  SearchHistorySettingValue,
  SearchHistorySettings,
} from "@/shared/history";
import type { ScraperReaderProgressRecord, ScraperRecord } from "@/shared/scraper";
import { normalizeHistoryUrl } from "@/shared/history";
import type { Manga } from "@/renderer/types";

export type HistoryTabId = "reading" | "details" | "searches";

export type HistoryTabDefinition = {
  id: HistoryTabId;
  label: string;
};

export const HISTORY_MULTI_SOURCE_FILTER = "multi-source";

export const HISTORY_TABS: HistoryTabDefinition[] = [
  {
    id: "reading",
    label: "Lecture",
  },
  {
    id: "details",
    label: "Fiches consultees",
  },
  {
    id: "searches",
    label: "Recherches",
  },
];

export type HistoryProgress = {
  currentPage: number;
  totalPages: number | null;
  percent: number | null;
  label: string;
  isCompleted: boolean;
};

export const HISTORY_PAGE_SIZE = 24;

export const EMPTY_HISTORY_RECORDS: AppHistoryRecords = {
  reading: [],
  details: [],
  searches: [],
};

export const toPositiveInteger = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const normalizeSearchText = (value: unknown): string => (
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
);

export const formatHistoryDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const buildProgressSourceKey = (
  scraperId?: string | null,
  sourceUrl?: string | null,
): string => {
  const normalizedScraperId = String(scraperId ?? "").trim();
  const normalizedSourceUrl = normalizeHistoryUrl(sourceUrl);

  return normalizedScraperId && normalizedSourceUrl
    ? `${normalizedScraperId}::${normalizedSourceUrl}`
    : "";
};

export const buildScraperProgressIndexes = (records: ScraperReaderProgressRecord[]) => {
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

const getLatestProgressRecord = (
  records: ScraperReaderProgressRecord[],
): ScraperReaderProgressRecord | null => (
  records
    .filter((record) => toPositiveInteger(record.currentPage) !== null)
    .sort((left, right) => Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""))[0]
  ?? null
);

export const resolveReadingProgressRecord = (
  record: ReadingHistoryRecord,
  progressIndexes: ReturnType<typeof buildScraperProgressIndexes>,
): ScraperReaderProgressRecord | null => {
  if (record.sourceKind !== "scraper") {
    return null;
  }

  if (record.readerProgressId) {
    const directRecord = progressIndexes.recordsById.get(record.readerProgressId) ?? null;
    if (directRecord) {
      return directRecord;
    }
  }

  return getLatestProgressRecord(
    progressIndexes.recordsBySourceKey.get(buildProgressSourceKey(record.scraperId, record.sourceUrl)) ?? [],
  );
};

export const buildProgressDisplay = (
  currentPageValue: unknown,
  totalPagesValue: unknown,
): HistoryProgress | null => {
  const currentPage = toPositiveInteger(currentPageValue);
  const totalPages = toPositiveInteger(totalPagesValue);

  if (currentPage === null) {
    return null;
  }

  const normalizedCurrentPage = totalPages === null
    ? currentPage
    : Math.min(currentPage, totalPages);
  const percent = totalPages === null
    ? null
    : Math.max(0, Math.min(100, Math.round((normalizedCurrentPage / totalPages) * 100)));

  return {
    currentPage: normalizedCurrentPage,
    totalPages,
    percent,
    label: totalPages === null ? `Page ${normalizedCurrentPage}` : `${normalizedCurrentPage}/${totalPages}`,
    isCompleted: totalPages !== null && normalizedCurrentPage >= totalPages,
  };
};

export const getReadingProgress = (
  record: ReadingHistoryRecord,
  mangaById: Map<string, Manga>,
  progressIndexes: ReturnType<typeof buildScraperProgressIndexes>,
): HistoryProgress | null => {
  if (record.sourceKind === "library" && record.mangaId) {
    const manga = mangaById.get(record.mangaId) ?? null;
    return buildProgressDisplay(
      manga?.currentPage ?? record.currentPage,
      manga?.pages ?? record.totalPages,
    );
  }

  const progressRecord = resolveReadingProgressRecord(record, progressIndexes);
  return buildProgressDisplay(
    progressRecord?.currentPage ?? record.currentPage,
    progressRecord?.totalPages ?? record.totalPages,
  );
};

const getScraperName = (
  scraperId: string | null | undefined,
  scrapersById: Map<string, ScraperRecord>,
): string => (
  scraperId ? scrapersById.get(scraperId)?.name || scraperId : ""
);

const formatSearchSettingValue = (value: SearchHistorySettingValue): string => {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "";
  }

  if (typeof value === "boolean") {
    return value ? "Oui" : "Non";
  }

  return String(value ?? "");
};

export const formatSearchSettings = (settings: SearchHistorySettings | undefined): string => (
  Object.entries(settings ?? {})
    .filter(([key]) => !key.startsWith("_"))
    .map(([key, value]) => {
      const formattedValue = formatSearchSettingValue(value);
      return formattedValue ? `${key}: ${formattedValue}` : "";
    })
    .filter(Boolean)
    .join(" · ")
);

export const matchesHistorySearch = (
  record: ReadingHistoryRecord | DetailsHistoryRecord | SearchHistoryRecord,
  scrapersById: Map<string, ScraperRecord>,
  query: string,
): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const scraperId = "scraperId" in record ? record.scraperId : "";
  const haystack = normalizeSearchText([
    "query" in record ? record.query : record.title,
    "sourceUrl" in record ? record.sourceUrl : "",
    getScraperName(scraperId, scrapersById),
    "scraperName" in record ? record.scraperName : "",
    "settings" in record ? formatSearchSettings(record.settings) : "",
    "chapterLabel" in record ? record.chapterLabel : "",
  ].filter(Boolean).join(" "));

  return haystack.includes(normalizedQuery);
};

export const matchesHistoryScraperFilter = (
  record: ReadingHistoryRecord | DetailsHistoryRecord | SearchHistoryRecord,
  scraperFilter: string,
): boolean => {
  if (!scraperFilter) {
    return true;
  }

  if (scraperFilter === "library") {
    return "sourceKind" in record && record.sourceKind === "library";
  }

  if (scraperFilter === HISTORY_MULTI_SOURCE_FILTER) {
    return "sourceKind" in record && record.sourceKind === "multiSource";
  }

  if ("query" in record && record.sourceKind === "multiSource") {
    const scraperIds = record.settings?._scraperIds;
    return Array.isArray(scraperIds) && scraperIds.includes(scraperFilter);
  }

  return "scraperId" in record && record.scraperId === scraperFilter;
};
