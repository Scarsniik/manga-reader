import React from "react";
import type {
  BackgroundSearchChangeEvent,
  BackgroundSearchJob,
  BackgroundSearchQueueSummary,
} from "@/shared/backgroundSearch";
const isBackgroundSearchRunnerWindow = (): boolean => (
  window.location.hash.startsWith("#/background-search-runner")
);

export default function BackgroundSearchRunner() {
  const controllersRef = React.useRef(new Map<string, AbortController>());
  const runningRef = React.useRef(new Set<string>());
  const maxConcurrentRef = React.useRef(3);
  const processingRelationsRef = React.useRef(new Set<string>());
  const processingCompletedAutomationsRef = React.useRef(new Set<string>());

  const runClaimedJob = React.useCallback(async (job: BackgroundSearchJob) => {
    const jobId = job.metadata.id;
    const controller = new AbortController();
    controllersRef.current.set(jobId, controller);
    runningRef.current.add(jobId);
    try {
      await window.api.runBackgroundSearchWorker(jobId);
    } catch (error) {
      if (!controller.signal.aborted) console.warn("Background search worker failed", error);
    } finally {
      controllersRef.current.delete(jobId);
      runningRef.current.delete(jobId);
      window.dispatchEvent(new CustomEvent("background-search-runner-slot-available"));
    }
  }, []);

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
        await window.api.runBackgroundSearchAutomationWorker({
          action: "importLinkedAuthorSearchIntoManga",
          options: {
            authorJobId: linkedJob.id,
            automatic: true,
          },
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
        await window.api.runBackgroundSearchAutomationWorker({
          action: "automaticallyReuseExistingAuthorSearch",
          jobId,
        });
      } else if (job.metadata.kind === "authorCorrespondence") {
        await window.api.runBackgroundSearchAutomationWorker({
          action: "refreshMangaSearchesUsingAuthor",
          jobId,
        });
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
