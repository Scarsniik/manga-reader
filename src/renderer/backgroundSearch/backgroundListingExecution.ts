export const resolveBackgroundListingConcurrency = (
  value: unknown,
  fallback: number,
): number => {
  const parsed = Math.floor(Number(value));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.max(1, Math.floor(Number(fallback) || 1));
};

export const DEFAULT_BACKGROUND_QUICK_SEEN_STOP_THRESHOLD = 2;

export const resolveBackgroundQuickSeenProgress = (
  seenResults: boolean[],
  previousConsecutiveSeenCount: number,
  threshold = DEFAULT_BACKGROUND_QUICK_SEEN_STOP_THRESHOLD,
): { consecutiveSeenCount: number; boundaryReached: boolean } => {
  const normalizedThreshold = Math.max(0, Math.floor(Number(threshold) || 0));
  let consecutiveSeenCount = Math.max(0, previousConsecutiveSeenCount);
  let boundaryReached = false;

  seenResults.forEach((seen) => {
    if (!seen) {
      consecutiveSeenCount = 0;
      return;
    }

    consecutiveSeenCount += 1;
    if (consecutiveSeenCount > normalizedThreshold) {
      boundaryReached = true;
    }
  });

  return { consecutiveSeenCount, boundaryReached };
};
