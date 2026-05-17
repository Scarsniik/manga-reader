export type HistorySourceKind = "library" | "scraper";

export type ReadingHistoryRecord = {
  id: string;
  sourceKind: HistorySourceKind;
  title: string;
  cover?: string;
  mangaId?: string;
  scraperId?: string;
  sourceUrl?: string;
  readerProgressId?: string;
  chapterUrl?: string;
  chapterLabel?: string;
  currentPage?: number | null;
  totalPages?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DetailsHistoryRecord = {
  id: string;
  scraperId: string;
  sourceUrl: string;
  title: string;
  cover?: string;
  createdAt: string;
  updatedAt: string;
};

export type SearchHistorySourceKind = "multiSource" | "scraper";

export type SearchHistorySettingValue = string | number | boolean | null | string[];

export type SearchHistorySettings = Record<string, SearchHistorySettingValue>;

export type SearchHistoryRecord = {
  id: string;
  sourceKind: SearchHistorySourceKind;
  query: string;
  scraperId?: string;
  scraperName?: string;
  settings?: SearchHistorySettings;
  createdAt: string;
  updatedAt: string;
};

export type AppHistoryRecords = {
  reading: ReadingHistoryRecord[];
  details: DetailsHistoryRecord[];
  searches: SearchHistoryRecord[];
};

export type RecordReadingHistoryRequest = {
  sourceKind: HistorySourceKind;
  title: string;
  cover?: string | null;
  mangaId?: string | null;
  scraperId?: string | null;
  sourceUrl?: string | null;
  readerProgressId?: string | null;
  chapterUrl?: string | null;
  chapterLabel?: string | null;
  currentPage?: number | null;
  totalPages?: number | null;
};

export type RecordDetailsHistoryRequest = {
  scraperId: string;
  sourceUrl: string;
  title: string;
  cover?: string | null;
};

export type RecordSearchHistoryRequest = {
  sourceKind: SearchHistorySourceKind;
  query: string;
  scraperId?: string | null;
  scraperName?: string | null;
  settings?: SearchHistorySettings | null;
};

export const EMPTY_APP_HISTORY: AppHistoryRecords = {
  reading: [],
  details: [],
  searches: [],
};

export const normalizeHistoryText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

export const normalizeHistoryUrl = (value: unknown): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
};

const hashHistoryKey = (value: string): string => {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193);
    right ^= code + index;
    right = Math.imul(right, 0x85ebca6b);
  }

  return `${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
};

const serializeHistoryIdentityValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(serializeHistoryIdentityValue).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entry]) => `${JSON.stringify(key)}:${serializeHistoryIdentityValue(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
};

export const buildReadingHistoryRecordId = (
  request: Pick<
    RecordReadingHistoryRequest,
    "sourceKind" | "mangaId" | "scraperId" | "sourceUrl" | "readerProgressId" | "chapterUrl"
  >,
): string => {
  const sourceKind = request.sourceKind === "scraper" ? "scraper" : "library";
  const mangaId = normalizeHistoryText(request.mangaId);
  const scraperId = normalizeHistoryText(request.scraperId);
  const sourceUrl = normalizeHistoryUrl(request.sourceUrl);
  const readerProgressId = normalizeHistoryText(request.readerProgressId);
  const chapterUrl = normalizeHistoryUrl(request.chapterUrl);

  const identity = sourceKind === "library"
    ? mangaId
    : [
      scraperId,
      readerProgressId || sourceUrl,
      readerProgressId ? "" : chapterUrl,
    ].join("::");

  if (!identity || (sourceKind === "scraper" && !scraperId)) {
    return "";
  }

  return `reading_${hashHistoryKey(`${sourceKind}::${identity}`)}`;
};

export const buildDetailsHistoryRecordId = (
  request: Pick<RecordDetailsHistoryRequest, "scraperId" | "sourceUrl">,
): string => {
  const scraperId = normalizeHistoryText(request.scraperId);
  const sourceUrl = normalizeHistoryUrl(request.sourceUrl);

  if (!scraperId || !sourceUrl) {
    return "";
  }

  return `details_${hashHistoryKey(`${scraperId}::${sourceUrl}`)}`;
};

export const buildSearchHistoryRecordId = (
  request: Pick<RecordSearchHistoryRequest, "sourceKind" | "query" | "scraperId" | "settings">,
): string => {
  const sourceKind = request.sourceKind === "scraper" ? "scraper" : "multiSource";
  const query = normalizeHistoryText(request.query).toLocaleLowerCase();
  const scraperId = normalizeHistoryText(request.scraperId);

  if (!query || (sourceKind === "scraper" && !scraperId)) {
    return "";
  }

  const identity = sourceKind === "scraper"
    ? `${sourceKind}::${scraperId}::${query}`
    : `${sourceKind}::${query}::${serializeHistoryIdentityValue(request.settings ?? {})}`;

  return `search_${hashHistoryKey(identity)}`;
};
