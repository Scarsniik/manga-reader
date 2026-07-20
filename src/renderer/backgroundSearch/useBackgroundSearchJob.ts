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
