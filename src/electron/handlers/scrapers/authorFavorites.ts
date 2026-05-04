import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { type IpcMainInvokeEvent } from "electron";
import {
  type RemoveScraperAuthorFavoriteRequest,
  type RemoveScraperAuthorFavoriteSourceRequest,
  type SaveScraperAuthorFavoriteRequest,
  type ScraperAuthorFavoriteRecord,
  type ScraperAuthorFavoriteSource,
} from "../../scraper";
import { ensureDataDir, scraperAuthorFavoritesFilePath } from "../../utils";

type AuthorFavoritesFileUpdate<T> = {
  records: ScraperAuthorFavoriteRecord[];
  result: T;
  shouldWrite?: boolean;
};

let authorFavoritesFileQueue: Promise<void> = Promise.resolve();

const runAuthorFavoritesFileOperation = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  const previousOperation = authorFavoritesFileQueue;
  let releaseOperation: () => void = () => undefined;

  authorFavoritesFileQueue = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });

  await previousOperation.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseOperation();
  }
};

export const normalizeScraperAuthorFavoriteUrl = (value: unknown): string => {
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

const sanitizeTemplateContext = (
  value: unknown,
): Record<string, string | undefined> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>).reduce<Record<string, string | undefined>>(
    (context, [key, entryValue]) => {
      const normalizedKey = key.trim();
      if (!normalizedKey) {
        return context;
      }

      context[normalizedKey] = entryValue == null ? undefined : String(entryValue);
      return context;
    },
    {},
  );

  return Object.keys(entries).length ? entries : undefined;
};

const sanitizeAuthorFavoriteSource = (
  source: Partial<ScraperAuthorFavoriteSource> | null | undefined,
): ScraperAuthorFavoriteSource | null => {
  const scraperId = String(source?.scraperId ?? "").trim();
  const authorUrl = normalizeScraperAuthorFavoriteUrl(source?.authorUrl);
  const name = String(source?.name ?? "").trim() || authorUrl;
  const cover = String(source?.cover ?? "").trim();
  const now = new Date().toISOString();
  const createdAt = String(source?.createdAt ?? "").trim() || now;
  const updatedAt = String(source?.updatedAt ?? "").trim() || now;

  if (!scraperId || !authorUrl) {
    return null;
  }

  return {
    scraperId,
    authorUrl,
    name,
    cover: cover || undefined,
    templateContext: sanitizeTemplateContext(source?.templateContext),
    createdAt,
    updatedAt,
  };
};

const sanitizeAuthorFavoriteRecord = (
  record: Partial<ScraperAuthorFavoriteRecord> | null | undefined,
): ScraperAuthorFavoriteRecord | null => {
  const id = String(record?.id ?? "").trim();
  const name = String(record?.name ?? "").trim();
  const cover = String(record?.cover ?? "").trim();
  const now = new Date().toISOString();
  const sources = Array.isArray(record?.sources)
    ? record.sources
      .map((source) => sanitizeAuthorFavoriteSource(source))
      .filter((source): source is ScraperAuthorFavoriteSource => Boolean(source))
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

const sortAuthorFavorites = (
  records: ScraperAuthorFavoriteRecord[],
): ScraperAuthorFavoriteRecord[] => (
  [...records].sort((left, right) => left.name.localeCompare(right.name))
);

const removeSourceFromOtherFavorites = (
  records: ScraperAuthorFavoriteRecord[],
  source: ScraperAuthorFavoriteSource,
  targetFavoriteId: string,
): ScraperAuthorFavoriteRecord[] => (
  records.reduce<ScraperAuthorFavoriteRecord[]>((nextRecords, record) => {
    if (record.id === targetFavoriteId) {
      nextRecords.push(record);
      return nextRecords;
    }

    const nextSources = record.sources.filter((recordSource) => !(
      recordSource.scraperId === source.scraperId && recordSource.authorUrl === source.authorUrl
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

const writeAuthorFavoritesFileUnlocked = async (
  records: ScraperAuthorFavoriteRecord[],
): Promise<void> => {
  await ensureDataDir();
  await fs.writeFile(scraperAuthorFavoritesFilePath, JSON.stringify(sortAuthorFavorites(records), null, 2));
};

const readAuthorFavoritesFileUnlocked = async (): Promise<ScraperAuthorFavoriteRecord[]> => {
  try {
    const data = await fs.readFile(scraperAuthorFavoritesFilePath, "utf-8");
    const parsed = JSON.parse(data) as Partial<ScraperAuthorFavoriteRecord>[];
    const sanitized = Array.isArray(parsed)
      ? parsed
        .map((record) => sanitizeAuthorFavoriteRecord(record))
        .filter((record): record is ScraperAuthorFavoriteRecord => Boolean(record))
      : [];
    const sorted = sortAuthorFavorites(sanitized);

    if (JSON.stringify(parsed, null, 2) !== JSON.stringify(sorted, null, 2)) {
      await writeAuthorFavoritesFileUnlocked(sorted);
    }

    return sorted;
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      await ensureDataDir();
      await fs.writeFile(scraperAuthorFavoritesFilePath, JSON.stringify([], null, 2));
      return [];
    }

    console.error("Error reading scraper author favorites file:", error);
    throw new Error("Failed to read scraper author favorites");
  }
};

const updateAuthorFavoritesFile = async <T>(
  operation: (
    records: ScraperAuthorFavoriteRecord[],
  ) => Promise<AuthorFavoritesFileUpdate<T>> | AuthorFavoritesFileUpdate<T>,
): Promise<T> => (
  runAuthorFavoritesFileOperation(async () => {
    const records = await readAuthorFavoritesFileUnlocked();
    const update = await operation(records);

    if (update.shouldWrite !== false) {
      await writeAuthorFavoritesFileUnlocked(update.records);
    }

    return update.result;
  })
);

export async function getScraperAuthorFavorites(
  _event?: IpcMainInvokeEvent,
): Promise<ScraperAuthorFavoriteRecord[]> {
  return runAuthorFavoritesFileOperation(readAuthorFavoritesFileUnlocked);
}

export async function saveScraperAuthorFavorite(
  _event: IpcMainInvokeEvent,
  request: SaveScraperAuthorFavoriteRequest,
): Promise<ScraperAuthorFavoriteRecord> {
  return updateAuthorFavoritesFile((records) => {
    const now = new Date().toISOString();
    const favoriteId = String(request.favoriteId ?? "").trim();
    const requestedName = String(request.name ?? "").trim();
    const requestedCover = String(request.cover ?? "").trim();
    const nextSource = sanitizeAuthorFavoriteSource({
      ...request.source,
      createdAt: now,
      updatedAt: now,
    });

    if (!nextSource) {
      throw new Error("La source auteur est incomplete.");
    }

    const cleanedRecords = removeSourceFromOtherFavorites(records, nextSource, favoriteId);
    const existingIndex = favoriteId
      ? cleanedRecords.findIndex((record) => record.id === favoriteId)
      : -1;
    const existing = existingIndex >= 0 ? cleanedRecords[existingIndex] : null;
    const sourceIndex = existing?.sources.findIndex((source) => (
      source.scraperId === nextSource.scraperId && source.authorUrl === nextSource.authorUrl
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

    const nextRecord = sanitizeAuthorFavoriteRecord({
      id: existing?.id ?? randomUUID(),
      name: requestedName || existing?.name || nextSource.name,
      cover: requestedCover || existing?.cover || nextSource.cover,
      sources: nextSources,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    if (!nextRecord) {
      throw new Error("Le favori auteur est incomplet.");
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

export async function removeScraperAuthorFavorite(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperAuthorFavoriteRequest,
): Promise<boolean> {
  const favoriteId = String(request.favoriteId ?? "").trim();
  if (!favoriteId) {
    return false;
  }

  return updateAuthorFavoritesFile((records) => {
    const filtered = records.filter((record) => record.id !== favoriteId);
    const removed = filtered.length !== records.length;

    return {
      records: removed ? filtered : records,
      result: removed,
      shouldWrite: removed,
    };
  });
}

export async function removeScraperAuthorFavoriteSource(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperAuthorFavoriteSourceRequest,
): Promise<ScraperAuthorFavoriteRecord | null> {
  const favoriteId = String(request.favoriteId ?? "").trim();
  const scraperId = String(request.scraperId ?? "").trim();
  const authorUrl = normalizeScraperAuthorFavoriteUrl(request.authorUrl);

  if (!favoriteId || !scraperId || !authorUrl) {
    return null;
  }

  return updateAuthorFavoritesFile((records) => {
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
      source.scraperId === scraperId && source.authorUrl === authorUrl
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
