import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { ensureDataDir } from "../../utils";

export type ScraperSourceFavoriteSourceBase = {
  scraperId: string;
  name: string;
  cover?: string;
  createdAt: string;
  updatedAt: string;
};

export type ScraperSourceFavoriteRecordBase<TSource extends ScraperSourceFavoriteSourceBase> = {
  id: string;
  name: string;
  cover?: string;
  sources: TSource[];
  createdAt: string;
  updatedAt: string;
};

type SourceFavoritesFileUpdate<TRecord, TResult> = {
  records: TRecord[];
  result: TResult;
  shouldWrite?: boolean;
};

type SaveSourceFavoriteRequest<TSource> = {
  favoriteId?: string | null;
  name?: string | null;
  cover?: string | null;
  source: Partial<TSource>;
};

type RemoveSourceFavoriteRequest = {
  favoriteId?: string | null;
};

type RemoveSourceFavoriteSourceRequest = {
  favoriteId?: string | null;
  scraperId?: string | null;
};

type ScraperSourceFavoritesServiceConfig<
  TRecord extends ScraperSourceFavoriteRecordBase<TSource>,
  TSource extends ScraperSourceFavoriteSourceBase,
> = {
  filePath: string;
  sourceUrlField: keyof TSource & string;
  readErrorMessage: string;
  incompleteSourceMessage: string;
  incompleteFavoriteMessage: string;
  sanitizeSource: (source: Partial<TSource> | null | undefined) => TSource | null;
};

export const normalizeScraperSourceFavoriteUrl = (value: unknown): string => {
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

const sortSourceFavorites = <
  TRecord extends ScraperSourceFavoriteRecordBase<TSource>,
  TSource extends ScraperSourceFavoriteSourceBase,
>(
  records: TRecord[],
): TRecord[] => (
  [...records].sort((left, right) => left.name.localeCompare(right.name))
);

const getSourceUrl = <
  TSource extends ScraperSourceFavoriteSourceBase,
>(
  source: TSource,
  sourceUrlField: keyof TSource & string,
): string => (
  normalizeScraperSourceFavoriteUrl(source[sourceUrlField])
);

const sanitizeSourceFavoriteRecord = <
  TRecord extends ScraperSourceFavoriteRecordBase<TSource>,
  TSource extends ScraperSourceFavoriteSourceBase,
>(
  record: Partial<TRecord> | null | undefined,
  sanitizeSource: (source: Partial<TSource> | null | undefined) => TSource | null,
): TRecord | null => {
  const id = String(record?.id ?? "").trim();
  const name = String(record?.name ?? "").trim();
  const cover = String(record?.cover ?? "").trim();
  const now = new Date().toISOString();
  const sources = Array.isArray(record?.sources)
    ? record.sources
      .map((source) => sanitizeSource(source))
      .filter((source): source is TSource => Boolean(source))
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
  } as TRecord;
};

const removeSourceFromOtherFavorites = <
  TRecord extends ScraperSourceFavoriteRecordBase<TSource>,
  TSource extends ScraperSourceFavoriteSourceBase,
>(
  records: TRecord[],
  source: TSource,
  targetFavoriteId: string,
  sourceUrlField: keyof TSource & string,
): TRecord[] => {
  const sourceUrl = getSourceUrl(source, sourceUrlField);

  return records.reduce<TRecord[]>((nextRecords, record) => {
    if (record.id === targetFavoriteId) {
      nextRecords.push(record);
      return nextRecords;
    }

    const nextSources = record.sources.filter((recordSource) => !(
      recordSource.scraperId === source.scraperId
      && getSourceUrl(recordSource, sourceUrlField) === sourceUrl
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
  }, []);
};

export function createScraperSourceFavoritesService<
  TRecord extends ScraperSourceFavoriteRecordBase<TSource>,
  TSource extends ScraperSourceFavoriteSourceBase,
>(
  config: ScraperSourceFavoritesServiceConfig<TRecord, TSource>,
) {
  let fileQueue: Promise<void> = Promise.resolve();

  const runFileOperation = async <T>(
    operation: () => Promise<T>,
  ): Promise<T> => {
    const previousOperation = fileQueue;
    let releaseOperation: () => void = () => undefined;

    fileQueue = new Promise<void>((resolve) => {
      releaseOperation = resolve;
    });

    await previousOperation.catch(() => undefined);

    try {
      return await operation();
    } finally {
      releaseOperation();
    }
  };

  const sanitizeRecord = (
    record: Partial<TRecord> | null | undefined,
  ): TRecord | null => (
    sanitizeSourceFavoriteRecord(record, config.sanitizeSource)
  );

  const writeFileUnlocked = async (
    records: TRecord[],
  ): Promise<void> => {
    await ensureDataDir();
    await fs.writeFile(config.filePath, JSON.stringify(sortSourceFavorites(records), null, 2));
  };

  const readFileUnlocked = async (): Promise<TRecord[]> => {
    try {
      const data = await fs.readFile(config.filePath, "utf-8");
      const parsed = JSON.parse(data) as Partial<TRecord>[];
      const sanitized = Array.isArray(parsed)
        ? parsed
          .map((record) => sanitizeRecord(record))
          .filter((record): record is TRecord => Boolean(record))
        : [];
      const sorted = sortSourceFavorites(sanitized);

      if (JSON.stringify(parsed, null, 2) !== JSON.stringify(sorted, null, 2)) {
        await writeFileUnlocked(sorted);
      }

      return sorted;
    } catch (error: any) {
      if (error && error.code === "ENOENT") {
        await ensureDataDir();
        await fs.writeFile(config.filePath, JSON.stringify([], null, 2));
        return [];
      }

      console.error(config.readErrorMessage, error);
      throw new Error(config.readErrorMessage);
    }
  };

  const updateFile = async <TResult>(
    operation: (
      records: TRecord[],
    ) => Promise<SourceFavoritesFileUpdate<TRecord, TResult>> | SourceFavoritesFileUpdate<TRecord, TResult>,
  ): Promise<TResult> => (
    runFileOperation(async () => {
      const records = await readFileUnlocked();
      const update = await operation(records);

      if (update.shouldWrite !== false) {
        await writeFileUnlocked(update.records);
      }

      return update.result;
    })
  );

  const getFavorites = async (): Promise<TRecord[]> => (
    runFileOperation(readFileUnlocked)
  );

  const saveFavorite = async (
    request: SaveSourceFavoriteRequest<TSource>,
  ): Promise<TRecord> => (
    updateFile((records) => {
      const now = new Date().toISOString();
      const favoriteId = String(request.favoriteId ?? "").trim();
      const requestedName = String(request.name ?? "").trim();
      const requestedCover = String(request.cover ?? "").trim();
      const nextSource = config.sanitizeSource({
        ...request.source,
        createdAt: now,
        updatedAt: now,
      } as Partial<TSource>);

      if (!nextSource) {
        throw new Error(config.incompleteSourceMessage);
      }

      const cleanedRecords = removeSourceFromOtherFavorites(
        records,
        nextSource,
        favoriteId,
        config.sourceUrlField,
      );
      const existingIndex = favoriteId
        ? cleanedRecords.findIndex((record) => record.id === favoriteId)
        : -1;
      const existing = existingIndex >= 0 ? cleanedRecords[existingIndex] : null;
      const sourceUrl = getSourceUrl(nextSource, config.sourceUrlField);
      const sourceIndex = existing?.sources.findIndex((source) => (
        source.scraperId === nextSource.scraperId
        && getSourceUrl(source, config.sourceUrlField) === sourceUrl
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

      const nextRecord = sanitizeRecord({
        id: existing?.id ?? randomUUID(),
        name: requestedName || existing?.name || nextSource.name,
        cover: requestedCover || existing?.cover || nextSource.cover,
        sources: nextSources,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      } as Partial<TRecord>);

      if (!nextRecord) {
        throw new Error(config.incompleteFavoriteMessage);
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
    })
  );

  const removeFavorite = async (
    request: RemoveSourceFavoriteRequest,
  ): Promise<boolean> => {
    const favoriteId = String(request.favoriteId ?? "").trim();
    if (!favoriteId) {
      return false;
    }

    return updateFile((records) => {
      const filtered = records.filter((record) => record.id !== favoriteId);
      const removed = filtered.length !== records.length;

      return {
        records: removed ? filtered : records,
        result: removed,
        shouldWrite: removed,
      };
    });
  };

  const removeFavoriteSource = async (
    request: RemoveSourceFavoriteSourceRequest,
  ): Promise<TRecord | null> => {
    const favoriteId = String(request.favoriteId ?? "").trim();
    const scraperId = String(request.scraperId ?? "").trim();
    const requestValues = request as Record<string, unknown>;
    const sourceUrl = normalizeScraperSourceFavoriteUrl(requestValues[config.sourceUrlField]);

    if (!favoriteId || !scraperId || !sourceUrl) {
      return null;
    }

    return updateFile((records) => {
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
        source.scraperId === scraperId
        && getSourceUrl(source, config.sourceUrlField) === sourceUrl
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
  };

  return {
    getFavorites,
    saveFavorite,
    removeFavorite,
    removeFavoriteSource,
  };
}
