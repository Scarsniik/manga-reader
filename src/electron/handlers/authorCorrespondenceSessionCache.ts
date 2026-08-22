import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { gunzip, gzip } from "zlib";
import { MAX_AUTHOR_CORRESPONDENCE_SESSION_CACHE_COUNT } from "../../shared/backgroundSearch";

const CACHE_SCHEMA_VERSION = 1;
const CACHE_FILE_SUFFIX = ".json.gz";
const cacheDirectory = process.env.SCARAMANGA_AUTHOR_CORRESPONDENCE_CACHE_DIR?.trim()
  || path.join(os.tmpdir(), "manga-helper-author-correspondence-caches");
const compress = promisify(gzip);
const decompress = promisify(gunzip);
const snapshots = new Map<string, unknown>();
const fileMutationChains = new Map<string, Promise<void>>();

type StoredAuthorCorrespondenceCache = {
  schemaVersion: number;
  snapshot: unknown;
};

const normalizeJobId = (jobId: unknown): string => {
  const normalizedJobId = typeof jobId === "string" ? jobId.trim() : "";
  return /^[a-zA-Z0-9_-]+$/.test(normalizedJobId) ? normalizedJobId : "";
};

const getCacheFilePath = (jobId: string): string => (
  path.join(cacheDirectory, `${jobId}${CACHE_FILE_SUFFIX}`)
);

const touchSnapshot = (jobId: string, snapshot: unknown): unknown => {
  snapshots.delete(jobId);
  snapshots.set(jobId, snapshot);
  while (snapshots.size > MAX_AUTHOR_CORRESPONDENCE_SESSION_CACHE_COUNT) {
    const oldestJobId = snapshots.keys().next().value as string | undefined;
    if (!oldestJobId) break;
    snapshots.delete(oldestJobId);
  }
  return snapshot;
};

const serializeFileMutation = async (
  jobId: string,
  mutation: () => Promise<void>,
): Promise<void> => {
  const previousMutation = fileMutationChains.get(jobId) ?? Promise.resolve();
  const currentMutation = previousMutation.catch(() => undefined).then(mutation);
  fileMutationChains.set(jobId, currentMutation);
  try {
    await currentMutation;
  } finally {
    if (fileMutationChains.get(jobId) === currentMutation) {
      fileMutationChains.delete(jobId);
    }
  }
};

const writeCompressedSnapshot = async (jobId: string, snapshot: unknown): Promise<void> => {
  await fs.mkdir(cacheDirectory, { recursive: true });
  const filePath = getCacheFilePath(jobId);
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const storedCache: StoredAuthorCorrespondenceCache = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    snapshot,
  };
  const compressed = await compress(Buffer.from(JSON.stringify(storedCache), "utf8"));
  try {
    await fs.writeFile(temporaryPath, compressed);
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.unlink(temporaryPath).catch((error) => {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    });
  }
};

const readCompressedSnapshot = async (jobId: string): Promise<unknown | null> => {
  try {
    const compressed = await fs.readFile(getCacheFilePath(jobId));
    const raw = await decompress(compressed);
    const storedCache = JSON.parse(raw.toString("utf8")) as StoredAuthorCorrespondenceCache;
    if (storedCache?.schemaVersion !== CACHE_SCHEMA_VERSION || !("snapshot" in storedCache)) {
      return null;
    }
    return storedCache.snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn(`Failed to read author correspondence cache ${jobId}`, error);
    }
    return null;
  }
};

export const getAuthorCorrespondenceSessionCache = (jobId: unknown): unknown => {
  const normalizedJobId = normalizeJobId(jobId);
  if (!normalizedJobId) return null;
  const snapshot = snapshots.get(normalizedJobId);
  return snapshot === undefined ? null : touchSnapshot(normalizedJobId, snapshot);
};

export const loadAuthorCorrespondenceSessionCache = async (jobId: unknown): Promise<unknown> => {
  const normalizedJobId = normalizeJobId(jobId);
  if (!normalizedJobId) return null;
  const memorySnapshot = getAuthorCorrespondenceSessionCache(normalizedJobId);
  if (memorySnapshot !== null) return memorySnapshot;
  const storedSnapshot = await readCompressedSnapshot(normalizedJobId);
  return storedSnapshot === null ? null : touchSnapshot(normalizedJobId, storedSnapshot);
};

export const setAuthorCorrespondenceSessionCache = (
  jobId: unknown,
  snapshot: unknown,
): unknown => {
  const normalizedJobId = normalizeJobId(jobId);
  if (!normalizedJobId || !snapshot || typeof snapshot !== "object") return null;
  return touchSnapshot(normalizedJobId, snapshot);
};

export const persistAuthorCorrespondenceSessionCache = async (
  jobId: unknown,
  snapshot: unknown,
): Promise<unknown> => {
  const normalizedJobId = normalizeJobId(jobId);
  const savedSnapshot = setAuthorCorrespondenceSessionCache(normalizedJobId, snapshot);
  if (!normalizedJobId || !savedSnapshot) return null;
  await serializeFileMutation(
    normalizedJobId,
    () => writeCompressedSnapshot(normalizedJobId, savedSnapshot),
  );
  return savedSnapshot;
};

export const removeAuthorCorrespondenceSessionCache = async (jobId: unknown): Promise<void> => {
  const normalizedJobId = normalizeJobId(jobId);
  if (!normalizedJobId) return;
  snapshots.delete(normalizedJobId);
  await serializeFileMutation(normalizedJobId, async () => {
    await fs.unlink(getCacheFilePath(normalizedJobId)).catch((error) => {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
    });
  });
};

export const pruneAuthorCorrespondenceSessionCaches = async (
  retainedJobIds: Iterable<string>,
): Promise<void> => {
  const retainedIds = new Set(Array.from(retainedJobIds, normalizeJobId).filter(Boolean));
  Array.from(snapshots.keys()).forEach((jobId) => {
    if (!retainedIds.has(jobId)) snapshots.delete(jobId);
  });
  try {
    const entries = await fs.readdir(cacheDirectory, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const jobId = entry.isFile() && entry.name.endsWith(CACHE_FILE_SUFFIX)
        ? normalizeJobId(entry.name.slice(0, -CACHE_FILE_SUFFIX.length))
        : "";
      const staleTemporaryFile = entry.isFile() && entry.name.endsWith(".tmp");
      if ((!jobId || retainedIds.has(jobId)) && !staleTemporaryFile) return;
      await fs.unlink(path.join(cacheDirectory, entry.name));
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }
};
