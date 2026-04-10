import { promises as fs } from "fs";
import {
  createDefaultScraperFeatures,
  type ScraperBookmarkRecord,
  type ScraperFeatureDefinition,
  type ScraperReaderProgressRecord,
  type ScraperRecord,
} from "../../scraper";
import {
  ensureDataDir,
  scraperBookmarksFilePath,
  scraperReaderProgressFilePath,
  scrapersFilePath,
} from "../../utils";
import {
  sanitizeAccessValidation,
  sanitizeFeatureValidation,
  sanitizeGlobalConfig,
  sanitizeScraperBookmarkRecord,
  sanitizeScraperReaderProgressRecord,
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
