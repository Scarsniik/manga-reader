import { MAX_AUTHOR_CORRESPONDENCE_SESSION_CACHE_COUNT } from "../../shared/backgroundSearch";

const snapshots = new Map<string, unknown>();

const normalizeJobId = (jobId: unknown): string => (
  typeof jobId === "string" ? jobId.trim() : ""
);

export const getAuthorCorrespondenceSessionCache = (jobId: unknown): unknown => {
  const normalizedJobId = normalizeJobId(jobId);
  if (!normalizedJobId) return null;
  const snapshot = snapshots.get(normalizedJobId);
  if (!snapshot) return null;
  snapshots.delete(normalizedJobId);
  snapshots.set(normalizedJobId, snapshot);
  return snapshot;
};

export const setAuthorCorrespondenceSessionCache = (
  jobId: unknown,
  snapshot: unknown,
): unknown => {
  const normalizedJobId = normalizeJobId(jobId);
  if (!normalizedJobId || !snapshot || typeof snapshot !== "object") return null;
  snapshots.delete(normalizedJobId);
  snapshots.set(normalizedJobId, snapshot);
  while (snapshots.size > MAX_AUTHOR_CORRESPONDENCE_SESSION_CACHE_COUNT) {
    const oldestJobId = snapshots.keys().next().value as string | undefined;
    if (!oldestJobId) break;
    snapshots.delete(oldestJobId);
  }
  return snapshot;
};
