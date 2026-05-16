import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { type IpcMainInvokeEvent } from "electron";
import {
  type RemoveScraperTagFavoriteRequest,
  type RemoveScraperTagFavoriteSourceRequest,
  type SaveScraperTagFavoriteRequest,
  type ScraperTagFavoriteRecord,
  type ScraperTagFavoriteSource,
} from "../../scraper";
import { ensureDataDir, scraperTagFavoritesFilePath } from "../../utils";

type TagFavoritesFileUpdate<T> = {
  records: ScraperTagFavoriteRecord[];
  result: T;
  shouldWrite?: boolean;
};

let tagFavoritesFileQueue: Promise<void> = Promise.resolve();

const runTagFavoritesFileOperation = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  const previousOperation = tagFavoritesFileQueue;
  let releaseOperation: () => void = () => undefined;

  tagFavoritesFileQueue = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });

  await previousOperation.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseOperation();
  }
};

export const normalizeScraperTagFavoriteUrl = (value: unknown): string => {
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

const sanitizeTagFavoriteSource = (
  source: Partial<ScraperTagFavoriteSource> | null | undefined,
): ScraperTagFavoriteSource | null => {
  const scraperId = String(source?.scraperId ?? "").trim();
  const tagUrl = normalizeScraperTagFavoriteUrl(source?.tagUrl);
  const name = String(source?.name ?? "").trim() || tagUrl;
  const cover = String(source?.cover ?? "").trim();
  const now = new Date().toISOString();
  const createdAt = String(source?.createdAt ?? "").trim() || now;
  const updatedAt = String(source?.updatedAt ?? "").trim() || now;

  if (!scraperId || !tagUrl) {
    return null;
  }

  return {
    scraperId,
    tagUrl,
    name,
    cover: cover || undefined,
    createdAt,
    updatedAt,
  };
};

const sanitizeTagFavoriteRecord = (
  record: Partial<ScraperTagFavoriteRecord> | null | undefined,
): ScraperTagFavoriteRecord | null => {
  const id = String(record?.id ?? "").trim();
  const name = String(record?.name ?? "").trim();
  const cover = String(record?.cover ?? "").trim();
  const now = new Date().toISOString();
  const sources = Array.isArray(record?.sources)
    ? record.sources
      .map((source) => sanitizeTagFavoriteSource(source))
      .filter((source): source is ScraperTagFavoriteSource => Boolean(source))
    : [];

  if (!id || !name || !sources.length) {
    return null;
  }

  return {
    id,
    name,
    cover: cover || sources.find((source) => source.cover)?.cover,
    sources,
    createdAt: String(record?.createdAt ?? "").trim() || now,
    updatedAt: String(record?.updatedAt ?? "").trim() || now,
  };
};

const sortTagFavorites = (
  records: ScraperTagFavoriteRecord[],
): ScraperTagFavoriteRecord[] => (
  [...records].sort((left, right) => left.name.localeCompare(right.name))
);

const removeSourceFromOtherFavorites = (
  records: ScraperTagFavoriteRecord[],
  source: ScraperTagFavoriteSource,
  targetFavoriteId: string,
): ScraperTagFavoriteRecord[] => (
  records.reduce<ScraperTagFavoriteRecord[]>((nextRecords, record) => {
    if (record.id === targetFavoriteId) {
      nextRecords.push(record);
      return nextRecords;
    }

    const nextSources = record.sources.filter((recordSource) => !(
      recordSource.scraperId === source.scraperId && recordSource.tagUrl === source.tagUrl
    ));

    if (!nextSources.length) {
      return nextRecords;
    }

    nextRecords.push(nextSources.length === record.sources.length
      ? record
      : {
        ...record,
        sources: nextSources,
        updatedAt: new Date().toISOString(),
      });
    return nextRecords;
  }, [])
);

const writeTagFavoritesFileUnlocked = async (
  records: ScraperTagFavoriteRecord[],
): Promise<void> => {
  await ensureDataDir();
  await fs.writeFile(scraperTagFavoritesFilePath, JSON.stringify(sortTagFavorites(records), null, 2));
};

const readTagFavoritesFileUnlocked = async (): Promise<ScraperTagFavoriteRecord[]> => {
  try {
    const data = await fs.readFile(scraperTagFavoritesFilePath, "utf-8");
    const parsed = JSON.parse(data) as Partial<ScraperTagFavoriteRecord>[];
    const sanitized = Array.isArray(parsed)
      ? parsed
        .map((record) => sanitizeTagFavoriteRecord(record))
        .filter((record): record is ScraperTagFavoriteRecord => Boolean(record))
      : [];
    const sorted = sortTagFavorites(sanitized);

    if (JSON.stringify(parsed, null, 2) !== JSON.stringify(sorted, null, 2)) {
      await writeTagFavoritesFileUnlocked(sorted);
    }

    return sorted;
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      await ensureDataDir();
      await fs.writeFile(scraperTagFavoritesFilePath, JSON.stringify([], null, 2));
      return [];
    }

    console.error("Error reading scraper tag favorites file:", error);
    throw new Error("Failed to read scraper tag favorites");
  }
};

const updateTagFavoritesFile = async <T>(
  operation: (
    records: ScraperTagFavoriteRecord[],
  ) => Promise<TagFavoritesFileUpdate<T>> | TagFavoritesFileUpdate<T>,
): Promise<T> => (
  runTagFavoritesFileOperation(async () => {
    const records = await readTagFavoritesFileUnlocked();
    const update = await operation(records);

    if (update.shouldWrite !== false) {
      await writeTagFavoritesFileUnlocked(update.records);
    }

    return update.result;
  })
);

export async function getScraperTagFavorites(
  _event?: IpcMainInvokeEvent,
): Promise<ScraperTagFavoriteRecord[]> {
  return runTagFavoritesFileOperation(readTagFavoritesFileUnlocked);
}

export async function saveScraperTagFavorite(
  _event: IpcMainInvokeEvent,
  request: SaveScraperTagFavoriteRequest,
): Promise<ScraperTagFavoriteRecord> {
  return updateTagFavoritesFile((records) => {
    const now = new Date().toISOString();
    const favoriteId = String(request.favoriteId ?? "").trim();
    const requestedName = String(request.name ?? "").trim();
    const requestedCover = String(request.cover ?? "").trim();
    const nextSource = sanitizeTagFavoriteSource({
      ...request.source,
      createdAt: now,
      updatedAt: now,
    });

    if (!nextSource) {
      throw new Error("La source tag est incomplete.");
    }

    const cleanedRecords = removeSourceFromOtherFavorites(records, nextSource, favoriteId);
    const existingIndex = favoriteId
      ? cleanedRecords.findIndex((record) => record.id === favoriteId)
      : -1;
    const existing = existingIndex >= 0 ? cleanedRecords[existingIndex] : null;
    const sourceIndex = existing?.sources.findIndex((source) => (
      source.scraperId === nextSource.scraperId && source.tagUrl === nextSource.tagUrl
    )) ?? -1;
    const nextSources = existing
      ? [...existing.sources]
      : [];

    if (sourceIndex >= 0) {
      nextSources[sourceIndex] = {
        ...nextSources[sourceIndex],
        ...nextSource,
        createdAt: nextSources[sourceIndex].createdAt,
        updatedAt: now,
      };
    } else {
      nextSources.push(nextSource);
    }

    const nextRecord = sanitizeTagFavoriteRecord({
      id: existing?.id ?? randomUUID(),
      name: requestedName || existing?.name || nextSource.name,
      cover: requestedCover || existing?.cover || nextSource.cover,
      sources: nextSources,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    if (!nextRecord) {
      throw new Error("Le favori tag est incomplet.");
    }

    const nextRecords = [...cleanedRecords];
    if (existingIndex >= 0) {
      nextRecords[existingIndex] = nextRecord;
    } else {
      nextRecords.push(nextRecord);
    }

    return {
      records: nextRecords,
      result: nextRecord,
    };
  });
}

export async function removeScraperTagFavorite(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperTagFavoriteRequest,
): Promise<boolean> {
  const favoriteId = String(request.favoriteId ?? "").trim();
  if (!favoriteId) {
    return false;
  }

  return updateTagFavoritesFile((records) => {
    const filtered = records.filter((record) => record.id !== favoriteId);
    const removed = filtered.length !== records.length;

    return {
      records: removed ? filtered : records,
      result: removed,
      shouldWrite: removed,
    };
  });
}

export async function removeScraperTagFavoriteSource(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperTagFavoriteSourceRequest,
): Promise<ScraperTagFavoriteRecord | null> {
  const favoriteId = String(request.favoriteId ?? "").trim();
  const scraperId = String(request.scraperId ?? "").trim();
  const tagUrl = normalizeScraperTagFavoriteUrl(request.tagUrl);

  if (!favoriteId || !scraperId || !tagUrl) {
    return null;
  }

  return updateTagFavoritesFile((records) => {
    const existingIndex = records.findIndex((record) => record.id === favoriteId);
    const existing = existingIndex >= 0 ? records[existingIndex] : null;

    if (!existing) {
      return {
        records,
        result: null,
        shouldWrite: false,
      };
    }

    const nextSources = existing.sources.filter((source) => !(
      source.scraperId === scraperId && source.tagUrl === tagUrl
    ));

    if (nextSources.length === existing.sources.length) {
      return {
        records,
        result: existing,
        shouldWrite: false,
      };
    }

    const nextRecords = [...records];
    if (!nextSources.length) {
      nextRecords.splice(existingIndex, 1);
      return {
        records: nextRecords,
        result: null,
      };
    }

    const nextRecord = {
      ...existing,
      sources: nextSources,
      cover: existing.cover || nextSources.find((source) => source.cover)?.cover,
      updatedAt: new Date().toISOString(),
    };
    nextRecords[existingIndex] = nextRecord;

    return {
      records: nextRecords,
      result: nextRecord,
    };
  });
}
