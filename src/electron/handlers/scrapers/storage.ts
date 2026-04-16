import { promises as fs } from "fs";
import {
  createDefaultScraperFeatures,
  type ScraperBookmarkRecord,
  type ScraperFeatureDefinition,
  type ScraperReaderProgressRecord,
  type ScraperRecord,
  type ScraperViewHistoryRecord,
} from "../../scraper";
import {
  ensureDataDir,
  scraperBookmarksFilePath,
  scraperReaderProgressFilePath,
  scraperViewHistoryFilePath,
  scrapersFilePath,
} from "../../utils";
import {
  sanitizeAccessValidation,
  sanitizeFeatureValidation,
  sanitizeGlobalConfig,
  sanitizeScraperBookmarkRecord,
  sanitizeScraperReaderProgressRecord,
  sanitizeScraperViewHistoryRecord,
} from "./shared";

const toPersistedScraperRecord = (scraper: ScraperRecord) => ({
  id: scraper.id,
  kind: scraper.kind,
  name: scraper.name,
  baseUrl: scraper.baseUrl,
  description: scraper.description ?? "",
  status: scraper.status,
  createdAt: scraper.createdAt,
  updatedAt: scraper.updatedAt,
  validation: sanitizeAccessValidation(scraper.validation),
  globalConfig: sanitizeGlobalConfig(scraper.globalConfig),
  features: scraper.features.map((feature) => ({
    kind: feature.kind,
    status: feature.status,
    config: feature.config ?? null,
    validation: sanitizeFeatureValidation(feature.validation),
  })),
});

export const hydrateScraperFeatures = (
  features: Partial<ScraperFeatureDefinition>[] | undefined,
): ScraperFeatureDefinition[] => {
  const defaults = createDefaultScraperFeatures();

  return defaults.map((feature) => {
    const existing = features?.find((candidate) => {
      const candidateKind = String(candidate.kind) === "images" ? "pages" : candidate.kind;
      return candidateKind === feature.kind;
    });

    return {
      ...feature,
      ...existing,
      kind: feature.kind,
      status: existing?.status ?? feature.status,
      config: existing?.config ?? null,
      validation: sanitizeFeatureValidation(existing?.validation) ?? null,
    };
  });
};

export async function readScrapersFile(): Promise<ScraperRecord[]> {
  try {
    const data = await fs.readFile(scrapersFilePath, "utf-8");
    const parsed = JSON.parse(data) as ScraperRecord[];
    const hydrated = parsed.map((scraper) => ({
      ...scraper,
      validation: sanitizeAccessValidation(scraper.validation),
      globalConfig: sanitizeGlobalConfig(scraper.globalConfig),
      features: hydrateScraperFeatures(scraper.features),
    }));

    const normalizedRaw = JSON.stringify(parsed, null, 2);
    const normalizedSanitized = JSON.stringify(
      hydrated.map((scraper) => toPersistedScraperRecord(scraper)),
      null,
      2,
    );

    if (normalizedRaw !== normalizedSanitized) {
      await ensureDataDir();
      await fs.writeFile(scrapersFilePath, normalizedSanitized);
    }

    return hydrated;
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      await ensureDataDir();
      await fs.writeFile(scrapersFilePath, JSON.stringify([], null, 2));
      return [];
    }

    console.error("Error reading scrapers file:", error);
    throw new Error("Failed to read scrapers");
  }
}

export async function writeScrapersFile(scrapers: ScraperRecord[]): Promise<void> {
  await ensureDataDir();
  const persisted = scrapers.map((scraper) => toPersistedScraperRecord(scraper));
  await fs.writeFile(scrapersFilePath, JSON.stringify(persisted, null, 2));
}

const sortScraperBookmarks = (records: ScraperBookmarkRecord[]): ScraperBookmarkRecord[] => (
  [...records].sort((left, right) => {
    const updatedAtCompare = right.updatedAt.localeCompare(left.updatedAt);
    if (updatedAtCompare !== 0) {
      return updatedAtCompare;
    }

    const scraperCompare = left.scraperId.localeCompare(right.scraperId);
    if (scraperCompare !== 0) {
      return scraperCompare;
    }

    return left.title.localeCompare(right.title);
  })
);

export async function readScraperBookmarksFile(): Promise<ScraperBookmarkRecord[]> {
  try {
    const data = await fs.readFile(scraperBookmarksFilePath, "utf-8");
    const parsed = JSON.parse(data) as Partial<ScraperBookmarkRecord>[];
    const sanitized = Array.isArray(parsed)
      ? parsed
        .map((record) => sanitizeScraperBookmarkRecord(record))
        .filter((record): record is ScraperBookmarkRecord => Boolean(record))
      : [];
    const sorted = sortScraperBookmarks(sanitized);

    const normalizedRaw = JSON.stringify(parsed, null, 2);
    const normalizedSanitized = JSON.stringify(sorted, null, 2);
    if (normalizedRaw !== normalizedSanitized) {
      await ensureDataDir();
      await fs.writeFile(scraperBookmarksFilePath, normalizedSanitized);
    }

    return sorted;
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      await ensureDataDir();
      await fs.writeFile(scraperBookmarksFilePath, JSON.stringify([], null, 2));
      return [];
    }

    console.error("Error reading scraper bookmarks file:", error);
    throw new Error("Failed to read scraper bookmarks");
  }
}

export async function writeScraperBookmarksFile(records: ScraperBookmarkRecord[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(scraperBookmarksFilePath, JSON.stringify(sortScraperBookmarks(records), null, 2));
}

export async function readScraperReaderProgressFile(): Promise<ScraperReaderProgressRecord[]> {
  try {
    const data = await fs.readFile(scraperReaderProgressFilePath, "utf-8");
    const parsed = JSON.parse(data) as Partial<ScraperReaderProgressRecord>[];
    const sanitized = Array.isArray(parsed)
      ? parsed
        .map((record) => sanitizeScraperReaderProgressRecord(record))
        .filter((record): record is ScraperReaderProgressRecord => Boolean(record))
      : [];

    const normalizedRaw = JSON.stringify(parsed, null, 2);
    const normalizedSanitized = JSON.stringify(sanitized, null, 2);
    if (normalizedRaw !== normalizedSanitized) {
      await ensureDataDir();
      await fs.writeFile(scraperReaderProgressFilePath, normalizedSanitized);
    }

    return sanitized;
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      await ensureDataDir();
      await fs.writeFile(scraperReaderProgressFilePath, JSON.stringify([], null, 2));
      return [];
    }

    console.error("Error reading scraper reader progress file:", error);
    throw new Error("Failed to read scraper reader progress");
  }
}

export async function writeScraperReaderProgressFile(
  records: ScraperReaderProgressRecord[],
): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(scraperReaderProgressFilePath, JSON.stringify(records, null, 2));
}

const SCRAPER_VIEW_HISTORY_MAX_RECORDS = 5000;
const SCRAPER_VIEW_HISTORY_SEEN_RETENTION_DAYS = 45;
const SCRAPER_VIEW_HISTORY_READ_RETENTION_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const getScraperViewHistoryActivityTime = (record: ScraperViewHistoryRecord): number => {
  const candidates = [
    record.readAt,
    record.firstSeenAt,
  ]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));

  return candidates.length ? Math.max(...candidates) : 0;
};

const sortScraperViewHistory = (records: ScraperViewHistoryRecord[]): ScraperViewHistoryRecord[] => (
  [...records].sort((left, right) => {
    const activityCompare = getScraperViewHistoryActivityTime(right) - getScraperViewHistoryActivityTime(left);
    if (activityCompare !== 0) {
      return activityCompare;
    }

    const scraperCompare = left.scraperId.localeCompare(right.scraperId);
    if (scraperCompare !== 0) {
      return scraperCompare;
    }

    return left.id.localeCompare(right.id);
  })
);

const pruneScraperViewHistory = (
  records: ScraperViewHistoryRecord[],
  now = new Date(),
): ScraperViewHistoryRecord[] => {
  const nowTime = now.getTime();
  const seenCutoff = nowTime - (SCRAPER_VIEW_HISTORY_SEEN_RETENTION_DAYS * DAY_MS);
  const readCutoff = nowTime - (SCRAPER_VIEW_HISTORY_READ_RETENTION_DAYS * DAY_MS);
  const freshRecords = records.filter((record) => {
    const activityTime = getScraperViewHistoryActivityTime(record);
    if (!activityTime) {
      return false;
    }

    return activityTime >= (record.readAt ? readCutoff : seenCutoff);
  });

  const sorted = sortScraperViewHistory(freshRecords);
  if (sorted.length <= SCRAPER_VIEW_HISTORY_MAX_RECORDS) {
    return sorted;
  }

  const readRecords = sorted.filter((record) => record.readAt);
  const seenRecords = sorted.filter((record) => !record.readAt);

  return sortScraperViewHistory([
    ...readRecords,
    ...seenRecords,
  ].slice(0, SCRAPER_VIEW_HISTORY_MAX_RECORDS));
};

const parseScraperViewHistoryFileData = (
  data: string,
): { parsed: unknown; repaired: boolean } => {
  try {
    return {
      parsed: JSON.parse(data),
      repaired: false,
    };
  } catch (error) {
    const originalError = error;
    let candidate = data.trim();

    for (let attempt = 0; attempt < 3 && candidate.endsWith("]"); attempt += 1) {
      candidate = candidate.slice(0, -1).trimEnd();

      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) {
          return {
            parsed,
            repaired: true,
          };
        }
      } catch {
        // Keep trying only trailing bracket repairs, then rethrow the original parse error.
      }
    }

    throw originalError;
  }
};

export async function readScraperViewHistoryFile(): Promise<ScraperViewHistoryRecord[]> {
  try {
    const data = await fs.readFile(scraperViewHistoryFilePath, "utf-8");
    const { parsed, repaired } = parseScraperViewHistoryFileData(data);
    const sanitized = Array.isArray(parsed)
      ? parsed
        .map((record) => sanitizeScraperViewHistoryRecord(record))
        .filter((record): record is ScraperViewHistoryRecord => Boolean(record))
      : [];
    const pruned = pruneScraperViewHistory(sanitized);

    const normalizedRaw = JSON.stringify(parsed, null, 2);
    const normalizedSanitized = JSON.stringify(pruned, null, 2);
    if (repaired || normalizedRaw !== normalizedSanitized) {
      await ensureDataDir();
      await fs.writeFile(scraperViewHistoryFilePath, normalizedSanitized);
    }

    return pruned;
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      await ensureDataDir();
      await fs.writeFile(scraperViewHistoryFilePath, JSON.stringify([], null, 2));
      return [];
    }

    console.error("Error reading scraper view history file:", error);
    throw new Error("Failed to read scraper view history");
  }
}

export async function writeScraperViewHistoryFile(
  records: ScraperViewHistoryRecord[],
): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(scraperViewHistoryFilePath, JSON.stringify(pruneScraperViewHistory(records), null, 2));
}
