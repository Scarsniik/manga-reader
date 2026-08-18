import React from "react";
import {
  getAuthorCorrespondenceSessionCacheSnapshot,
  hydrateAuthorCorrespondenceSessionCache,
  replaceAuthorCorrespondenceSessionCache,
  subscribeAuthorCorrespondenceSessionCache,
} from "@/renderer/backgroundSearch/authorCorrespondenceSessionCache";

export default function useAuthorCorrespondenceSessionCache(jobId?: string | null) {
  const [hydratedJobId, setHydratedJobId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!jobId) {
      setHydratedJobId(null);
      return undefined;
    }
    let disposed = false;
    setHydratedJobId(null);
    const api = window.api ?? {};
    const unsubscribe = typeof api.onAuthorCorrespondenceSessionCacheUpdated === "function"
      ? api.onAuthorCorrespondenceSessionCacheUpdated((event: {
        jobId?: string;
        snapshot?: unknown;
      }) => {
        if (event.jobId !== jobId || !event.snapshot || typeof event.snapshot !== "object") return;
        replaceAuthorCorrespondenceSessionCache(
          jobId,
          event.snapshot,
        );
      })
      : undefined;
    void hydrateAuthorCorrespondenceSessionCache(jobId)
      .catch((error) => {
        console.warn("Failed to hydrate author correspondence session cache", error);
      })
      .finally(() => {
        if (!disposed) setHydratedJobId(jobId);
      });
    return () => {
      disposed = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [jobId]);

  const snapshot = React.useSyncExternalStore(
    subscribeAuthorCorrespondenceSessionCache,
    () => getAuthorCorrespondenceSessionCacheSnapshot(jobId),
    () => getAuthorCorrespondenceSessionCacheSnapshot(jobId),
  );
  return React.useMemo(() => ({
    ...snapshot,
    hydrated: Boolean(jobId && hydratedJobId === jobId),
  }), [hydratedJobId, jobId, snapshot]);
}
