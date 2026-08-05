import {
  allocateScraperLatestFixedTargets,
  type ScraperLatestBalancedBatch,
} from "@/renderer/utils/scraperLatestExecutionPlanning";

export const resolveBackgroundListingConcurrency = (
  value: unknown,
  fallback: number,
): number => {
  const parsed = Math.floor(Number(value));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.max(1, Math.floor(Number(fallback) || 1));
};

export const DEFAULT_BACKGROUND_QUICK_SEEN_STOP_THRESHOLD = 2;
export const DEFAULT_SCRAPER_LATEST_SOURCE_PAGE_LIMIT = 50;

export const resolveScraperLatestSourcePageLimit = (value: number | null): number => (
  value === null
    ? DEFAULT_SCRAPER_LATEST_SOURCE_PAGE_LIMIT
    : Math.max(1, Math.floor(Number(value) || 0))
);

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

export const resolveBackgroundListingTotalGroupKey = (source: {
  id: string;
  mode?: string;
  favoriteId?: string;
}): string => {
  if (source.mode !== "tag") return "scraper";
  const explicitFavoriteId = source.favoriteId?.trim();
  if (explicitFavoriteId) return `tag:${explicitFavoriteId}`;
  const legacyFavoriteId = source.id.match(/^tag:([^:]+):/)?.[1]?.trim();
  return `tag:${legacyFavoriteId || source.id}`;
};

type BackgroundListingTotalGroupOptions = {
  sourceIndexes: number[];
  resultLimit: number;
  getResultCount: (sourceIndex: number) => number;
  canContinue: (sourceIndex: number) => boolean;
  isUnavailable?: (sourceIndex: number) => boolean;
  execute: (sourceIndex: number, targetResultCount: number) => Promise<void>;
  appendToExistingResults?: boolean;
  beforeExecute?: (batches: ScraperLatestBalancedBatch[]) => Promise<void> | void;
  onRoundStart?: (batches: ScraperLatestBalancedBatch[], roundNumber: number) => Promise<void> | void;
  onRoundComplete?: (
    batches: ScraperLatestBalancedBatch[],
    roundNumber: number,
    durationMs: number,
  ) => Promise<void> | void;
};

export const runBackgroundListingTotalGroup = async ({
  sourceIndexes,
  resultLimit,
  getResultCount,
  canContinue,
  isUnavailable = (sourceIndex) => !canContinue(sourceIndex),
  execute,
  appendToExistingResults = false,
  beforeExecute,
  onRoundStart,
  onRoundComplete,
}: BackgroundListingTotalGroupOptions): Promise<{ quotaReached: boolean; resultCount: number }> => {
  const normalizedLimit = Math.max(0, Math.floor(Number(resultLimit) || 0));
  let resultCount = sourceIndexes.reduce((count, sourceIndex) => count + getResultCount(sourceIndex), 0);
  if (!sourceIndexes.length || normalizedLimit === 0) {
    return { quotaReached: false, resultCount };
  }

  const initialTargets = allocateScraperLatestFixedTargets(
    sourceIndexes,
    normalizedLimit,
    getResultCount,
    appendToExistingResults,
  );
  const targets = new Map(initialTargets.map(({ sourceIndex, targetResultCount }) => (
    [sourceIndex, targetResultCount]
  )));
  const redistributedUnavailableSources = new Set<number>();
  let roundNumber = 0;

  while (true) {
    const batches = sourceIndexes
      .map((sourceIndex) => ({
        sourceIndex,
        targetResultCount: targets.get(sourceIndex) ?? getResultCount(sourceIndex),
      }))
      .filter(({ sourceIndex, targetResultCount }) => (
        getResultCount(sourceIndex) < targetResultCount && canContinue(sourceIndex)
      ))
      .map(({ sourceIndex, targetResultCount }) => ({
        sourceIndex,
        requestedResultCount: Math.max(0, targetResultCount - getResultCount(sourceIndex)),
        targetResultCount,
      }));
    if (!batches.length) break;

    roundNumber += 1;
    const resultCountBeforeRound = sourceIndexes.reduce(
      (count, sourceIndex) => count + getResultCount(sourceIndex),
      0,
    );
    await onRoundStart?.(batches, roundNumber);
    await beforeExecute?.(batches);
    const roundStartedAt = performance.now();
    await Promise.all(batches.map(({ sourceIndex, targetResultCount }) => (
      execute(sourceIndex, targetResultCount)
    )));
    await onRoundComplete?.(batches, roundNumber, performance.now() - roundStartedAt);

    let deficitToRedistribute = 0;
    sourceIndexes.forEach((sourceIndex) => {
      if (redistributedUnavailableSources.has(sourceIndex) || !isUnavailable(sourceIndex)) return;
      redistributedUnavailableSources.add(sourceIndex);
      const targetResultCount = targets.get(sourceIndex) ?? 0;
      const actualResultCount = getResultCount(sourceIndex);
      deficitToRedistribute += Math.max(0, targetResultCount - actualResultCount);
      targets.set(sourceIndex, actualResultCount);
    });

    const redistributionTargets = sourceIndexes.filter((sourceIndex) => (
      !isUnavailable(sourceIndex) && canContinue(sourceIndex)
    ));
    for (let offset = 0; offset < deficitToRedistribute && redistributionTargets.length; offset += 1) {
      const sourceIndex = redistributionTargets[offset % redistributionTargets.length];
      targets.set(sourceIndex, (targets.get(sourceIndex) ?? getResultCount(sourceIndex)) + 1);
    }
    const resultCountAfterRound = sourceIndexes.reduce(
      (count, sourceIndex) => count + getResultCount(sourceIndex),
      0,
    );
    if (deficitToRedistribute === 0 && resultCountAfterRound <= resultCountBeforeRound) break;
  }

  resultCount = sourceIndexes.reduce((count, sourceIndex) => count + getResultCount(sourceIndex), 0);
  const quotaReached = sourceIndexes.every((sourceIndex) => (
    getResultCount(sourceIndex) >= (targets.get(sourceIndex) ?? 0)
  ));
  return { quotaReached, resultCount };
};

export const isBackgroundListingSourceUnavailableForQuota = ({
  resultCount,
  sourceExhausted,
  languageRejectLimitReached,
  safetyLimitReached,
}: {
  resultCount: number;
  sourceExhausted?: boolean;
  languageRejectLimitReached?: boolean;
  safetyLimitReached?: boolean;
}): boolean => (
  sourceExhausted === true
  || (
    Math.max(0, Math.floor(Number(resultCount) || 0)) === 0
    && (languageRejectLimitReached === true || safetyLimitReached === true)
  )
);

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
