import {
  buildDetailsHistoryRecordId,
  buildReadingHistoryRecordId,
  buildSearchHistoryRecordId,
  normalizeHistoryText,
  normalizeHistoryUrl,
  type AppHistoryRecords,
  type DetailsHistoryRecord,
  type ReadingHistoryRecord,
  type SearchHistoryRecord,
  type SearchHistorySettings,
  type SearchHistorySettingValue,
} from "./history";

const HISTORY_MAX_RECORDS_PER_TAB = 5000;

type ReadingHistoryInput = {
  id?: unknown;
  sourceKind?: unknown;
  title?: unknown;
  cover?: unknown;
  mangaId?: unknown;
  scraperId?: unknown;
  sourceUrl?: unknown;
  readerProgressId?: unknown;
  chapterUrl?: unknown;
  chapterLabel?: unknown;
  currentPage?: unknown;
  totalPages?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type DetailsHistoryInput = {
  id?: unknown;
  scraperId?: unknown;
  sourceUrl?: unknown;
  title?: unknown;
  cover?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type SearchHistoryInput = {
  id?: unknown;
  sourceKind?: unknown;
  query?: unknown;
  scraperId?: unknown;
  scraperName?: unknown;
  settings?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const normalizeIsoDate = (value: unknown, fallback: string): string => {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return fallback;
  }

  const timestamp = Date.parse(rawValue);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
};

const normalizeOptionalPage = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
};

const sortByUpdatedAtDesc = <T extends { id: string; updatedAt: string }>(records: T[]): T[] => (
  [...records].sort((left, right) => {
    const dateCompare = Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || "");
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return left.id.localeCompare(right.id);
  })
);

export const trimHistoryTab = <T extends { id: string; updatedAt: string }>(records: T[]): T[] => (
  sortByUpdatedAtDesc(records).slice(0, HISTORY_MAX_RECORDS_PER_TAB)
);

export const sanitizeReadingHistoryRecord = (
  record: ReadingHistoryInput,
): ReadingHistoryRecord | null => {
  const sourceKind = record.sourceKind === "scraper" ? "scraper" : "library";
  const title = normalizeHistoryText(record.title);
  const cover = normalizeHistoryUrl(record.cover);
  const mangaId = normalizeHistoryText(record.mangaId);
  const scraperId = normalizeHistoryText(record.scraperId);
  const sourceUrl = normalizeHistoryUrl(record.sourceUrl);
  const readerProgressId = normalizeHistoryText(record.readerProgressId);
  const chapterUrl = normalizeHistoryUrl(record.chapterUrl);
  const chapterLabel = normalizeHistoryText(record.chapterLabel);

  if (!title) {
    return null;
  }

  if (sourceKind === "library" && !mangaId) {
    return null;
  }

  if (sourceKind === "scraper" && (!scraperId || !sourceUrl)) {
    return null;
  }

  const id = normalizeHistoryText(record.id) || buildReadingHistoryRecordId({
    sourceKind,
    mangaId,
    scraperId,
    sourceUrl,
    readerProgressId,
    chapterUrl,
  });
  if (!id) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeIsoDate(record.createdAt, now);
  const updatedAt = normalizeIsoDate(record.updatedAt, createdAt);

  return {
    id,
    sourceKind,
    title,
    cover: cover || undefined,
    mangaId: mangaId || undefined,
    scraperId: scraperId || undefined,
    sourceUrl: sourceUrl || undefined,
    readerProgressId: readerProgressId || undefined,
    chapterUrl: chapterUrl || undefined,
    chapterLabel: chapterLabel || undefined,
    currentPage: normalizeOptionalPage(record.currentPage),
    totalPages: normalizeOptionalPage(record.totalPages),
    createdAt,
    updatedAt,
  };
};

export const sanitizeDetailsHistoryRecord = (
  record: DetailsHistoryInput,
): DetailsHistoryRecord | null => {
  const scraperId = normalizeHistoryText(record.scraperId);
  const sourceUrl = normalizeHistoryUrl(record.sourceUrl);
  const title = normalizeHistoryText(record.title);
  const cover = normalizeHistoryUrl(record.cover);

  if (!scraperId || !sourceUrl || !title) {
    return null;
  }

  const id = normalizeHistoryText(record.id) || buildDetailsHistoryRecordId({
    scraperId,
    sourceUrl,
  });
  if (!id) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeIsoDate(record.createdAt, now);
  const updatedAt = normalizeIsoDate(record.updatedAt, createdAt);

  return {
    id,
    scraperId,
    sourceUrl,
    title,
    cover: cover || undefined,
    createdAt,
    updatedAt,
  };
};

const sanitizeSearchSettingValue = (value: unknown): SearchHistorySettingValue | undefined => {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return normalizeHistoryText(value);
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => normalizeHistoryText(entry))
      .filter(Boolean);
    return entries.length ? entries : undefined;
  }

  return undefined;
};

const sanitizeSearchSettings = (value: unknown): SearchHistorySettings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<SearchHistorySettings>((settings, entry) => {
    const [key, rawValue] = entry;
    const normalizedKey = normalizeHistoryText(key);
    const normalizedValue = sanitizeSearchSettingValue(rawValue);

    if (!normalizedKey || normalizedValue === undefined) {
      return settings;
    }

    settings[normalizedKey] = normalizedValue;
    return settings;
  }, {});
};

export const sanitizeSearchHistoryRecord = (
  record: SearchHistoryInput,
): SearchHistoryRecord | null => {
  const sourceKind = record.sourceKind === "scraper" ? "scraper" : "multiSource";
  const query = normalizeHistoryText(record.query);
  const scraperId = normalizeHistoryText(record.scraperId);
  const scraperName = normalizeHistoryText(record.scraperName);
  const settings = sanitizeSearchSettings(record.settings);

  if (!query || (sourceKind === "scraper" && !scraperId)) {
    return null;
  }

  const id = normalizeHistoryText(record.id) || buildSearchHistoryRecordId({
    sourceKind,
    query,
    scraperId,
    settings,
  });
  if (!id) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeIsoDate(record.createdAt, now);
  const updatedAt = normalizeIsoDate(record.updatedAt, createdAt);

  return {
    id,
    sourceKind,
    query,
    scraperId: sourceKind === "scraper" ? scraperId : undefined,
    scraperName: sourceKind === "scraper" && scraperName ? scraperName : undefined,
    settings: sourceKind === "multiSource" ? settings : undefined,
    createdAt,
    updatedAt,
  };
};

export const sanitizeHistoryRecords = (input: unknown): AppHistoryRecords => {
  const raw = input && typeof input === "object" ? input as Partial<AppHistoryRecords> : {};
  const reading = Array.isArray(raw.reading)
    ? raw.reading
      .map((record) => sanitizeReadingHistoryRecord(record))
      .filter((record): record is ReadingHistoryRecord => Boolean(record))
    : [];
  const details = Array.isArray(raw.details)
    ? raw.details
      .map((record) => sanitizeDetailsHistoryRecord(record))
      .filter((record): record is DetailsHistoryRecord => Boolean(record))
    : [];
  const searches = Array.isArray(raw.searches)
    ? raw.searches
      .map((record) => sanitizeSearchHistoryRecord(record))
      .filter((record): record is SearchHistoryRecord => Boolean(record))
    : [];

  return {
    reading: trimHistoryTab(reading),
    details: trimHistoryTab(details),
    searches: trimHistoryTab(searches),
  };
};
