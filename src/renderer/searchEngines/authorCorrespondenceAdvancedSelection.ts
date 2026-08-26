import { buildMultiSearchSourceIdentityKey } from "@/renderer/components/MultiSearch/multiSearchMerge";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

export type AuthorCorrespondenceAdvancedSeed = {
  key: string;
  anchorSourceKeys: string[];
  result: MultiSearchMergedResult;
  referenceSource: MultiSearchSourceResult;
};

const normalizeAdvancedBatchSize = (batchSize: number): number => {
  if (!Number.isFinite(batchSize)) return 1;
  const flooredBatchSize = Math.floor(batchSize);
  if (flooredBatchSize === 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, flooredBatchSize);
};

export const resolveAuthorCorrespondenceAdvancedBatchSize = (options: {
  batchSize: number;
  cachedMangaCount: number;
  requestedBatchCount: number;
  requestedProcessedMangaCount?: number;
}): number => {
  const batchSize = normalizeAdvancedBatchSize(options.batchSize);
  if (batchSize === Number.MAX_SAFE_INTEGER) return batchSize;
  const legacyRequestedMangaCount = Math.max(
    1,
    Math.floor(options.requestedBatchCount),
  ) * batchSize;
  const requestedMangaCount = Math.max(
    0,
    Math.floor(options.requestedProcessedMangaCount ?? legacyRequestedMangaCount),
  );
  return Math.min(
    batchSize,
    Math.max(0, requestedMangaCount - Math.max(0, options.cachedMangaCount)),
  );
};

export const selectAuthorCorrespondenceAdvancedSeeds = (
  results: MultiSearchMergedResult[],
  authorSourceKeys: Set<string>,
  processedMangaKeys: Set<string>,
  batchSize: number,
): AuthorCorrespondenceAdvancedSeed[] => results.flatMap((result) => {
  const anchorSourceKeys = result.sources
    .map(buildMultiSearchSourceIdentityKey)
    .filter((sourceKey) => authorSourceKeys.has(sourceKey))
    .sort();
  const key = anchorSourceKeys[0];
  const referenceSource = result.sources.find((source) => (
    source.canOpenDetails && Boolean(source.result.detailUrl?.trim())
  ));
  const alreadyProcessed = anchorSourceKeys.some((sourceKey) => processedMangaKeys.has(sourceKey));
  return key && referenceSource && !alreadyProcessed
    ? [{ key, anchorSourceKeys, result, referenceSource }]
    : [];
}).slice(0, normalizeAdvancedBatchSize(batchSize));
