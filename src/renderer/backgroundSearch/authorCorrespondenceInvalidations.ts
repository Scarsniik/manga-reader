const STORAGE_KEY_PREFIX = "manga-helper.author-correspondence.invalidations.v1";

const inMemoryInvalidations = new Map<string, Set<string>>();

const buildStorageKey = (jobId: string): string => `${STORAGE_KEY_PREFIX}:${jobId}`;

export const readAuthorCorrespondenceInvalidations = (jobId: string): Set<string> => {
  const inMemory = inMemoryInvalidations.get(jobId);
  try {
    const storedValue = window.localStorage.getItem(buildStorageKey(jobId));
    if (!storedValue) return new Set(inMemory ?? []);
    const parsedValue = JSON.parse(storedValue);
    return new Set([
      ...(inMemory ?? []),
      ...(Array.isArray(parsedValue)
        ? parsedValue.filter((value): value is string => typeof value === "string")
        : []),
    ]);
  } catch {
    return new Set(inMemory ?? []);
  }
};

export const writeAuthorCorrespondenceInvalidations = (
  jobId: string,
  invalidatedMatchKeys: Set<string>,
): void => {
  inMemoryInvalidations.set(jobId, new Set(invalidatedMatchKeys));
  try {
    const storageKey = buildStorageKey(jobId);
    if (!invalidatedMatchKeys.size) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(invalidatedMatchKeys)));
  } catch {
    // The shared in-memory state still lets a running search observe the change.
  }
};
