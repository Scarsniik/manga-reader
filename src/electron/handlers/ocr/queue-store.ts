import { randomUUID } from "crypto";
import path from "path";
import { OCR_QUEUE_PRIORITY_WEIGHT } from "./constants";
import { ocrRuntimeState } from "./state";
import type {
  OcrQueueJob,
  OcrQueueJobPriority,
  OcrQueueJobSnapshot,
  OcrQueueJobStatus,
} from "./types";

let queueRunScheduler: (() => void) | null = null;

export function registerQueueRunScheduler(scheduler: () => void) {
  queueRunScheduler = scheduler;
}

function scheduleQueueRun() {
  queueRunScheduler?.();
}

export function cloneQueueJob(job: OcrQueueJob): OcrQueueJobSnapshot {
  return {
    id: job.id,
    mangaId: job.mangaId,
    mangaTitle: job.mangaTitle,
    mangaPath: job.mangaPath,
    status: job.status,
    mode: job.mode,
    overwrite: job.overwrite,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    totalPages: job.totalPages,
    completedPages: job.completedPages,
    failedPages: job.failedPages,
    currentPage: job.currentPage,
    currentPagePath: job.currentPagePath,
    message: job.message,
    languageDetection: job.languageDetection || null,
    priority: job.priority,
    heavyPass: !!job.heavyPass,
  };
}

export function touchQueueJob(job: OcrQueueJob, patch?: Partial<OcrQueueJob>) {
  Object.assign(job, patch || {});
  job.updatedAt = new Date().toISOString();
  ocrRuntimeState.ocrQueueJobs.set(job.id, job);
  return job;
}

export function getQueueJobByMangaId(mangaId: string) {
  const jobs = Array.from(ocrRuntimeState.ocrQueueJobs.values())
    .filter((job) => job.mangaId === mangaId)
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1));
  return jobs[0] || null;
}

export function getNextRunnableQueueJob() {
  return ocrRuntimeState.ocrQueueOrder
    .map((jobId) => ocrRuntimeState.ocrQueueJobs.get(jobId))
    .filter((job): job is OcrQueueJob => !!job && job.status === "queued")
    .sort((left, right) => {
      const priorityDelta = OCR_QUEUE_PRIORITY_WEIGHT[right.priority] - OCR_QUEUE_PRIORITY_WEIGHT[left.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      if (left.updatedAt !== right.updatedAt) {
        return left.updatedAt < right.updatedAt ? -1 : 1;
      }
      return left.createdAt < right.createdAt ? -1 : 1;
    })[0] || null;
}

function getHigherQueuePriority(
  left: OcrQueueJobPriority = "background",
  right: OcrQueueJobPriority = "background",
): OcrQueueJobPriority {
  return OCR_QUEUE_PRIORITY_WEIGHT[left] >= OCR_QUEUE_PRIORITY_WEIGHT[right] ? left : right;
}

export function isQueueJobRunning(status?: OcrQueueJobStatus | null) {
  return status === "queued" || status === "detecting_language" || status === "running";
}

export function enqueueMangaQueueJob(
  manga: any,
  options?: {
    overwrite?: boolean;
    mode?: OcrQueueJob["mode"];
    detection?: any;
    priority?: OcrQueueJobPriority;
    heavyPass?: boolean;
  },
) {
  const existing = getQueueJobByMangaId(manga.id);
  if (existing && ["queued", "running", "paused", "detecting_language"].includes(existing.status)) {
    const nextPriority = getHigherQueuePriority(existing.priority, options?.priority || existing.priority);
    touchQueueJob(existing, {
      overwrite: existing.overwrite || !!options?.overwrite,
      priority: nextPriority,
      languageDetection: options?.detection || existing.languageDetection || null,
      heavyPass: !!existing.heavyPass || !!options?.heavyPass,
      ...(existing.status === "paused" && options?.overwrite
        ? { status: "queued" as const, pauseRequested: false, message: null }
        : {}),
    });
    scheduleQueueRun();
    return cloneQueueJob(existing);
  }

  const job: OcrQueueJob = {
    id: randomUUID(),
    mangaId: String(manga.id),
    mangaTitle: String(manga.title || path.basename(manga.path)),
    mangaPath: manga.path,
    status: "queued",
    mode: options?.mode || "full_manga",
    overwrite: !!options?.overwrite,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalPages: 0,
    completedPages: 0,
    failedPages: 0,
    message: null,
    languageDetection: options?.detection || null,
    priority: options?.priority || "background",
    heavyPass: !!options?.heavyPass,
  };

  ocrRuntimeState.ocrQueueJobs.set(job.id, job);
  ocrRuntimeState.ocrQueueOrder = ocrRuntimeState.ocrQueueOrder.filter((jobId) => jobId !== job.id);
  ocrRuntimeState.ocrQueueOrder.push(job.id);
  scheduleQueueRun();
  return cloneQueueJob(job);
}

export async function getQueueStatusInternal() {
  const jobs = ocrRuntimeState.ocrQueueOrder
    .map((jobId) => ocrRuntimeState.ocrQueueJobs.get(jobId))
    .filter(Boolean)
    .map((job) => cloneQueueJob(job as OcrQueueJob));

  const counts = jobs.reduce((acc, job) => {
    acc.total += 1;
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {
    total: 0,
    queued: 0,
    detecting_language: 0,
    running: 0,
    paused: 0,
    completed: 0,
    error: 0,
    cancelled: 0,
  } as Record<string, number>);

  return {
    jobs,
    counts,
  };
}

export async function pauseQueueJob(jobId: string) {
  const job = ocrRuntimeState.ocrQueueJobs.get(jobId);
  if (!job) {
    throw new Error("OCR job not found");
  }

  const wasQueued = job.status === "queued";
  touchQueueJob(job, {
    pauseRequested: true,
    status: wasQueued ? "paused" : job.status,
    message: "Pause demandee",
  });

  if (wasQueued) {
    touchQueueJob(job, { pauseRequested: false });
  }

  return cloneQueueJob(job);
}

export async function resumeQueueJob(jobId: string) {
  const job = ocrRuntimeState.ocrQueueJobs.get(jobId);
  if (!job) {
    throw new Error("OCR job not found");
  }

  touchQueueJob(job, {
    status: "queued",
    pauseRequested: false,
    message: null,
  });
  scheduleQueueRun();
  return cloneQueueJob(job);
}

export async function cancelQueueJob(jobId: string) {
  const job = ocrRuntimeState.ocrQueueJobs.get(jobId);
  if (!job) {
    throw new Error("OCR job not found");
  }

  const shouldCancelNow = !["completed", "cancelled", "error"].includes(job.status);
  touchQueueJob(job, {
    cancelRequested: true,
    pauseRequested: false,
    status: shouldCancelNow ? "cancelled" : job.status,
    message: "Annulation demandee",
    completedAt: shouldCancelNow ? new Date().toISOString() : job.completedAt,
  });

  return cloneQueueJob(job);
}

export async function cancelAllQueueJobs() {
  const activeJobs = ocrRuntimeState.ocrQueueOrder
    .map((jobId) => ocrRuntimeState.ocrQueueJobs.get(jobId))
    .filter((job): job is OcrQueueJob => !!job)
    .filter((job) => !["completed", "cancelled", "error"].includes(job.status));

  for (const job of activeJobs) {
    touchQueueJob(job, {
      cancelRequested: true,
      pauseRequested: false,
      status: "cancelled",
      message: "Annulation demandee",
      completedAt: new Date().toISOString(),
    });
  }

  return {
    cancelledCount: activeJobs.length,
    status: await getQueueStatusInternal(),
  };
}
