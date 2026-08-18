import type { BackgroundListingRun } from "@/renderer/backgroundSearch/types";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { MAX_AUTHOR_CORRESPONDENCE_SESSION_CACHE_COUNT } from "@/shared/backgroundSearch";

export type AuthorCorrespondenceMangaEnrichment = {
  seedKey: string;
  anchorSourceKeys: string[];
  sources: MultiSearchSourceResult[];
};

export type AuthorCorrespondenceSessionCacheSnapshot = {
  revision: number;
  runs: BackgroundListingRun[];
  mangaEnrichments: AuthorCorrespondenceMangaEnrichment[];
  processedMangaKeys: string[];
  discoveredAuthorMatchKeys: string[];
};

const EMPTY_SNAPSHOT: AuthorCorrespondenceSessionCacheSnapshot = {
  revision: 0,
  runs: [],
  mangaEnrichments: [],
  processedMangaKeys: [],
  discoveredAuthorMatchKeys: [],
};

const snapshots = new Map<string, AuthorCorrespondenceSessionCacheSnapshot>();
const listeners = new Set<() => void>();

const emitChange = (): void => {
  listeners.forEach((listener) => listener());
};

const isSessionCacheSnapshot = (
  value: unknown,
): value is AuthorCorrespondenceSessionCacheSnapshot => Boolean(
  value
  && typeof value === "object"
  && typeof (value as AuthorCorrespondenceSessionCacheSnapshot).revision === "number"
  && Array.isArray((value as AuthorCorrespondenceSessionCacheSnapshot).runs)
  && Array.isArray((value as AuthorCorrespondenceSessionCacheSnapshot).mangaEnrichments)
  && Array.isArray((value as AuthorCorrespondenceSessionCacheSnapshot).processedMangaKeys)
  && Array.isArray((value as AuthorCorrespondenceSessionCacheSnapshot).discoveredAuthorMatchKeys),
);

const pruneSnapshots = (): void => {
  while (snapshots.size > MAX_AUTHOR_CORRESPONDENCE_SESSION_CACHE_COUNT) {
    const oldestKey = snapshots.keys().next().value as string | undefined;
    if (!oldestKey) return;
    snapshots.delete(oldestKey);
  }
};

export const createAuthorCorrespondenceSessionCacheSnapshot = (
  snapshot: Partial<AuthorCorrespondenceSessionCacheSnapshot> = {},
): AuthorCorrespondenceSessionCacheSnapshot => ({
  ...EMPTY_SNAPSHOT,
  ...snapshot,
  runs: snapshot.runs ?? [],
  mangaEnrichments: snapshot.mangaEnrichments ?? [],
  processedMangaKeys: snapshot.processedMangaKeys ?? [],
  discoveredAuthorMatchKeys: snapshot.discoveredAuthorMatchKeys ?? [],
});

export const getAuthorCorrespondenceSessionCacheSnapshot = (
  jobId?: string | null,
): AuthorCorrespondenceSessionCacheSnapshot => (
  jobId ? snapshots.get(jobId) ?? EMPTY_SNAPSHOT : EMPTY_SNAPSHOT
);

export const updateAuthorCorrespondenceSessionCache = (
  jobId: string,
  updater: (
    current: AuthorCorrespondenceSessionCacheSnapshot,
  ) => AuthorCorrespondenceSessionCacheSnapshot,
): AuthorCorrespondenceSessionCacheSnapshot => {
  const current = getAuthorCorrespondenceSessionCacheSnapshot(jobId);
  const next = {
    ...updater(current),
    revision: current.revision + 1,
  };
  snapshots.delete(jobId);
  snapshots.set(jobId, next);
  pruneSnapshots();
  emitChange();
  return next;
};

export const replaceAuthorCorrespondenceSessionCache = (
  jobId: string,
  snapshot: unknown,
): AuthorCorrespondenceSessionCacheSnapshot => {
  if (!isSessionCacheSnapshot(snapshot)) {
    return getAuthorCorrespondenceSessionCacheSnapshot(jobId);
  }
  const current = snapshots.get(jobId);
  if (current && current.revision >= snapshot.revision) return current;
  const next = createAuthorCorrespondenceSessionCacheSnapshot(snapshot);
  snapshots.delete(jobId);
  snapshots.set(jobId, next);
  pruneSnapshots();
  emitChange();
  return next;
};

export const hydrateAuthorCorrespondenceSessionCache = async (
  jobId: string,
): Promise<AuthorCorrespondenceSessionCacheSnapshot> => {
  const api = window.api ?? {};
  if (typeof api.getAuthorCorrespondenceSessionCache !== "function") {
    return getAuthorCorrespondenceSessionCacheSnapshot(jobId);
  }
  const snapshot = await api.getAuthorCorrespondenceSessionCache(jobId) as unknown;
  return replaceAuthorCorrespondenceSessionCache(jobId, snapshot);
};

export const publishAuthorCorrespondenceSessionCache = async (
  jobId: string,
  updater: (
    current: AuthorCorrespondenceSessionCacheSnapshot,
  ) => AuthorCorrespondenceSessionCacheSnapshot,
): Promise<AuthorCorrespondenceSessionCacheSnapshot> => {
  const next = updateAuthorCorrespondenceSessionCache(jobId, updater);
  const api = window.api ?? {};
  if (typeof api.setAuthorCorrespondenceSessionCache === "function") {
    await api.setAuthorCorrespondenceSessionCache(jobId, next);
  }
  return next;
};

export const subscribeAuthorCorrespondenceSessionCache = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
