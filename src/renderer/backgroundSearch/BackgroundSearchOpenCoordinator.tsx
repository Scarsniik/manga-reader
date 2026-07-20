import React from "react";
import type { BackgroundSearchJob } from "@/shared/backgroundSearch";
import {
  queuePendingBackgroundSearchOpen,
  requestBackgroundSearchOpenInCurrentView,
} from "@/renderer/backgroundSearch/backgroundSearchNavigation";

const isPrimaryApplicationWindow = (): boolean => (
  !window.location.hash.startsWith("#/workspace")
  && !window.location.hash.startsWith("#/background-search-runner")
);

export default function BackgroundSearchOpenCoordinator() {
  React.useEffect(() => {
    if (!isPrimaryApplicationWindow()) return undefined;

    return window.api?.onBackgroundSearchOpenRequested?.(async (request: { jobId?: string }) => {
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
  }, []);

  return null;
}
