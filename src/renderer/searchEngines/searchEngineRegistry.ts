import type {
  AuthorCorrespondenceBackgroundInput,
  BackgroundSearchJob,
  BackgroundSearchKind,
  BackgroundSearchProgress,
  ListingBackgroundInput,
  MangaCorrespondenceBackgroundInput,
  MultiSearchBackgroundInput,
} from "@/shared/backgroundSearch";
import type {
  AuthorCorrespondenceBackgroundResult,
  BackgroundSearchExecutionResult,
  ListingBackgroundResult,
  MangaCorrespondenceBackgroundResult,
} from "@/renderer/backgroundSearch/types";
import { runMultiSearchEngine } from "@/renderer/searchEngines/multiSearchEngine";
import {
  runAuthorFavoriteRefreshSearchEngine,
  runLatestAuthorsSearchEngine,
  runScraperAuthorSearchEngine,
  runScraperLatestSearch,
} from "@/renderer/searchEngines/listingSearchEngine";
import { runMangaCorrespondenceSearch } from "@/renderer/searchEngines/mangaCorrespondenceSearchEngine";
import { runAuthorCorrespondenceSearch } from "@/renderer/searchEngines/authorCorrespondenceSearchEngine";
import { createSearchExecutionContext } from "@/renderer/searchEngines/searchExecutionContext";
import {
  finishScraperLatestDiagnosticSession,
  startScraperLatestDiagnosticSession,
} from "@/renderer/utils/scraperLatestDiagnostics";

export type SearchEngineSnapshotCallback = (
  result: BackgroundSearchExecutionResult,
  progress: BackgroundSearchProgress,
) => Promise<void>;

export const executeBackgroundSearch = async (
  job: BackgroundSearchJob,
  signal: AbortSignal,
  onSnapshot: SearchEngineSnapshotCallback,
): Promise<BackgroundSearchExecutionResult> => {
  const runtimeSettings = await window.api?.getSettings?.().catch(() => null);
  const diagnosticEnabled = runtimeSettings?.scraperPerformanceReportsEnabled === true
    || runtimeSettings?.scraperLatestPerformanceReportsEnabled === true;
  const inputRecord = job.input as Record<string, unknown>;
  const sourceCount = Array.isArray(inputRecord.sources)
    ? inputRecord.sources.length
    : Array.isArray(inputRecord.scrapers)
      ? inputRecord.scrapers.length
      : 0;
  const configuredConcurrency = Number(inputRecord.scrapingConcurrency ?? inputRecord.concurrency) || 1;
  const diagnosticSession = diagnosticEnabled && job.metadata.kind !== "latestSources"
    ? await startScraperLatestDiagnosticSession({
      mode: "background",
      searchKind: job.metadata.kind,
      concurrency: Math.max(1, Math.floor(configuredConcurrency)),
      sourceCount,
      backgroundJobId: job.metadata.id,
    })
    : null;
  const executionContext = createSearchExecutionContext({
    kind: job.metadata.kind,
    mode: "background",
    backgroundJobId: job.metadata.id,
    persistDocuments: job.metadata.kind === "mangaCorrespondence"
      || job.metadata.kind === "authorCorrespondence",
    diagnostics: diagnosticSession ? {
      profileId: diagnosticSession.profileId,
      purpose: `engine.${job.metadata.kind}`,
    } : undefined,
  });
  const expectedExecutionFingerprint = executionContext.checkpointAdapter.fingerprint(job.input);
  const previousRuns = job.result
    && "runs" in (job.result as BackgroundSearchExecutionResult)
    && (job.result as { executionFingerprint?: string }).executionFingerprint === expectedExecutionFingerprint
    ? (job.result as { runs: any[] }).runs
    : undefined;
  const runLatestSources = async (): Promise<ListingBackgroundResult> => {
    const input = job.input as ListingBackgroundInput;
    return runScraperLatestSearch(input, signal, onSnapshot, {
      mode: "background",
      backgroundJobId: job.metadata.id,
      initialRuns: previousRuns,
      executionContext,
    });
  };
  const adapters: Record<BackgroundSearchKind, () => Promise<BackgroundSearchExecutionResult>> = {
    multiSearch: () => runMultiSearchEngine(
      job.input as MultiSearchBackgroundInput,
      signal,
      onSnapshot,
      { initialRuns: previousRuns, executionContext },
    ),
    mangaCorrespondence: () => runMangaCorrespondenceSearch(
      job.input as MangaCorrespondenceBackgroundInput,
      signal,
      onSnapshot,
      job.result && "matches" in (job.result as BackgroundSearchExecutionResult)
        ? job.result as MangaCorrespondenceBackgroundResult
        : undefined,
      executionContext,
    ),
    authorCorrespondence: () => runAuthorCorrespondenceSearch(
      job.input as AuthorCorrespondenceBackgroundInput,
      signal,
      onSnapshot,
      executionContext,
      job.result && "searchedNames" in (job.result as BackgroundSearchExecutionResult)
        ? job.result as AuthorCorrespondenceBackgroundResult
        : undefined,
    ),
    scraperAuthor: () => runScraperAuthorSearchEngine(
      job.input as ListingBackgroundInput,
      signal,
      onSnapshot,
      { initialRuns: previousRuns, executionContext },
    ),
    latestSources: runLatestSources,
    latestAuthors: () => runLatestAuthorsSearchEngine(
      job.input as ListingBackgroundInput,
      signal,
      onSnapshot,
      { initialRuns: previousRuns, executionContext },
    ),
    authorFavoriteRefresh: () => runAuthorFavoriteRefreshSearchEngine(
      job.input as ListingBackgroundInput,
      signal,
      onSnapshot,
      { initialRuns: previousRuns, executionContext },
    ),
  };

  let status: "completed" | "cancelled" | "error" = "completed";
  try {
    return await adapters[job.metadata.kind]();
  } catch (error) {
    status = signal.aborted ? "cancelled" : "error";
    throw error;
  } finally {
    await finishScraperLatestDiagnosticSession(diagnosticSession, status, {
      searchKind: job.metadata.kind,
      memoryRequestCount: executionContext.requestCache.size,
    });
  }
};
