import { useMemo, useRef } from "react";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import {
  mergeMultiSearchSourceIntoGroups,
  sortMultiSearchMergedResults,
} from "@/renderer/components/MultiSearch/multiSearchUtils";

type MergeCache = {
  groups: MultiSearchMergedResult[];
  sortedGroups: MultiSearchMergedResult[];
  sourceCount: number;
  sourceRefs: WeakSet<MultiSearchSourceResult>;
  refreshKey: number;
};

const buildMergeCache = (
  sources: MultiSearchSourceResult[],
  refreshKey: number,
): MergeCache => {
  const groups: MultiSearchMergedResult[] = [];
  const sourceRefs = new WeakSet<MultiSearchSourceResult>();

  sources.forEach((source) => {
    mergeMultiSearchSourceIntoGroups(groups, source);
    sourceRefs.add(source);
  });

  return {
    groups,
    sortedGroups: sortMultiSearchMergedResults(groups),
    sourceCount: sources.length,
    sourceRefs,
    refreshKey,
  };
};

const shouldRebuildMergeCache = (
  cache: MergeCache,
  sources: MultiSearchSourceResult[],
  refreshKey: number,
): boolean => (
  cache.refreshKey !== refreshKey
  || sources.length < cache.sourceCount
  || (
    sources.length > 0
    && cache.sourceCount > 0
    && sources.every((source) => !cache.sourceRefs.has(source))
  )
);

export default function useIncrementalMultiSearchMerge(
  sources: MultiSearchSourceResult[],
  refreshKey: number,
): MultiSearchMergedResult[] {
  const cacheRef = useRef<MergeCache>(buildMergeCache([], refreshKey));

  return useMemo(() => {
    const cache = cacheRef.current;

    if (shouldRebuildMergeCache(cache, sources, refreshKey)) {
      cacheRef.current = buildMergeCache(sources, refreshKey);
      return cacheRef.current.sortedGroups;
    }

    const newSources = sources.filter((source) => !cache.sourceRefs.has(source));
    if (!newSources.length && cache.sourceCount === sources.length) {
      return cache.sortedGroups;
    }

    if (newSources.length && cache.sourceCount === sources.length) {
      cacheRef.current = buildMergeCache(sources, refreshKey);
      return cacheRef.current.sortedGroups;
    }

    newSources.forEach((source) => {
      mergeMultiSearchSourceIntoGroups(cache.groups, source);
      cache.sourceRefs.add(source);
    });

    cache.sourceCount = sources.length;
    cache.sortedGroups = sortMultiSearchMergedResults(cache.groups);
    return cache.sortedGroups;
  }, [refreshKey, sources]);
}
