import type { OcrQueueJob, OcrWorkerState } from "./types";

export const ocrRuntimeState = {
  workerState: null as OcrWorkerState | null,
  workerPrewarmPromise: null as Promise<boolean> | null,
  ocrQueueJobs: new Map<string, OcrQueueJob>(),
  ocrQueueOrder: [] as string[],
  ocrQueueRunnerPromise: null as Promise<void> | null,
  jpdbParseQueue: Promise.resolve() as Promise<void>,
};
