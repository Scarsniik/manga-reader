import { promises as fs } from "fs";
import path from "path";
import type {
  AddScraperTagListCacheItemsRequest,
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

let scraperTagListCacheQueue: Promise<void> = Promise.resolve();

const runScraperTagListCacheOperation = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  const previousOperation = scraperTagListCacheQueue;
  let releaseOperation: () => void = () => undefined;

  scraperTagListCacheQueue = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });

  await previousOperation.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseOperation();
  }
};

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

const getTagListItemKeys = (item: ScraperTagListItem): string[] => (
  Array.from(new Set(
    [item.url, item.name]
      .map((value) => normalizeText(value).toLowerCase())
      .filter(Boolean),
  ))
);

const getPrimaryTagListItemKey = (item: ScraperTagListItem): string => (
  normalizeText(item.url || item.name).toLowerCase()
);

const mergeTagListItems = (items: ScraperTagListItem[]): ScraperTagListItem[] => {
  const tagsByCanonicalKey = new Map<string, ScraperTagListItem>();
  const canonicalKeysByLookupKey = new Map<string, string>();

  items.forEach((item) => {
    const itemKeys = getTagListItemKeys(item);
    const existingCanonicalKey = itemKeys
      .map((key) => canonicalKeysByLookupKey.get(key))
      .find((key): key is string => Boolean(key));
    const canonicalKey = existingCanonicalKey || getPrimaryTagListItemKey(item);
    if (!canonicalKey) {
      return;
    }

    const existing = tagsByCanonicalKey.get(canonicalKey);
    const mergedItem: ScraperTagListItem = existing
      ? {
        name: existing.name || item.name,
        url: existing.url || item.url,
        count: existing.count || item.count,
      }
      : item;

    tagsByCanonicalKey.set(canonicalKey, mergedItem);
    getTagListItemKeys(mergedItem).forEach((key) => {
      canonicalKeysByLookupKey.set(key, canonicalKey);
    });
  });

  return Array.from(tagsByCanonicalKey.values());
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
    ? sortTagListItems(mergeTagListItems(
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

const readScraperTagListCacheRecord = async (
  normalizedScraperId: string,
): Promise<ScraperTagListCacheRecord | null> => {
  const data = await fs.readFile(getCacheFilePath(normalizedScraperId), "utf-8");
  const parsed = JSON.parse(data) as Partial<ScraperTagListCacheRecord>;
  const sanitized = sanitizeTagListCacheRecord(parsed, normalizedScraperId);

  if (sanitized && JSON.stringify(parsed, null, 2) !== JSON.stringify(sanitized, null, 2)) {
    await ensureScraperTagListCacheDir();
    await fs.writeFile(getCacheFilePath(normalizedScraperId), JSON.stringify(sanitized, null, 2));
  }

  return sanitized;
};

export async function getScraperTagListCache(scraperId: string): Promise<ScraperTagListCacheRecord | null> {
  const normalizedScraperId = normalizeText(scraperId);
  if (!normalizedScraperId) {
    return null;
  }

  try {
    return await readScraperTagListCacheRecord(normalizedScraperId);
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
  return runScraperTagListCacheOperation(async () => {
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
  });
}

export async function addScraperTagListCacheItems(
  request: AddScraperTagListCacheItemsRequest,
): Promise<ScraperTagListCacheRecord> {
  return runScraperTagListCacheOperation(async () => {
    const normalizedScraperId = normalizeText(request.scraperId);
    if (!normalizedScraperId) {
      throw new Error("Scraper introuvable.");
    }

    const incomingTags = Array.isArray(request.tags)
      ? request.tags
        .map((item) => sanitizeTagListItem(item))
        .filter((item): item is ScraperTagListItem => Boolean(item))
      : [];

    let existingRecord: ScraperTagListCacheRecord | null = null;
    try {
      existingRecord = await readScraperTagListCacheRecord(normalizedScraperId);
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        console.error("Error reading scraper tag list cache:", error);
        throw new Error("Failed to read scraper tag list cache");
      }
    }

    const existingTags = existingRecord?.tags ?? [];
    const mergedTags = sortTagListItems(mergeTagListItems([...existingTags, ...incomingTags]));
    const sourceUrl = existingRecord?.sourceUrl || normalizeUrl(request.sourceUrl);
    const tagsChanged = JSON.stringify(existingTags) !== JSON.stringify(mergedTags);
    const sourceUrlChanged = Boolean(!existingRecord?.sourceUrl && sourceUrl);

    if (!incomingTags.length && existingRecord) {
      return existingRecord;
    }

    if (existingRecord && !tagsChanged && !sourceUrlChanged) {
      return existingRecord;
    }

    const record: ScraperTagListCacheRecord = {
      scraperId: normalizedScraperId,
      sourceUrl: sourceUrl || undefined,
      tags: mergedTags,
      savedAt: new Date().toISOString(),
    };

    await ensureScraperTagListCacheDir();
    await fs.writeFile(getCacheFilePath(normalizedScraperId), JSON.stringify(record, null, 2));
    return record;
  });
}
