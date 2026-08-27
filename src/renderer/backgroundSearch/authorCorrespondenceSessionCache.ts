import type { BackgroundListingRun } from "@/renderer/backgroundSearch/types";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
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
  newAuthorMatchKeys: string[];
};

const EMPTY_SNAPSHOT: AuthorCorrespondenceSessionCacheSnapshot = {
  revision: 0,
  runs: [],
  mangaEnrichments: [],
  processedMangaKeys: [],
  discoveredAuthorMatchKeys: [],
  newAuthorMatchKeys: [],
};

const mergeSources = (
  current: MultiSearchSourceResult[],
  incoming: MultiSearchSourceResult[],
): MultiSearchSourceResult[] => Array.from(new Map(
  [...current, ...incoming].map((source) => [buildMultiSearchSourceIdentityKey(source), source]),
).values());

export const mergeAuthorCorrespondenceSessionCacheSnapshots = (
  current: AuthorCorrespondenceSessionCacheSnapshot,
  incoming: AuthorCorrespondenceSessionCacheSnapshot,
): AuthorCorrespondenceSessionCacheSnapshot => {
  const runsByKey = new Map(current.runs.map((run) => [run.key, run]));
  incoming.runs.forEach((run) => {
    const existing = runsByKey.get(run.key);
    runsByKey.set(run.key, existing ? {
      ...existing,
      ...run,
      results: mergeSources(existing.results, run.results),
      pendingResults: mergeSources(existing.pendingResults ?? [], run.pendingResults ?? []),
      pendingCandidates: mergeSources(existing.pendingCandidates ?? [], run.pendingCandidates ?? []),
      cacheResults: mergeSources(existing.cacheResults ?? [], run.cacheResults ?? []),
      loadedPages: Math.max(existing.loadedPages, run.loadedPages),
      checkedPages: Math.max(existing.checkedPages ?? 0, run.checkedPages ?? 0),
    } : run);
  });
  const enrichmentsByKey = new Map(current.mangaEnrichments.map((enrichment) => [
    enrichment.seedKey,
    enrichment,
  ]));
  incoming.mangaEnrichments.forEach((enrichment) => {
    const existing = enrichmentsByKey.get(enrichment.seedKey);
    enrichmentsByKey.set(enrichment.seedKey, existing ? {
      ...existing,
      anchorSourceKeys: Array.from(new Set([
        ...existing.anchorSourceKeys,
        ...enrichment.anchorSourceKeys,
      ])),
      sources: mergeSources(existing.sources, enrichment.sources),
    } : enrichment);
  });
  return createAuthorCorrespondenceSessionCacheSnapshot({
    revision: Math.max(current.revision, incoming.revision),
    runs: Array.from(runsByKey.values()),
    mangaEnrichments: Array.from(enrichmentsByKey.values()),
    processedMangaKeys: Array.from(new Set([
      ...current.processedMangaKeys,
      ...incoming.processedMangaKeys,
    ])),
    discoveredAuthorMatchKeys: Array.from(new Set([
      ...current.discoveredAuthorMatchKeys,
      ...incoming.discoveredAuthorMatchKeys,
    ])),
    newAuthorMatchKeys: Array.from(new Set([
      ...current.newAuthorMatchKeys,
      ...incoming.newAuthorMatchKeys,
    ])),
  });
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
  && Array.isArray((value as AuthorCorrespondenceSessionCacheSnapshot).discoveredAuthorMatchKeys)
  && (
    (value as Partial<AuthorCorrespondenceSessionCacheSnapshot>).newAuthorMatchKeys === undefined
    || Array.isArray((value as AuthorCorrespondenceSessionCacheSnapshot).newAuthorMatchKeys)
  ),
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
  newAuthorMatchKeys: snapshot.newAuthorMatchKeys ?? [],
});

export const startAuthorCorrespondenceAdvancedDiscoveryBatch = (
  snapshot: AuthorCorrespondenceSessionCacheSnapshot,
  historicalMatchKeys: string[] = [],
): AuthorCorrespondenceSessionCacheSnapshot => ({
  ...snapshot,
  discoveredAuthorMatchKeys: Array.from(new Set([
    ...snapshot.discoveredAuthorMatchKeys,
    ...historicalMatchKeys,
  ])),
  newAuthorMatchKeys: [],
});

export const recordAuthorCorrespondenceAdvancedDiscoveries = (
  snapshot: AuthorCorrespondenceSessionCacheSnapshot,
  matchKeys: string[],
): AuthorCorrespondenceSessionCacheSnapshot => ({
  ...snapshot,
  discoveredAuthorMatchKeys: Array.from(new Set([
    ...snapshot.discoveredAuthorMatchKeys,
    ...matchKeys,
  ])),
  newAuthorMatchKeys: Array.from(new Set([
    ...snapshot.newAuthorMatchKeys,
    ...matchKeys,
  ])),
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
