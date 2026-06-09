import { promises as fs } from "fs";
import path from "path";
import type {
  SaveScraperTagListCacheRequest,
  ScraperTagListCacheRecord,
  ScraperTagListItem,
} from "../../scraper";
import {
  ensureScraperTagListCacheDir,
  scraperTagListCacheDir,
} from "../../utils";

const normalizeText = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const normalizeUrl = (value: unknown): string => {
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

const sanitizeCacheFilename = (scraperId: string): string => (
  `${scraperId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`
);

const getCacheFilePath = (scraperId: string): string => (
  path.join(scraperTagListCacheDir, sanitizeCacheFilename(scraperId))
);

const sanitizeTagListItem = (item: Partial<ScraperTagListItem> | null | undefined): ScraperTagListItem | null => {
  if (!item) {
    return null;
  }

  const name = normalizeText(item.name);
  if (!name) {
    return null;
  }

  const url = normalizeUrl(item.url);
  const count = normalizeText(item.count);

  return {
    name,
    url: url || undefined,
    count: count || undefined,
  };
};

const uniqueTagListItems = (items: ScraperTagListItem[]): ScraperTagListItem[] => {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = (item.url || item.name).trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const sortTagListItems = (items: ScraperTagListItem[]): ScraperTagListItem[] => (
  [...items].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
);

const sanitizeTagListCacheRecord = (
  record: Partial<ScraperTagListCacheRecord> | null | undefined,
  fallbackScraperId?: string,
): ScraperTagListCacheRecord | null => {
  if (!record) {
    return null;
  }

  const scraperId = normalizeText(record.scraperId) || normalizeText(fallbackScraperId);
  if (!scraperId) {
    return null;
  }

  const sourceUrl = normalizeUrl(record.sourceUrl);
  const savedAt = normalizeText(record.savedAt);
  const tags = Array.isArray(record.tags)
    ? sortTagListItems(uniqueTagListItems(
      record.tags
        .map((item) => sanitizeTagListItem(item))
        .filter((item): item is ScraperTagListItem => Boolean(item)),
    ))
    : [];

  return {
    scraperId,
    sourceUrl: sourceUrl || undefined,
    tags,
    savedAt: savedAt || new Date().toISOString(),
  };
};

export async function getScraperTagListCache(scraperId: string): Promise<ScraperTagListCacheRecord | null> {
  const normalizedScraperId = normalizeText(scraperId);
  if (!normalizedScraperId) {
    return null;
  }

  try {
    const data = await fs.readFile(getCacheFilePath(normalizedScraperId), "utf-8");
    const parsed = JSON.parse(data) as Partial<ScraperTagListCacheRecord>;
    const sanitized = sanitizeTagListCacheRecord(parsed, normalizedScraperId);

    if (sanitized && JSON.stringify(parsed, null, 2) !== JSON.stringify(sanitized, null, 2)) {
      await ensureScraperTagListCacheDir();
      await fs.writeFile(getCacheFilePath(normalizedScraperId), JSON.stringify(sanitized, null, 2));
    }

    return sanitized;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }

    console.error("Error reading scraper tag list cache:", error);
    throw new Error("Failed to read scraper tag list cache");
  }
}

export async function saveScraperTagListCache(
  request: SaveScraperTagListCacheRequest,
): Promise<ScraperTagListCacheRecord> {
  const normalizedScraperId = normalizeText(request.scraperId);
  if (!normalizedScraperId) {
    throw new Error("Scraper introuvable.");
  }

  const record = sanitizeTagListCacheRecord({
    scraperId: normalizedScraperId,
    sourceUrl: request.sourceUrl,
    tags: request.tags,
    savedAt: new Date().toISOString(),
  });

  if (!record) {
    throw new Error("La liste de tags est invalide.");
  }

  await ensureScraperTagListCacheDir();
  await fs.writeFile(getCacheFilePath(normalizedScraperId), JSON.stringify(record, null, 2));
  return record;
}
