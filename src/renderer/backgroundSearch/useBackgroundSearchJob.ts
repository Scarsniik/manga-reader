import React from "react";
import type {
  BackgroundSearchChangeEvent,
  BackgroundSearchJob,
  BackgroundSearchStatus,
} from "@/shared/backgroundSearch";

export default function useBackgroundSearchJob(jobId?: string | null) {
  const [job, setJob] = React.useState<BackgroundSearchJob | null>(null);
  const jobRef = React.useRef<BackgroundSearchJob | null>(null);
  const [loading, setLoading] = React.useState(Boolean(jobId));
  const [error, setError] = React.useState<string | null>(null);
  const [clock, setClock] = React.useState(() => Date.now());
  const resultProgressRef = React.useRef<{
    jobId: string;
    resultCount: number;
    changedAt: number;
  } | null>(null);

  const load = React.useCallback(async () => {
    if (!jobId) {
      jobRef.current = null;
      setJob(null);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      const nextJob = await window.api?.getBackgroundSearchJob?.(jobId) as BackgroundSearchJob | null;
      if (!nextJob) throw new Error("Cette recherche n'existe plus.");
      jobRef.current = nextJob;
      setJob(nextJob);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger cette recherche.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  React.useEffect(() => {
    jobRef.current = null;
    setLoading(Boolean(jobId));
    void load();
    const unsubscribe = window.api?.onBackgroundSearchChanged?.((event: BackgroundSearchChangeEvent) => {
      if (event.jobId !== jobId) return;
      const current = jobRef.current;
      if (!current || event.resultChanged || current.metadata.status !== event.status) {
        void load();
        return;
      }
      const nextJob = {
        ...current,
        metadata: {
          ...current.metadata,
          revision: event.revision,
          status: event.status,
          progress: event.progress,
        },
      };
      jobRef.current = nextJob;
      setJob(nextJob);
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [jobId, load]);

  React.useEffect(() => {
    if (job?.metadata.status !== "running") return undefined;
    setClock(Date.now());
    const interval = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [job?.metadata.status, job?.metadata.updatedAt]);

  React.useEffect(() => {
    if (!job || job.metadata.status !== "running") {
      resultProgressRef.current = null;
      return;
    }
    const resultCount = Math.max(0, Number(job.metadata.progress.resultCount) || 0);
    const current = resultProgressRef.current;
    if (!current || current.jobId !== job.metadata.id) {
      const startedAt = Date.parse(job.metadata.startedAt || job.metadata.createdAt || "");
      resultProgressRef.current = {
        jobId: job.metadata.id,
        resultCount,
        changedAt: resultCount === 0 && Number.isFinite(startedAt) ? startedAt : Date.now(),
      };
      return;
    }
    if (current.resultCount !== resultCount) {
      resultProgressRef.current = { ...current, resultCount, changedAt: Date.now() };
    }
  }, [job?.metadata.id, job?.metadata.progress.resultCount, job?.metadata.status]);

  const cancel = React.useCallback(async () => {
    if (jobId) await window.api?.cancelBackgroundSearch?.(jobId);
  }, [jobId]);

  const lastUpdateAt = Date.parse(job?.metadata.updatedAt || job?.metadata.createdAt || "");
  const stalledForMs = job?.metadata.status === "running" && Number.isFinite(lastUpdateAt)
    ? Math.max(0, clock - lastUpdateAt)
    : 0;
  const resultStalledForMs = job?.metadata.status === "running" && resultProgressRef.current
    ? Math.max(0, clock - resultProgressRef.current.changedAt)
    : 0;

  return {
    job,
    loading,
    error,
    cancel,
    reload: load,
    attached: Boolean(jobId),
    status: job?.metadata.status as BackgroundSearchStatus | undefined,
    stalledForMs,
    resultStalledForMs,
  };
}
