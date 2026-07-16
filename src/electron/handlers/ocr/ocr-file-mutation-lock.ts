const mutationTails = new Map<string, Promise<void>>();

const normalizeLockKey = (mangaPath: string): string => (
  String(mangaPath || "")
    .replace(/[\\/]+/gu, "/")
    .replace(/\/$/u, "")
    .toLocaleLowerCase("en-US")
);

export async function withMangaOcrFileMutationLock<T>(
  mangaPath: string,
  mutation: () => Promise<T>,
): Promise<T> {
  const lockKey = normalizeLockKey(mangaPath);
  const previousTail = mutationTails.get(lockKey) || Promise.resolve();
  let releaseCurrentMutation: () => void = () => undefined;
  const currentMutation = new Promise<void>((resolve) => {
    releaseCurrentMutation = resolve;
  });
  const currentTail = previousTail
    .catch(() => undefined)
    .then(() => currentMutation);
  mutationTails.set(lockKey, currentTail);

  await previousTail.catch(() => undefined);
  try {
    return await mutation();
  } finally {
    releaseCurrentMutation();
    if (mutationTails.get(lockKey) === currentTail) {
      mutationTails.delete(lockKey);
    }
  }
}
