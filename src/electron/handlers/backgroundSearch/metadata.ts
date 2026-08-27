import type {
  BackgroundSearchJobMetadata,
  BackgroundSearchQueueSummary,
  BackgroundSearchStatus,
  BackgroundSearchRelation,
} from "../../../shared/backgroundSearch";

export const resolveCompletedBackgroundSearchRelation = (
  relation: BackgroundSearchRelation | undefined,
  result: unknown,
): BackgroundSearchRelation | undefined => {
  if (!relation) return undefined;
  const safetyBlocked = Boolean(
    result
    && typeof result === "object"
    && (result as {
      advancedSearch?: { automaticMangaReplayBlocked?: boolean };
    }).advancedSearch?.automaticMangaReplayBlocked === true
  );
  return {
    ...relation,
    automationStatus: relation.autoImportOnCompletion
      ? relation.blockAutomaticImportOnSafetyWarning && safetyBlocked
        ? "blocked"
        : "pending"
      : "manualReady",
    automationError: undefined,
  };
};

export const isBackgroundSearchActive = (status: BackgroundSearchStatus | string): boolean => (
  status === "queued" || status === "running"
);

export const isBackgroundSearchResultEditable = (status: BackgroundSearchStatus | string): boolean => (
  status === "completed" || status === "cancelled"
);

export const canReplayBackgroundSearch = (
  job: Pick<BackgroundSearchJobMetadata, "kind" | "status">,
): boolean => (
  (job.kind === "mangaCorrespondence" || job.kind === "authorCorrespondence")
  && isBackgroundSearchResultEditable(job.status)
);

export const canContinueBackgroundSearch = (
  job: Pick<BackgroundSearchJobMetadata, "kind" | "status">,
): boolean => (
  job.status === "completed"
  && (job.kind === "mangaCorrespondence" || job.kind === "latestSources")
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
