import type { ListingBackgroundInput } from "@/shared/backgroundSearch";
import type { BackgroundListingRun } from "@/renderer/backgroundSearch/types";

export { buildStoredScraperLatestContinuationRuns } from "@/shared/scraperLatestContinuation";

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
