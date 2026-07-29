export const resolveBackgroundListingConcurrency = (
  value: unknown,
  fallback: number,
): number => {
  const parsed = Math.floor(Number(value));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.max(1, Math.floor(Number(fallback) || 1));
};

export const DEFAULT_BACKGROUND_QUICK_SEEN_STOP_THRESHOLD = 2;

export const usesBackgroundQuickSeenBoundary = (kind: string): boolean => (
  kind === "latestSources"
);

export const resolveBackgroundListingResultLimit = (
  sourceResultLimit: unknown,
  defaultResultLimit: unknown,
  pageLimitedOnly: boolean,
): number => {
  if (pageLimitedOnly) return 0;

  const parsed = Math.floor(Number(sourceResultLimit ?? defaultResultLimit ?? 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

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

type BackgroundLanguageProgress = {
  excludedCount: number;
  includedCount: number;
  boundaryReached: boolean;
};

export const resolveBackgroundLanguageProgress = (
  previousExcludedCount: number,
  previousIncludedCount: number,
  newResultCount: number,
  includedResultCount: number,
  enrichedExcludedCount: number,
  rejectLimit: number | undefined,
): BackgroundLanguageProgress => {
  const normalizedNewResultCount = Math.max(0, Math.floor(newResultCount));
  const normalizedIncludedResultCount = Math.min(
    normalizedNewResultCount,
    Math.max(0, Math.floor(includedResultCount)),
  );
  const normalizedEnrichedExcludedCount = Math.min(
    normalizedIncludedResultCount,
    Math.max(0, Math.floor(enrichedExcludedCount)),
  );
  const excludedCount = Math.max(0, previousExcludedCount)
    + normalizedNewResultCount
    - normalizedIncludedResultCount
    + normalizedEnrichedExcludedCount;
  const includedCount = Math.max(0, previousIncludedCount)
    + normalizedIncludedResultCount
    - normalizedEnrichedExcludedCount;
  const normalizedRejectLimit = Math.max(0, Math.floor(Number(rejectLimit) || 0));

  return {
    excludedCount,
    includedCount,
    boundaryReached: normalizedRejectLimit > 0
      && includedCount === 0
      && excludedCount >= normalizedRejectLimit,
  };
};
