import { getSettings } from "../params";
import { listImageFiles } from "../pages";
import { OCR_STATUS_POLL_MS, OCR_STATUS_WAIT_TIMEOUT_MS } from "./constants";
import { delay, getMangaOcrFilePath } from "./helpers";
import {
  createEmptyLanguageDetection,
  detectLanguageForManga,
  readMangaOcrFile,
} from "./manga-file";
import {
  cloneQueueJob,
  enqueueMangaQueueJob,
  getQueueJobByMangaId,
  isQueueJobRunning,
} from "./queue-store";
import { ensureOcrWorkerAvailable } from "./worker";
import { getMangaVocabularyStatusSnapshot, readMangaVocabularyFile } from "./vocabulary";
import type { OcrMangaStatus, OcrQueueJob } from "./types";

function isMangaOcrFullyProcessed(status: OcrMangaStatus) {
  const totalPages = Math.max(Number(status.totalPages || 0), Number(status.progress?.totalPages || 0));
  if (totalPages <= 0) {
    return false;
  }

  const completedPages = Number(status.completedPages || 0);
  const failedPages = Number(status.progress?.failedPages || 0);
  return completedPages + failedPages >= totalPages;
}

export async function getMangaOcrStatusInternal(manga: any): Promise<OcrMangaStatus> {
  const pageFiles = await listImageFiles(manga.path);
  const file = await readMangaOcrFile(manga.path);
  const vocabulary = await readMangaVocabularyFile(manga.path);
  const progress = file?.progress || {
    totalPages: pageFiles.length,
    completedPages: 0,
    failedPages: 0,
    lastProcessedPage: undefined,
    updatedAt: undefined,
    mode: undefined,
  };

  const activeJob = getQueueJobByMangaId(manga.id);

  return {
    exists: !!file,
    filePath: getMangaOcrFilePath(manga.path),
    progress: {
      totalPages: Math.max(pageFiles.length, Number(progress.totalPages || 0)),
      completedPages: Number(progress.completedPages || 0),
      failedPages: Number(progress.failedPages || 0),
      lastProcessedPage: progress.lastProcessedPage,
      mode: progress.mode,
      updatedAt: progress.updatedAt,
    },
    languageDetection: file?.languageDetection || createEmptyLanguageDetection(),
    activeJob: activeJob ? cloneQueueJob(activeJob as OcrQueueJob) : null,
    completedPages: Number(progress.completedPages || 0),
    totalPages: Math.max(pageFiles.length, Number(progress.totalPages || 0)),
    vocabulary: getMangaVocabularyStatusSnapshot(manga.path, vocabulary),
  };
}

export async function startMangaOcrInternal(manga: any, options?: Record<string, any>) {
  const settings = await getSettings();
  await ensureOcrWorkerAvailable(settings);

  const pageFiles = await listImageFiles(manga.path);
  const detection = await detectLanguageForManga(manga, pageFiles, settings, !!options?.forceResample);

  if ((detection.status === "uncertain" || detection.status === "likely_non_japanese")
    && !options?.confirmLanguage) {
    return {
      queued: false,
      requiresConfirmation: true,
      reason: detection.status === "uncertain" ? "uncertain-language" : "likely-non-japanese",
      detection,
      status: await getMangaOcrStatusInternal(manga),
    };
  }

  const job = enqueueMangaQueueJob(manga, {
    overwrite: !!options?.overwrite,
    mode: "full_manga",
    detection,
    priority: options?.priority || "user_requested",
    heavyPass: !!options?.heavyPass,
  });

  return {
    queued: true,
    job,
    detection,
    status: await getMangaOcrStatusInternal(manga),
  };
}

async function waitForMangaOcrCompletion(manga: any): Promise<OcrMangaStatus> {
  const deadline = Date.now() + OCR_STATUS_WAIT_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    const status = await getMangaOcrStatusInternal(manga);
    const jobStatus = status.activeJob?.status;

    if (jobStatus === "error") {
      throw new Error(status.activeJob?.message || "Le job OCR a echoue.");
    }

    if (jobStatus === "cancelled") {
      throw new Error("Le job OCR a ete annule.");
    }

    if (jobStatus === "paused") {
      throw new Error("Le job OCR est en pause. Reprends-le avant de lancer l'extraction.");
    }

    if (isMangaOcrFullyProcessed(status)) {
      return status;
    }

    if (!isQueueJobRunning(jobStatus)) {
      throw new Error("L'OCR n'a pas produit un fichier complet exploitable pour l'extraction.");
    }

    await delay(OCR_STATUS_POLL_MS);
  }

  throw new Error("Timeout OCR: l'extraction a attendu trop longtemps la fin du job.");
}

export async function ensureMangaOcrReadyForVocabularyExtraction(manga: any, options?: Record<string, any>) {
  const currentStatus = await getMangaOcrStatusInternal(manga);
  const jobStatus = currentStatus.activeJob?.status;

  if (isMangaOcrFullyProcessed(currentStatus)) {
    return {
      ready: true,
      status: currentStatus,
    };
  }

  if (jobStatus === "paused") {
    throw new Error("Le job OCR est en pause. Reprends-le avant de lancer l'extraction.");
  }

  if (isQueueJobRunning(jobStatus)) {
    const waitedStatus = await waitForMangaOcrCompletion(manga);
    return {
      ready: true,
      status: waitedStatus,
    };
  }

  const startResult = await startMangaOcrInternal(manga, {
    overwrite: false,
    confirmLanguage: !!options?.confirmLanguage,
    priority: "user_waiting",
    heavyPass: !!options?.heavyPass,
  });

  if (startResult?.requiresConfirmation) {
    return startResult;
  }

  const waitedStatus = await waitForMangaOcrCompletion(manga);
  return {
    ready: true,
    status: waitedStatus,
  };
}
