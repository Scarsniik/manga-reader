import React from "react";
import type {
  BackgroundSearchChangeEvent,
  BackgroundSearchJob,
  BackgroundSearchProgress,
  BackgroundSearchQueueSummary,
} from "@/shared/backgroundSearch";
import { executeBackgroundSearch } from "@/renderer/searchEngines/searchEngineRegistry";
import type { BackgroundSearchExecutionResult, ListingBackgroundResult } from "@/renderer/backgroundSearch/types";
import type { ListingBackgroundInput } from "@/shared/backgroundSearch";
import type { ScraperAuthorFavoriteCacheRecord } from "@/shared/scraper";
import {
  buildCompleteAuthorFavoriteCache,
  buildLatestAuthorCacheUpdates,
  mergeAuthorFavoriteCacheUpdate,
} from "@/renderer/utils/scraperAuthorFavoriteCache";
import {
  automaticallyReuseExistingAuthorSearch,
  importLinkedAuthorSearchIntoManga,
  refreshMangaSearchesUsingAuthor,
} from "@/renderer/backgroundSearch/linkedAuthorSearchOrchestration";
const PROGRESS_UPDATE_THROTTLE_MS = 1000;
const RESULT_CHECKPOINT_THROTTLE_MS = 5000;

const buildAuthorResultCheckpointSignature = (
  result: BackgroundSearchExecutionResult,
): string | null => {
  if (!("searchedNames" in result)) return null;
  return [
    result.matches.length,
    result.searchedNames.length,
    result.rejectedAuthorCandidates?.length ?? 0,
  ].join(":");
};

type PendingSnapshot = {
  progress: BackgroundSearchProgress;
  result?: BackgroundSearchExecutionResult;
};

const persistAuthorFavoriteCache = async (
  job: BackgroundSearchJob,
  result: BackgroundSearchExecutionResult,
): Promise<void> => {
  if (
    (job.metadata.kind !== "authorFavoriteRefresh" && job.metadata.kind !== "latestAuthors")
    || !("runs" in result)
  ) {
    return;
  }
  const input = job.input as ListingBackgroundInput;
  const listingResult = result as ListingBackgroundResult;
  const api = window.api ?? {};
  if (typeof api.saveScraperAuthorFavoriteCache !== "function") return;

  if (job.metadata.kind === "authorFavoriteRefresh") {
    const cache = buildCompleteAuthorFavoriteCache(input, listingResult);
    if (cache) {
      await api.saveScraperAuthorFavoriteCache({ favoriteId: cache.favoriteId, cache });
    }
    return;
  }

  if (typeof api.getScraperAuthorFavoriteCache !== "function") return;
  const updates = buildLatestAuthorCacheUpdates(input, listingResult);
  await Promise.all(Array.from(updates.entries()).map(async ([favoriteId, update]) => {
    const existingCache = await api.getScraperAuthorFavoriteCache(
      favoriteId,
    ) as ScraperAuthorFavoriteCacheRecord | null;
    const cache = mergeAuthorFavoriteCacheUpdate(existingCache, update);
    await api.saveScraperAuthorFavoriteCache({ favoriteId, cache });
  }));
};

const isBackgroundSearchRunnerWindow = (): boolean => (
  window.location.hash.startsWith("#/background-search-runner")
);

const getCompletedProgress = (result: BackgroundSearchExecutionResult): BackgroundSearchProgress => {
  if ("runs" in result) {
    const resultCount = result.runs.reduce((count, run) => count + run.results.length, 0);
    return {
      completedUnits: result.runs.length,
      totalUnits: result.runs.length,
      resultCount,
      excludedResultCount: result.runs.reduce(
        (count, run) => count
          + ("excludedByBlacklistedTagCount" in run
            ? run.excludedByBlacklistedTagCount ?? 0
            : 0)
          + ("excludedByOriginalCount" in run
            ? run.excludedByOriginalCount ?? 0
            : 0),
        0,
      ),
    };
  }
  const completedUnits = "searchedNames" in result
    ? result.searchedNames.length
    : result.searchedTitles.length + result.searchedAuthors.length;
  return {
    completedUnits,
    totalUnits: completedUnits,
    resultCount: result.matches.length,
  };
};

export default function BackgroundSearchRunner() {
  const controllersRef = React.useRef(new Map<string, AbortController>());
  const runningRef = React.useRef(new Set<string>());
  const pendingSnapshotsRef = React.useRef(new Map<string, PendingSnapshot>());
  const latestResultsRef = React.useRef(new Map<string, BackgroundSearchExecutionResult>());
  const updateTimersRef = React.useRef(new Map<string, number>());
  const lastResultCheckpointAtRef = React.useRef(new Map<string, number>());
  const lastAuthorResultSignatureRef = React.useRef(new Map<string, string>());
  const maxConcurrentRef = React.useRef(3);
  const processingRelationsRef = React.useRef(new Set<string>());
  const processingCompletedAutomationsRef = React.useRef(new Set<string>());

  const flushSnapshot = React.useCallback(async (jobId: string, forceLatestResult = false) => {
    const snapshot = pendingSnapshotsRef.current.get(jobId);
    pendingSnapshotsRef.current.delete(jobId);
    const timer = updateTimersRef.current.get(jobId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      updateTimersRef.current.delete(jobId);
    }
    if (!snapshot || typeof window.api?.updateBackgroundSearch !== "function") return;
    await window.api.updateBackgroundSearch({
      jobId,
      ...snapshot,
      ...(forceLatestResult ? { result: latestResultsRef.current.get(jobId) ?? snapshot.result } : {}),
    });
  }, []);

  const queueSnapshot = React.useCallback((
    jobId: string,
    result: BackgroundSearchExecutionResult,
    progress: BackgroundSearchProgress,
  ): Promise<void> => {
    latestResultsRef.current.set(jobId, result);
    const now = Date.now();
    const lastCheckpointAt = lastResultCheckpointAtRef.current.get(jobId) ?? 0;
    const authorResultSignature = buildAuthorResultCheckpointSignature(result);
    const authorResultChanged = authorResultSignature !== null
      && lastAuthorResultSignatureRef.current.get(jobId) !== authorResultSignature;
    const shouldCheckpointResult = authorResultChanged
      || now - lastCheckpointAt >= RESULT_CHECKPOINT_THROTTLE_MS;
    const previous = pendingSnapshotsRef.current.get(jobId);
    pendingSnapshotsRef.current.set(jobId, {
      progress,
      result: shouldCheckpointResult ? result : previous?.result,
    });
    if (shouldCheckpointResult) {
      lastResultCheckpointAtRef.current.set(jobId, now);
      if (authorResultSignature !== null) {
        lastAuthorResultSignatureRef.current.set(jobId, authorResultSignature);
      }
    }
    if (!updateTimersRef.current.has(jobId)) {
      const timer = window.setTimeout(() => {
        void flushSnapshot(jobId);
      }, PROGRESS_UPDATE_THROTTLE_MS);
      updateTimersRef.current.set(jobId, timer);
    }
    return Promise.resolve();
  }, [flushSnapshot]);

  const runClaimedJob = React.useCallback(async (job: BackgroundSearchJob) => {
    const jobId = job.metadata.id;
    const controller = new AbortController();
    controllersRef.current.set(jobId, controller);
    runningRef.current.add(jobId);
    try {
      const result = await executeBackgroundSearch(
        job,
        controller.signal,
        (snapshot, progress) => queueSnapshot(jobId, snapshot, progress),
      );
      await flushSnapshot(jobId, controller.signal.aborted);
      if ("runs" in result && result.runs.length > 0 && result.runs.every((run) => run.status === "error")) {
        throw new Error(result.runs.find((run) => run.error)?.error || "Toutes les sources ont échoué.");
      }
      const progress = getCompletedProgress(result);
      await persistAuthorFavoriteCache(job, result);
      await window.api.completeBackgroundSearch({ jobId, result, progress });
    } catch (error) {
      await flushSnapshot(jobId, controller.signal.aborted);
      if (!controller.signal.aborted) {
        await window.api.failBackgroundSearch(
          jobId,
          error instanceof Error ? error.message : "Echec de la recherche en arriere-plan.",
        );
      }
    } finally {
      controllersRef.current.delete(jobId);
      runningRef.current.delete(jobId);
      latestResultsRef.current.delete(jobId);
      lastResultCheckpointAtRef.current.delete(jobId);
      lastAuthorResultSignatureRef.current.delete(jobId);
      window.dispatchEvent(new CustomEvent("background-search-runner-slot-available"));
    }
  }, [flushSnapshot, queueSnapshot]);

  const claimAvailableJobs = React.useCallback(async () => {
    if (!isBackgroundSearchRunnerWindow() || typeof window.api?.getBackgroundSearchQueue !== "function") return;
    const settings = await window.api?.getSettings?.();
    maxConcurrentRef.current = Math.min(8, Math.max(
      1,
      Math.floor(settings?.backgroundSearchMaxConcurrent ?? maxConcurrentRef.current),
    ));
    let queue = await window.api.getBackgroundSearchQueue() as BackgroundSearchQueueSummary;
    const pendingRelations = queue.jobs.filter((job) => (
      job.kind === "authorCorrespondence"
      && job.status === "completed"
      && job.relation?.autoImportOnCompletion === true
      && (job.relation.automationStatus === "pending" || job.relation.automationStatus === "processing")
      && !processingRelationsRef.current.has(job.id)
    ));
    for (const linkedJob of pendingRelations) {
      processingRelationsRef.current.add(linkedJob.id);
      try {
        await importLinkedAuthorSearchIntoManga({
          authorJobId: linkedJob.id,
          automatic: true,
        });
      } catch (error) {
        console.warn("Failed to import a linked author search", error);
      } finally {
        processingRelationsRef.current.delete(linkedJob.id);
      }
    }
    if (pendingRelations.length) {
      queue = await window.api.getBackgroundSearchQueue() as BackgroundSearchQueueSummary;
    }
    const availableSlots = Math.max(0, maxConcurrentRef.current - runningRef.current.size);
    if (availableSlots === 0) return;
    const candidates = queue.jobs
      .filter((job) => job.status === "queued")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, availableSlots);
    await Promise.all(candidates.map(async (candidate) => {
      const claimed = await window.api.claimBackgroundSearchJob(candidate.id) as BackgroundSearchJob | null;
      if (claimed) void runClaimedJob(claimed);
    }));
  }, [runClaimedJob]);

  const processCompletedJobAutomations = React.useCallback(async (jobId: string) => {
    if (
      processingCompletedAutomationsRef.current.has(jobId)
      || typeof window.api?.getBackgroundSearchJob !== "function"
    ) {
      return;
    }
    processingCompletedAutomationsRef.current.add(jobId);
    try {
      const job = await window.api.getBackgroundSearchJob(jobId) as BackgroundSearchJob | null;
      if (!job || job.metadata.status !== "completed") return;
      if (job.metadata.kind === "mangaCorrespondence" && job.metadata.prefilled !== true) {
        await automaticallyReuseExistingAuthorSearch(jobId);
      } else if (job.metadata.kind === "authorCorrespondence") {
        await refreshMangaSearchesUsingAuthor(jobId);
      }
    } catch (error) {
      console.warn("Failed to process reusable correspondence search automation", error);
    } finally {
      processingCompletedAutomationsRef.current.delete(jobId);
    }
  }, []);

  React.useEffect(() => {
    if (!isBackgroundSearchRunnerWindow()) return undefined;
    let disposed = false;
    void (async () => {
      try {
        const settings = await window.api?.getSettings?.();
        if (!disposed) {
          maxConcurrentRef.current = Math.min(8, Math.max(1, Math.floor(settings?.backgroundSearchMaxConcurrent ?? 3)));
          await claimAvailableJobs();
        }
      } catch (error) {
        console.warn("Failed to initialize the background search runner", error);
      }
    })();

    const handleChange = (event: BackgroundSearchChangeEvent) => {
      if (event.status === "cancelled") {
        controllersRef.current.get(event.jobId)?.abort();
      }
      if (event.status === "queued") void claimAvailableJobs();
      if (event.status === "completed") {
        void processCompletedJobAutomations(event.jobId).finally(() => claimAvailableJobs());
      }
    };
    const unsubscribe = window.api?.onBackgroundSearchChanged?.(handleChange);
    const handleSlot = () => { void claimAvailableJobs(); };
    const handleSettingsUpdated = (event: Event) => {
      const settings = event instanceof CustomEvent ? event.detail?.settings : null;
      if (!settings) return;
      maxConcurrentRef.current = Math.min(8, Math.max(
        1,
        Math.floor(settings.backgroundSearchMaxConcurrent ?? maxConcurrentRef.current),
      ));
      void claimAvailableJobs();
    };
    window.addEventListener("background-search-runner-slot-available", handleSlot);
    window.addEventListener("settings-updated", handleSettingsUpdated);
    return () => {
      disposed = true;
      if (typeof unsubscribe === "function") unsubscribe();
      window.removeEventListener("background-search-runner-slot-available", handleSlot);
      window.removeEventListener("settings-updated", handleSettingsUpdated);
    };
  }, [claimAvailableJobs, processCompletedJobAutomations]);

  return null;
}
