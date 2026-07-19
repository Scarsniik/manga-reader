import type {
  BackgroundSearchJobMetadata,
  BackgroundSearchQueueSummary,
  BackgroundSearchStatus,
} from "../../../shared/backgroundSearch";

export const isBackgroundSearchActive = (status: BackgroundSearchStatus | string): boolean => (
  status === "queued" || status === "running"
);

export const isBackgroundSearchUnopened = (
  job: Pick<BackgroundSearchJobMetadata, "openedAt">,
): boolean => job.openedAt === null;

export const hasBackgroundSearchExpired = (
  job: Pick<BackgroundSearchJobMetadata, "expiresAt" | "status">,
  currentTime = Date.now(),
): boolean => Boolean(
  job.status !== "expired"
  && job.expiresAt
  && Date.parse(job.expiresAt) <= currentTime,
);

export const buildBackgroundSearchQueueSummary = (
  metadata: BackgroundSearchJobMetadata[],
): BackgroundSearchQueueSummary => {
  const jobs = [...metadata].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return {
    jobs,
    counts: {
      total: jobs.length,
      active: jobs.filter((job) => isBackgroundSearchActive(job.status)).length,
      queued: jobs.filter((job) => job.status === "queued").length,
      running: jobs.filter((job) => job.status === "running").length,
      completed: jobs.filter((job) => job.status === "completed").length,
      error: jobs.filter((job) => job.status === "error").length,
      cancelled: jobs.filter((job) => job.status === "cancelled").length,
    },
  };
};
