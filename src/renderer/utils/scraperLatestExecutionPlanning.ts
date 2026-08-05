export type ScraperLatestRoundRobinSelection = {
  selectedIndexes: number[];
  nextIndex: number;
};

export type ScraperLatestBalancedBatch = {
  sourceIndex: number;
  requestedResultCount: number;
  targetResultCount: number;
};

export type ScraperLatestBalancedBatchPlan = {
  batches: ScraperLatestBalancedBatch[];
  nextPosition: number;
};

export type ScraperLatestFixedTarget = {
  sourceIndex: number;
  allocatedResultCount: number;
  targetResultCount: number;
};

type BalancedBatchPlanOptions = {
  sourceIndexes: number[];
  resultLimit: number;
  startPosition?: number;
  getResultCount: (sourceIndex: number) => number;
  canContinue: (sourceIndex: number) => boolean;
};

type PrefetchResult<Value> = {
  value?: Value;
  error?: unknown;
};

type PrefetchEntry<Value> = {
  requestKey: string;
  promise: Promise<PrefetchResult<Value>>;
};

export type ScraperListingPagePrefetchEvent = {
  type: "preload-started" | "preload-reused" | "preload-replaced" | "load-hit" | "load-miss" | "load-replaced" | "cleared";
  sourceKey?: string;
  requestKey?: string;
  replacedRequestKey?: string;
  entryCount?: number;
};

export type ScraperListingPagePrefetchCache<Value> = {
  preload: (sourceKey: string, requestKey: string, loader: () => Promise<Value>) => void;
  load: (sourceKey: string, requestKey: string, loader: () => Promise<Value>) => Promise<Value>;
  clear: () => void;
};

const normalizeCount = (value: unknown): number => Math.max(0, Math.floor(Number(value) || 0));

export const allocateScraperLatestFixedTargets = (
  sourceIndexes: number[],
  resultLimit: number,
  getInitialResultCount: (sourceIndex: number) => number = () => 0,
  appendToExistingResults = false,
): ScraperLatestFixedTarget[] => {
  if (!sourceIndexes.length) return [];

  const normalizedLimit = normalizeCount(resultLimit);
  const baseTarget = Math.floor(normalizedLimit / sourceIndexes.length);
  const remainder = normalizedLimit % sourceIndexes.length;

  return sourceIndexes.map((sourceIndex, position) => {
    const allocatedResultCount = baseTarget + (position < remainder ? 1 : 0);
    const initialResultCount = normalizeCount(getInitialResultCount(sourceIndex));
    return {
      sourceIndex,
      allocatedResultCount,
      targetResultCount: appendToExistingResults
        ? initialResultCount + allocatedResultCount
        : allocatedResultCount,
    };
  });
};

export const resolveScraperLatestTotalGroupKey = (run: {
  key: string;
  sourceKind: "scraper" | "tagFavorite";
  favorite?: { id: string };
}): string => run.sourceKind === "scraper"
  ? "scraper"
  : `tagFavorite:${run.favorite?.id || run.key}`;

export const selectScraperLatestRoundRobinIndexes = (
  runnableIndexes: boolean[],
  maxSelectionCount: number,
  startIndex: number,
): ScraperLatestRoundRobinSelection => {
  if (!runnableIndexes.length || maxSelectionCount <= 0) {
    return { selectedIndexes: [], nextIndex: 0 };
  }

  const normalizedStartIndex = normalizeCount(startIndex) % runnableIndexes.length;
  const normalizedSelectionCount = normalizeCount(maxSelectionCount);
  const selectedIndexes: number[] = [];

  for (let offset = 0; offset < runnableIndexes.length; offset += 1) {
    const index = (normalizedStartIndex + offset) % runnableIndexes.length;
    if (!runnableIndexes[index]) {
      continue;
    }

    selectedIndexes.push(index);
    if (selectedIndexes.length >= normalizedSelectionCount) {
      break;
    }
  }

  return {
    selectedIndexes,
    nextIndex: selectedIndexes.length
      ? (selectedIndexes[selectedIndexes.length - 1] + 1) % runnableIndexes.length
      : normalizedStartIndex,
  };
};

export const planScraperLatestBalancedBatches = ({
  sourceIndexes,
  resultLimit,
  startPosition = 0,
  getResultCount,
  canContinue,
}: BalancedBatchPlanOptions): ScraperLatestBalancedBatchPlan => {
  if (!sourceIndexes.length) {
    return { batches: [], nextPosition: 0 };
  }

  const normalizedLimit = normalizeCount(resultLimit);
  const resultCounts = sourceIndexes.map((sourceIndex) => normalizeCount(getResultCount(sourceIndex)));
  const currentResultCount = resultCounts.reduce((count, resultCount) => count + resultCount, 0);
  let remainingResultCount = Math.max(0, normalizedLimit - currentResultCount);
  let nextPosition = normalizeCount(startPosition) % sourceIndexes.length;
  const requestedResultCounts = sourceIndexes.map(() => 0);
  const firstAllocationOrder: number[] = [];

  while (remainingResultCount > 0) {
    const runnablePositions = sourceIndexes
      .map((sourceIndex, position) => ({ sourceIndex, position }))
      .filter(({ sourceIndex }) => canContinue(sourceIndex));
    if (!runnablePositions.length) {
      break;
    }

    const lowestProjectedCount = Math.min(...runnablePositions.map(({ position }) => (
      resultCounts[position] + requestedResultCounts[position]
    )));
    let selectedPosition: number | null = null;

    for (let offset = 0; offset < sourceIndexes.length; offset += 1) {
      const position = (nextPosition + offset) % sourceIndexes.length;
      if (
        canContinue(sourceIndexes[position])
        && resultCounts[position] + requestedResultCounts[position] === lowestProjectedCount
      ) {
        selectedPosition = position;
        break;
      }
    }

    if (selectedPosition === null) {
      break;
    }

    if (requestedResultCounts[selectedPosition] === 0) {
      firstAllocationOrder.push(selectedPosition);
    }
    requestedResultCounts[selectedPosition] += 1;
    remainingResultCount -= 1;
    nextPosition = (selectedPosition + 1) % sourceIndexes.length;
  }

  return {
    batches: firstAllocationOrder.map((position) => ({
      sourceIndex: sourceIndexes[position],
      requestedResultCount: requestedResultCounts[position],
      targetResultCount: resultCounts[position] + requestedResultCounts[position],
    })),
    nextPosition,
  };
};

export const resolveScraperLatestTotalTarget = (
  currentResultCount: number,
  resultLimit: number,
  preserveCurrentResults: boolean,
): number => {
  const normalizedCurrentResultCount = normalizeCount(currentResultCount);
  const normalizedResultLimit = Math.max(1, normalizeCount(resultLimit));
  return preserveCurrentResults
    ? normalizedCurrentResultCount + normalizedResultLimit
    : normalizedResultLimit;
};

export const buildScraperListingPageRequestKey = (
  pageIndex: number,
  nextPageUrl?: string,
): string => `${normalizeCount(pageIndex)}:${String(nextPageUrl ?? "").trim()}`;

export const createScraperListingPagePrefetchCache = <Value>(
  onEvent?: (event: ScraperListingPagePrefetchEvent) => void,
): ScraperListingPagePrefetchCache<Value> => {
  const entries = new Map<string, PrefetchEntry<Value>>();
  const createEntry = (requestKey: string, loader: () => Promise<Value>): PrefetchEntry<Value> => ({
    requestKey,
    promise: loader().then(
      (value) => ({ value }),
      (error) => ({ error }),
    ),
  });
  const resolveEntry = async (entry: PrefetchEntry<Value>): Promise<Value> => {
    const result = await entry.promise;
    if (result.error !== undefined) {
      throw result.error;
    }
    return result.value as Value;
  };

  return {
    preload: (sourceKey, requestKey, loader) => {
      const existingEntry = entries.get(sourceKey);
      if (existingEntry?.requestKey === requestKey) {
        onEvent?.({ type: "preload-reused", sourceKey, requestKey });
        return;
      }
      if (existingEntry) {
        onEvent?.({
          type: "preload-replaced",
          sourceKey,
          requestKey,
          replacedRequestKey: existingEntry.requestKey,
        });
      } else {
        onEvent?.({ type: "preload-started", sourceKey, requestKey });
      }
      entries.set(sourceKey, createEntry(requestKey, loader));
    },
    load: async (sourceKey, requestKey, loader) => {
      const existingEntry = entries.get(sourceKey);
      if (existingEntry?.requestKey === requestKey) {
        entries.delete(sourceKey);
        onEvent?.({ type: "load-hit", sourceKey, requestKey });
        return resolveEntry(existingEntry);
      }

      if (existingEntry) {
        entries.delete(sourceKey);
        onEvent?.({
          type: "load-replaced",
          sourceKey,
          requestKey,
          replacedRequestKey: existingEntry.requestKey,
        });
      } else {
        onEvent?.({ type: "load-miss", sourceKey, requestKey });
      }
      return resolveEntry(createEntry(requestKey, loader));
    },
    clear: () => {
      if (entries.size > 0) {
        onEvent?.({ type: "cleared", entryCount: entries.size });
      }
      entries.clear();
    },
  };
};
