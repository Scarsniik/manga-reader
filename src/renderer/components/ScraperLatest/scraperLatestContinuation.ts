import type { ListingBackgroundInput } from "@/shared/backgroundSearch";
import type { BackgroundListingRun } from "@/renderer/backgroundSearch/types";

type ScraperLatestSearchMode = NonNullable<ListingBackgroundInput["searchMode"]>;

export const resolveScraperLatestSearchMode = (
  searchMode: ListingBackgroundInput["searchMode"],
): ScraperLatestSearchMode => (
  searchMode === "deep"
    ? "deep"
    : searchMode === "continuous"
      ? "continuous"
      : "quick"
);

export const canContinueScraperLatestSearch = (
  searchMode: ScraperLatestSearchMode,
  runs: ReadonlyArray<Pick<BackgroundListingRun, "hasNextPage">>,
): boolean => (
  searchMode !== "continuous"
  && runs.some((run) => run.hasNextPage)
);

export const buildStoredScraperLatestContinuationRuns = (
  input: ListingBackgroundInput,
  runs: BackgroundListingRun[],
): BackgroundListingRun[] => {
  const runsByKey = new Map(runs.map((run) => [run.key, run]));
  return input.sources.flatMap((source) => {
    const run = runsByKey.get(source.id);
    if (!run) return [];
    return [{
      ...run,
      status: "waiting" as const,
      results: [],
      pendingResults: run.pendingResults ?? [],
      pendingCandidates: run.pendingCandidates ?? [],
      checkedPages: 0,
      checkpointUsed: false,
      excludedByLanguageCount: 0,
      includedByLanguageCount: 0,
      excludedByBlacklistedTagCount: 0,
    }];
  });
};
