const STORAGE_KEY_PREFIX = "manga-helper.author-correspondence.invalidations.v1";

const buildStorageKey = (jobId: string): string => `${STORAGE_KEY_PREFIX}:${jobId}`;

export const readAuthorCorrespondenceInvalidations = (jobId: string): Set<string> => {
  try {
    const storedValue = window.localStorage.getItem(buildStorageKey(jobId));
    if (!storedValue) {
      return new Set();
    }

    const parsedValue = JSON.parse(storedValue);
    return new Set(
      Array.isArray(parsedValue)
        ? parsedValue.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set();
  }
};

export const writeAuthorCorrespondenceInvalidations = (
  jobId: string,
  invalidatedMatchKeys: Set<string>,
): void => {
  try {
    const storageKey = buildStorageKey(jobId);
    if (!invalidatedMatchKeys.size) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(invalidatedMatchKeys)));
  } catch {
    // The current view still keeps the invalidation when browser storage is unavailable.
  }
};
