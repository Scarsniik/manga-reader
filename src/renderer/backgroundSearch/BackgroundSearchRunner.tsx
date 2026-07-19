import React from "react";
import type {
  BackgroundSearchChangeEvent,
  BackgroundSearchJob,
  BackgroundSearchProgress,
  BackgroundSearchQueueSummary,
} from "@/shared/backgroundSearch";
import { executeBackgroundSearch } from "@/renderer/backgroundSearch/backgroundSearchEngine";
import type { BackgroundSearchExecutionResult, ListingBackgroundResult } from "@/renderer/backgroundSearch/types";
import type { ListingBackgroundInput } from "@/shared/backgroundSearch";
import type { ScraperAuthorFavoriteCacheRecord } from "@/shared/scraper";
import {
  queuePendingBackgroundSearchOpen,
  requestBackgroundSearchOpenInCurrentView,
} from "@/renderer/backgroundSearch/backgroundSearchNavigation";

const UPDATE_THROTTLE_MS = 450;

type PendingSnapshot = {
  progress: BackgroundSearchProgress;
  result: BackgroundSearchExecutionResult;
};

const persistAuthorFavoriteCache = async (
  job: BackgroundSearchJob,
  result: BackgroundSearchExecutionResult,
): Promise<void> => {
  if (job.metadata.kind !== "authorFavoriteRefresh") return;
  const input = job.input as ListingBackgroundInput;
  if (!input.favoriteId || !("runs" in result)) return;
  const listingResult = result as ListingBackgroundResult;
  if (listingResult.runs.some((run) => run.status === "error" || run.hasNextPage)) return;
  const api = window.api ?? {};
  if (typeof api.saveScraperAuthorFavoriteCache !== "function") return;
  const timestamp = new Date().toISOString();
  const cache: ScraperAuthorFavoriteCacheRecord = {
    favoriteId: input.favoriteId,
    favoriteUpdatedAt: input.favoriteUpdatedAt,
    cachedAt: timestamp,
    completedAt: timestamp,
    sources: listingResult.runs.map((run) => ({
      key: run.key,
      scraperId: run.scraper.id,
      authorUrl: run.query,
      sourceName: run.name,
      loadedPages: run.loadedPages,
      hasNextPage: run.hasNextPage,
      currentPageUrl: run.currentPageUrl,
      nextPageUrl: run.nextPageUrl,
      results: run.results.map((source) => ({
        pageIndex: source.pageIndex,
        searchTerm: source.searchTerm,
        result: source.result,
      })),
      updatedAt: timestamp,
    })),
  };
  await api.saveScraperAuthorFavoriteCache({ favoriteId: input.favoriteId, cache });
};

const isMainApplicationWindow = (): boolean => !window.location.hash.startsWith("#/workspace");

const getCompletedProgress = (result: BackgroundSearchExecutionResult): BackgroundSearchProgress => {
  if ("runs" in result) {
    const resultCount = result.runs.reduce((count, run) => count + run.results.length, 0);
    return {
      completedUnits: result.runs.length,
      totalUnits: result.runs.length,
      resultCount,
    };
  }
  const completedUnits = result.searchedTitles.length + result.searchedAuthors.length;
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
  const updateTimersRef = React.useRef(new Map<string, number>());
  const maxConcurrentRef = React.useRef(3);

  const flushSnapshot = React.useCallback(async (jobId: string) => {
    const snapshot = pendingSnapshotsRef.current.get(jobId);
    pendingSnapshotsRef.current.delete(jobId);
    const timer = updateTimersRef.current.get(jobId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      updateTimersRef.current.delete(jobId);
    }
    if (!snapshot || typeof window.api?.updateBackgroundSearch !== "function") return;
    await window.api.updateBackgroundSearch({ jobId, ...snapshot });
  }, []);

  const queueSnapshot = React.useCallback((
    jobId: string,
    result: BackgroundSearchExecutionResult,
    progress: BackgroundSearchProgress,
  ): Promise<void> => {
    pendingSnapshotsRef.current.set(jobId, { result, progress });
    if (!updateTimersRef.current.has(jobId)) {
      const timer = window.setTimeout(() => {
        void flushSnapshot(jobId);
      }, UPDATE_THROTTLE_MS);
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
      await flushSnapshot(jobId);
      if ("runs" in result && result.runs.length > 0 && result.runs.every((run) => run.status === "error")) {
        throw new Error(result.runs.find((run) => run.error)?.error || "Toutes les sources ont échoué.");
      }
      const progress = getCompletedProgress(result);
      await persistAuthorFavoriteCache(job, result);
      await window.api.completeBackgroundSearch({ jobId, result, progress });
    } catch (error) {
      await flushSnapshot(jobId);
      if (!controller.signal.aborted) {
        await window.api.failBackgroundSearch(
          jobId,
          error instanceof Error ? error.message : "Echec de la recherche en arriere-plan.",
        );
      }
    } finally {
      controllersRef.current.delete(jobId);
      runningRef.current.delete(jobId);
      window.dispatchEvent(new CustomEvent("background-search-runner-slot-available"));
    }
  }, [flushSnapshot, queueSnapshot]);

  const claimAvailableJobs = React.useCallback(async () => {
    if (!isMainApplicationWindow() || typeof window.api?.getBackgroundSearchQueue !== "function") return;
    const availableSlots = Math.max(0, maxConcurrentRef.current - runningRef.current.size);
    if (availableSlots === 0) return;
    const queue = await window.api.getBackgroundSearchQueue() as BackgroundSearchQueueSummary;
    const candidates = queue.jobs
      .filter((job) => job.status === "queued")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, availableSlots);
    await Promise.all(candidates.map(async (candidate) => {
      const claimed = await window.api.claimBackgroundSearchJob(candidate.id) as BackgroundSearchJob | null;
      if (claimed) void runClaimedJob(claimed);
    }));
  }, [runClaimedJob]);

  React.useEffect(() => {
    if (!isMainApplicationWindow()) return undefined;
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
    };
    const unsubscribe = window.api?.onBackgroundSearchChanged?.(handleChange);
    const unsubscribeOpen = window.api?.onBackgroundSearchOpenRequested?.(async (request: { jobId?: string }) => {
      if (!request?.jobId) return;
      const job = await window.api?.getBackgroundSearchJob?.(request.jobId) as BackgroundSearchJob | null;
      if (!job?.input) return;
      if (window.location.hash === "#/" || window.location.hash === "") {
        requestBackgroundSearchOpenInCurrentView(job);
        return;
      }
      queuePendingBackgroundSearchOpen(request.jobId);
      window.location.hash = "#/";
    });
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
      if (typeof unsubscribeOpen === "function") unsubscribeOpen();
      window.removeEventListener("background-search-runner-slot-available", handleSlot);
      window.removeEventListener("settings-updated", handleSettingsUpdated);
    };
  }, [claimAvailableJobs]);

  return null;
}
