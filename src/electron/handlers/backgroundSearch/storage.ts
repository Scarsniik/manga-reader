import { promises as fs } from "fs";
import path from "path";
import { app } from "electron";
import { Worker } from "node:worker_threads";
import type {
  BackgroundSearchJob,
  BackgroundSearchJobMetadata,
} from "../../../shared/backgroundSearch";
import { dataDir, ensureDataDir } from "../../utils";

const metadataFilePath = path.join(dataDir, "background-searches.json");
const inputsDir = path.join(dataDir, "background-search-inputs");
const temporaryResultsDir = path.join(app.getPath("temp"), "manga-helper-background-searches");

type JsonWorkerResponse = {
  id: number;
  value?: unknown;
  error?: string;
};

const pendingJsonOperations = new Map<number, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}>();
let jsonWorker: Worker | null = null;
let nextJsonOperationId = 0;

const getJsonWorker = (): Worker => {
  if (jsonWorker) return jsonWorker;
  const worker = new Worker(`
    const { parentPort } = require("node:worker_threads");
    parentPort.on("message", ({ id, operation, value }) => {
      try {
        parentPort.postMessage({
          id,
          value: operation === "stringify" ? JSON.stringify(value) : JSON.parse(value),
        });
      } catch (error) {
        parentPort.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
      }
    });
  `, { eval: true });
  worker.unref();
  worker.on("message", (message: JsonWorkerResponse) => {
    const pending = pendingJsonOperations.get(message.id);
    if (!pending) return;
    pendingJsonOperations.delete(message.id);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.value);
  });
  worker.once("error", (error) => {
    if (jsonWorker === worker) jsonWorker = null;
    pendingJsonOperations.forEach((pending) => pending.reject(error));
    pendingJsonOperations.clear();
  });
  jsonWorker = worker;
  return worker;
};

const runJsonOperation = <Result>(
  operation: "parse" | "stringify",
  value: unknown,
): Promise<Result> => new Promise((resolve, reject) => {
  nextJsonOperationId += 1;
  pendingJsonOperations.set(nextJsonOperationId, {
    resolve: (result) => resolve(result as Result),
    reject,
  });
  getJsonWorker().postMessage({ id: nextJsonOperationId, operation, value });
});

const getResultFilePath = (jobId: string): string => (
  path.join(temporaryResultsDir, `${jobId}.json`)
);
const getInputFilePath = (jobId: string): string => path.join(inputsDir, `${jobId}.json`);

const writeJsonAtomic = async (filePath: string, value: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(value), "utf8");
  await fs.rename(temporaryPath, filePath);
};

const writeLargeJsonAtomic = async (filePath: string, value: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, await runJsonOperation<string>("stringify", value), "utf8");
  await fs.rename(temporaryPath, filePath);
};

export const readBackgroundSearchMetadata = async (): Promise<BackgroundSearchJobMetadata[]> => {
  try {
    const raw = await fs.readFile(metadataFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn("Failed to read background search metadata", error);
    }
    return [];
  }
};

export const writeBackgroundSearchMetadata = async (
  jobs: BackgroundSearchJobMetadata[],
): Promise<void> => {
  await ensureDataDir();
  await writeJsonAtomic(metadataFilePath, jobs);
};

export const readBackgroundSearchResult = async <TInput, TResult>(
  jobId: string,
): Promise<BackgroundSearchJob<TInput, TResult> | null> => {
  try {
    const raw = await fs.readFile(getResultFilePath(jobId), "utf8");
    return await runJsonOperation<BackgroundSearchJob<TInput, TResult>>("parse", raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn(`Failed to read background search result ${jobId}`, error);
    }
    return null;
  }
};

export const writeBackgroundSearchResult = async (
  job: BackgroundSearchJob,
): Promise<void> => {
  await writeLargeJsonAtomic(getResultFilePath(job.metadata.id), job);
};

export const readBackgroundSearchInput = async (jobId: string): Promise<unknown | null> => {
  try {
    const raw = await fs.readFile(getInputFilePath(jobId), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn(`Failed to read background search input ${jobId}`, error);
    }
    return null;
  }
};

export const writeBackgroundSearchInput = async (jobId: string, input: unknown): Promise<void> => {
  await writeJsonAtomic(getInputFilePath(jobId), input);
};

export const removeBackgroundSearchInput = async (jobId: string): Promise<void> => {
  try {
    await fs.unlink(getInputFilePath(jobId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
  }
};

export const removeBackgroundSearchResult = async (jobId: string): Promise<void> => {
  try {
    await fs.unlink(getResultFilePath(jobId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw error;
    }
  }
};
