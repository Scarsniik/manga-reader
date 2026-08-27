import type { ListingBackgroundInput } from "./backgroundSearch";

export type ScraperLatestContinuationRun = {
  key: string;
  status: string;
  results: unknown[];
  pendingResults?: unknown[];
  pendingCandidates?: unknown[];
  checkedPages?: number;
  checkpointUsed?: boolean;
  deepScanPhaseStarted?: boolean;
  excludedByLanguageCount?: number;
  includedByLanguageCount?: number;
  excludedByBlacklistedTagCount?: number;
};

export type ScraperLatestContinuationResult = {
  runs: ScraperLatestContinuationRun[];
  executionFingerprint?: string;
};

export const buildStoredScraperLatestContinuationRuns = <
  Run extends ScraperLatestContinuationRun,
>(
  input: Pick<ListingBackgroundInput, "searchMode" | "sources">,
  runs: readonly Run[],
): Run[] => {
  const runsByKey = new Map(runs.map((run) => [run.key, run]));
  return input.sources.flatMap((source) => {
    const run = runsByKey.get(source.id);
    if (!run) return [];
    return [{
      ...run,
      status: "waiting",
      results: [],
      pendingResults: run.pendingResults ?? [],
      pendingCandidates: run.pendingCandidates ?? [],
      checkedPages: 0,
      checkpointUsed: false,
      ...(
        run.deepScanPhaseStarted === true
        || (input.searchMode === "deep" && run.checkpointUsed === true)
          ? { deepScanPhaseStarted: true }
          : {}
      ),
      excludedByLanguageCount: 0,
      includedByLanguageCount: 0,
      excludedByBlacklistedTagCount: 0,
    } as Run];
  });
};

export const buildStoredScraperLatestContinuationResult = <
  Run extends ScraperLatestContinuationRun,
  Result extends { runs: Run[] },
>(
  input: Pick<ListingBackgroundInput, "searchMode" | "sources">,
  result: Result,
): Result => ({
  ...result,
  runs: buildStoredScraperLatestContinuationRuns(input, result.runs),
});
