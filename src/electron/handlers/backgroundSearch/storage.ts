import { promises as fs } from "fs";
import path from "path";
import { app } from "electron";
import type {
  BackgroundSearchJob,
  BackgroundSearchJobMetadata,
} from "../../../shared/backgroundSearch";
import { dataDir, ensureDataDir } from "../../utils";

const metadataFilePath = path.join(dataDir, "background-searches.json");
const inputsDir = path.join(dataDir, "background-search-inputs");
const temporaryResultsDir = path.join(app.getPath("temp"), "manga-helper-background-searches");

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
    return JSON.parse(raw) as BackgroundSearchJob<TInput, TResult>;
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
  await writeJsonAtomic(getResultFilePath(job.metadata.id), job);
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
