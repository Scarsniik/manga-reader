import { BrowserWindow, Notification } from "electron";
import { randomUUID } from "crypto";
import type {
  BackgroundSearchChangeEvent,
  BackgroundSearchJob,
  BackgroundSearchJobMetadata,
  BackgroundSearchProgress,
  BackgroundSearchQueueSummary,
  CompleteBackgroundSearchRequest,
  CreateBackgroundSearchRequest,
  UpdateBackgroundSearchRequest,
} from "../../../shared/backgroundSearch";
import { BACKGROUND_SEARCH_SCHEMA_VERSION } from "../../../shared/backgroundSearch";
import {
  buildBackgroundSearchQueueSummary,
  hasBackgroundSearchExpired,
  isBackgroundSearchActive,
} from "./metadata";
import {
  readBackgroundSearchMetadata,
  readBackgroundSearchInput,
  readBackgroundSearchResult,
  removeBackgroundSearchResult,
  removeBackgroundSearchInput,
  writeBackgroundSearchMetadata,
  writeBackgroundSearchInput,
  writeBackgroundSearchResult,
} from "./storage";

const memoryJobs = new Map<string, BackgroundSearchJob>();
let metadata: BackgroundSearchJobMetadata[] = [];
let initializePromise: Promise<void> | null = null;
let mutationChain = Promise.resolve();

const nowIso = (): string => new Date().toISOString();
const normalizeRetentionHours = (value: number): number => (
  Math.min(24 * 365, Math.max(1, Math.floor(Number(value) || 24)))
);
const getExpiresAt = (retentionHours: number): string => (
  new Date(Date.now() + normalizeRetentionHours(retentionHours) * 60 * 60 * 1000).toISOString()
);

const serializeMutation = async <T>(mutation: () => Promise<T>): Promise<T> => {
  const previous = mutationChain;
  let release: () => void = () => {};
  mutationChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await mutation();
  } finally {
    release();
  }
};

const broadcastChange = (job: BackgroundSearchJobMetadata): void => {
  const payload: BackgroundSearchChangeEvent = {
    jobId: job.id,
    revision: job.revision,
    status: job.status,
    progress: job.progress,
  };
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send("background-search-changed", payload);
    }
  });
};

const persistMetadata = async (): Promise<void> => {
  await writeBackgroundSearchMetadata(metadata);
};

const updateMemoryMetadata = (nextMetadata: BackgroundSearchJobMetadata): void => {
  const memoryJob = memoryJobs.get(nextMetadata.id);
  if (memoryJob) {
    memoryJobs.set(nextMetadata.id, { ...memoryJob, metadata: nextMetadata });
  }
};

const replaceMetadata = (nextMetadata: BackgroundSearchJobMetadata): void => {
  metadata = metadata.map((job) => job.id === nextMetadata.id ? nextMetadata : job);
  updateMemoryMetadata(nextMetadata);
};

const initialize = async (): Promise<void> => {
  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    metadata = await readBackgroundSearchMetadata();
    const currentTime = Date.now();
    metadata = await Promise.all(metadata.map(async (job) => {
      if (job.storageMode === "memory") {
        return {
          ...job,
          status: "expired" as const,
          updatedAt: nowIso(),
          revision: job.revision + 1,
          inputAvailable: true,
          resultAvailable: false,
        };
      }
      if (isBackgroundSearchActive(job.status)) {
        return {
          ...job,
          status: "interrupted" as const,
          updatedAt: nowIso(),
          revision: job.revision + 1,
          resultAvailable: job.storageMode === "temporaryFile" && job.resultAvailable,
        };
      }
      if (job.expiresAt && Date.parse(job.expiresAt) <= currentTime) {
        await removeBackgroundSearchResult(job.id);
        return {
          ...job,
          status: "expired" as const,
          updatedAt: nowIso(),
          revision: job.revision + 1,
          resultAvailable: false,
          inputAvailable: true,
        };
      }
      return job;
    }));
    await persistMetadata();
  })();

  return initializePromise;
};

const findMetadata = (jobId: string): BackgroundSearchJobMetadata | null => (
  metadata.find((job) => job.id === jobId) ?? null
);

const loadJob = async (jobId: string): Promise<BackgroundSearchJob | null> => {
  const memoryJob = memoryJobs.get(jobId);
  if (memoryJob) {
    return memoryJob;
  }
  const job = await readBackgroundSearchResult(jobId);
  if (job?.metadata.storageMode === "temporaryFile") {
    return job;
  }
  const input = await readBackgroundSearchInput(jobId);
  const jobMetadata = findMetadata(jobId);
  return input !== null && jobMetadata ? { metadata: jobMetadata, input } : null;
};

const persistJobPayload = async (job: BackgroundSearchJob): Promise<void> => {
  memoryJobs.set(job.metadata.id, job);
  if (job.metadata.storageMode === "temporaryFile") {
    await writeBackgroundSearchResult(job);
  }
};

const notifyFinished = (job: BackgroundSearchJobMetadata, title = "Recherche terminee"): void => {
  if (!Notification.isSupported()) {
    return;
  }
  const notification = new Notification({
    title,
    body: job.status === "error" && job.error
      ? `${job.title} · ${job.error}`
      : `${job.title} · ${job.progress.resultCount} resultat(s)`,
  });
  notification.on("click", () => {
    void markBackgroundSearchOpened(job.id);
    const windows = BrowserWindow.getAllWindows();
    const target = windows.find((window) => (
      !window.isDestroyed() && !window.webContents.getURL().includes("#/workspace")
    )) ?? windows.find((window) => !window.isDestroyed());
    if (target) {
      if (target.isMinimized()) target.restore();
      target.show();
      target.focus();
      target.webContents.send("background-search-open-requested", { jobId: job.id });
    }
  });
  notification.show();
};

export const createBackgroundSearch = async (
  request: CreateBackgroundSearchRequest,
): Promise<BackgroundSearchJobMetadata> => serializeMutation(async () => {
  await initialize();
  const timestamp = nowIso();
  const jobMetadata: BackgroundSearchJobMetadata = {
    id: randomUUID(),
    schemaVersion: BACKGROUND_SEARCH_SCHEMA_VERSION,
    kind: request.kind,
    title: String(request.title || request.primaryTerm || "Recherche").trim(),
    primaryTerm: String(request.primaryTerm || request.title || "Recherche").trim(),
    status: "queued",
    storageMode: request.storageMode,
    retentionHours: normalizeRetentionHours(request.retentionHours),
    createdAt: timestamp,
    openedAt: null,
    updatedAt: timestamp,
    revision: 1,
    progress: { completedUnits: 0, resultCount: 0 },
    inputAvailable: true,
    resultAvailable: false,
  };
  const job: BackgroundSearchJob = { metadata: jobMetadata, input: request.input };
  metadata = [jobMetadata, ...metadata];
  await persistJobPayload(job);
  await writeBackgroundSearchInput(jobMetadata.id, request.input);
  await persistMetadata();
  broadcastChange(jobMetadata);
  return jobMetadata;
});

export const getBackgroundSearchQueue = async (): Promise<BackgroundSearchQueueSummary> => (
  serializeMutation(async () => {
    await initialize();
    const expiredJobs = metadata.filter((job) => (
      hasBackgroundSearchExpired(job)
    ));
    if (expiredJobs.length) {
      await Promise.all(expiredJobs.map((job) => removeBackgroundSearchResult(job.id)));
      const expiredIds = new Set(expiredJobs.map((job) => job.id));
      expiredIds.forEach((jobId) => memoryJobs.delete(jobId));
      metadata = metadata.map((job) => expiredIds.has(job.id) ? {
        ...job,
        status: "expired" as const,
        updatedAt: nowIso(),
        revision: job.revision + 1,
        inputAvailable: true,
        resultAvailable: false,
      } : job);
      await persistMetadata();
      metadata.filter((job) => expiredIds.has(job.id)).forEach(broadcastChange);
    }
    return buildBackgroundSearchQueueSummary(metadata);
  })
);

export const getBackgroundSearchJob = async (jobId: string): Promise<BackgroundSearchJob | null> => {
  await initialize();
  const jobMetadata = findMetadata(jobId);
  if (!jobMetadata) return null;
  const job = await loadJob(jobId);
  return job ? { ...job, metadata: jobMetadata } : { metadata: jobMetadata, input: null };
};

export const claimBackgroundSearchJob = async (jobId: string): Promise<BackgroundSearchJob | null> => (
  serializeMutation(async () => {
    await initialize();
    const current = findMetadata(jobId);
    if (!current || current.status !== "queued") return null;
    const job = await loadJob(jobId);
    if (!job) return null;
    const next = {
      ...current,
      status: "running" as const,
      startedAt: nowIso(),
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };
    replaceMetadata(next);
    await persistJobPayload({ ...job, metadata: next });
    await persistMetadata();
    broadcastChange(next);
    return { ...job, metadata: next };
  })
);

export const updateBackgroundSearch = async (
  request: UpdateBackgroundSearchRequest,
): Promise<boolean> => serializeMutation(async () => {
  await initialize();
  const current = findMetadata(request.jobId);
  if (!current || current.status !== "running") return false;
  const job = await loadJob(request.jobId);
  if (!job) return false;
  const next = {
    ...current,
    updatedAt: nowIso(),
    revision: current.revision + 1,
    progress: request.progress,
    resultAvailable: request.result !== undefined || current.resultAvailable,
  };
  replaceMetadata(next);
  await persistJobPayload({
    ...job,
    metadata: next,
    result: request.result === undefined ? job.result : request.result,
  });
  await persistMetadata();
  broadcastChange(next);
  return true;
});

export const completeBackgroundSearch = async (
  request: CompleteBackgroundSearchRequest,
): Promise<boolean> => serializeMutation(async () => {
  await initialize();
  const current = findMetadata(request.jobId);
  if (!current || current.status !== "running") return false;
  const job = await loadJob(request.jobId);
  if (!job) return false;
  const completedAt = nowIso();
  const next = {
    ...current,
    status: "completed" as const,
    completedAt,
    expiresAt: current.storageMode === "temporaryFile" ? getExpiresAt(current.retentionHours) : undefined,
    updatedAt: completedAt,
    revision: current.revision + 1,
    progress: request.progress,
    resultAvailable: true,
  };
  replaceMetadata(next);
  await persistJobPayload({ ...job, metadata: next, result: request.result });
  await persistMetadata();
  broadcastChange(next);
  notifyFinished(next);
  return true;
});

export const failBackgroundSearch = async (jobId: string, error: string): Promise<boolean> => (
  finishWithStatus(jobId, "error", error)
);

export const cancelBackgroundSearch = async (jobId: string): Promise<boolean> => (
  finishWithStatus(jobId, "cancelled")
);

const finishWithStatus = async (
  jobId: string,
  status: "error" | "cancelled",
  error?: string,
): Promise<boolean> => serializeMutation(async () => {
  await initialize();
  const current = findMetadata(jobId);
  if (!current || !isBackgroundSearchActive(current.status)) return false;
  const next = {
    ...current,
    status,
    error,
    completedAt: nowIso(),
    expiresAt: current.storageMode === "temporaryFile" ? getExpiresAt(current.retentionHours) : undefined,
    updatedAt: nowIso(),
    revision: current.revision + 1,
  };
  replaceMetadata(next);
  await persistMetadata();
  broadcastChange(next);
  if (status === "error") notifyFinished(next, "Recherche en erreur");
  return true;
});

export const retryBackgroundSearch = async (jobId: string): Promise<BackgroundSearchJobMetadata | null> => {
  const job = await getBackgroundSearchJob(jobId);
  if (!job?.input) return null;
  return createBackgroundSearch({
    kind: job.metadata.kind,
    title: job.metadata.title,
    primaryTerm: job.metadata.primaryTerm,
    storageMode: job.metadata.storageMode,
    retentionHours: job.metadata.retentionHours,
    input: job.input,
  });
};

export const markBackgroundSearchOpened = async (jobId: string): Promise<boolean> => serializeMutation(async () => {
  await initialize();
  const current = findMetadata(jobId);
  if (!current) return false;
  if (current.openedAt !== null) return true;
  const next = {
    ...current,
    openedAt: nowIso(),
    revision: current.revision + 1,
  };
  replaceMetadata(next);
  await persistMetadata();
  broadcastChange(next);
  return true;
});

export const deleteBackgroundSearch = async (jobId: string): Promise<boolean> => serializeMutation(async () => {
  await initialize();
  const current = findMetadata(jobId);
  if (!current || isBackgroundSearchActive(current.status)) return false;
  metadata = metadata.filter((job) => job.id !== jobId);
  memoryJobs.delete(jobId);
  await removeBackgroundSearchResult(jobId);
  await removeBackgroundSearchInput(jobId);
  await persistMetadata();
  broadcastChange({ ...current, status: "expired", revision: current.revision + 1 });
  return true;
});
