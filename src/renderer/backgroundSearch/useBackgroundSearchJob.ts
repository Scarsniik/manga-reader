import React from "react";
import type {
  BackgroundSearchChangeEvent,
  BackgroundSearchJob,
  BackgroundSearchStatus,
} from "@/shared/backgroundSearch";

export default function useBackgroundSearchJob(jobId?: string | null) {
  const [job, setJob] = React.useState<BackgroundSearchJob | null>(null);
  const [loading, setLoading] = React.useState(Boolean(jobId));
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!jobId) {
      setJob(null);
      setLoading(false);
      setError(null);
      return;
    }
    try {
      const nextJob = await window.api?.getBackgroundSearchJob?.(jobId) as BackgroundSearchJob | null;
      if (!nextJob) throw new Error("Cette recherche n'existe plus.");
      setJob(nextJob);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger cette recherche.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  React.useEffect(() => {
    setLoading(Boolean(jobId));
    void load();
    const unsubscribe = window.api?.onBackgroundSearchChanged?.((event: BackgroundSearchChangeEvent) => {
      if (event.jobId === jobId) void load();
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [jobId, load]);

  const cancel = React.useCallback(async () => {
    if (jobId) await window.api?.cancelBackgroundSearch?.(jobId);
  }, [jobId]);

  return {
    job,
    loading,
    error,
    cancel,
    reload: load,
    attached: Boolean(jobId),
    status: job?.metadata.status as BackgroundSearchStatus | undefined,
  };
}

