import React from "react";
import type {
  BackgroundSearchChangeEvent,
  BackgroundSearchJobMetadata,
  BackgroundSearchQueueSummary,
} from "@/shared/backgroundSearch";

export default function useRelatedBackgroundSearchJobs(
  parentJobId?: string | null,
  importedAuthorJobIds: string[] = [],
) {
  const [jobs, setJobs] = React.useState<BackgroundSearchJobMetadata[]>([]);
  const [loading, setLoading] = React.useState(Boolean(parentJobId));
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    if (!parentJobId || typeof window.api?.getBackgroundSearchQueue !== "function") {
      setJobs([]);
      setLoading(false);
      return;
    }
    try {
      const queue = await window.api.getBackgroundSearchQueue() as BackgroundSearchQueueSummary;
      const importedJobIds = new Set(importedAuthorJobIds);
      setJobs(queue.jobs.filter((job) => (
        job.relation?.parentJobId === parentJobId || importedJobIds.has(job.id)
      )));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : "Impossible de charger les recherches liées.");
    } finally {
      setLoading(false);
    }
  }, [importedAuthorJobIds.join("::"), parentJobId]);

  React.useEffect(() => {
    setLoading(Boolean(parentJobId));
    void reload();
    const unsubscribe = window.api?.onBackgroundSearchChanged?.(
      (_event: BackgroundSearchChangeEvent) => { void reload(); },
    );
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [reload, parentJobId]);

  return { jobs, loading, error, reload };
}
