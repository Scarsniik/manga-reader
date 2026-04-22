import path from "path";
import { getSettings } from "../params";
import { listImageFiles } from "../pages";
import { getMangaById } from "../mangas";
import {
  MANGA_OCR_CHECKPOINT_INTERVAL_MS,
  MANGA_OCR_CHECKPOINT_PAGE_INTERVAL,
  MANGA_OCR_PAGE_SCHEMA_VERSION,
} from "./constants";
import { buildMangaPageKey, getImageFingerprint } from "./helpers";
import {
  createEmptyMangaOcrProfileFile,
  ensureMangaOcrFile,
  isStoredPageUpToDate,
  setMangaOcrPageEntryForFile,
  showQueueJobCompletionNotification,
  syncMangaOcrProfileSession,
  updateLanguageDetectionFromRecognizedPage,
  writeMangaOcrFile,
  writeMangaOcrProfileFile,
} from "./manga-file";
import { recognizePageInternal } from "./recognize-page";
import { ensureOcrWorkerAvailable } from "./worker";
import {
  getNextRunnableQueueJob,
  registerQueueRunScheduler,
  touchQueueJob,
} from "./queue-store";
import { ocrRuntimeState } from "./state";
import type {
  MangaOcrPageEntry,
  OcrPassProfile,
  OcrQueueJob,
} from "./types";

async function processQueueJob(job: OcrQueueJob) {
  const manga = await getMangaById(job.mangaId);
  if (!manga) {
    touchQueueJob(job, {
      status: "error",
      message: "Manga introuvable",
      completedAt: new Date().toISOString(),
    });
    return;
  }

  const settings = await getSettings();
  await ensureOcrWorkerAvailable(settings);

  const pageFiles = await listImageFiles(manga.path);
  touchQueueJob(job, {
    startedAt: job.startedAt || new Date().toISOString(),
    totalPages: pageFiles.length,
    status: "running",
    message: null,
    completedPages: 0,
    failedPages: 0,
  });

  let workingFile = await ensureMangaOcrFile(manga, pageFiles.length);
  let workingProfile = createEmptyMangaOcrProfileFile(job, manga, pageFiles.length);
  syncMangaOcrProfileSession(workingProfile, job, pageFiles.length);

  if (job.overwrite) {
    workingFile = {
      ...workingFile,
      pages: {},
      progress: {
        ...workingFile.progress,
        totalPages: pageFiles.length,
        completedPages: 0,
        failedPages: 0,
        lastProcessedPage: undefined,
        mode: job.mode,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  let ocrFileDirty = true;
  let profileFileDirty = true;
  let dirtyPageCount = 0;
  let lastCheckpointAt = Date.now();

  const flushWorkingState = async (force: boolean = false) => {
    if (!ocrFileDirty && !profileFileDirty) {
      return false;
    }

    const dueByPages = dirtyPageCount >= MANGA_OCR_CHECKPOINT_PAGE_INTERVAL;
    const dueByTime = (Date.now() - lastCheckpointAt) >= MANGA_OCR_CHECKPOINT_INTERVAL_MS;
    if (!force && !dueByPages && !dueByTime) {
      return false;
    }

    if (ocrFileDirty) {
      workingFile = await writeMangaOcrFile(manga.path, workingFile);
    }
    if (profileFileDirty) {
      syncMangaOcrProfileSession(workingProfile, job, pageFiles.length);
      workingProfile = await writeMangaOcrProfileFile(manga.path, workingProfile);
    }
    ocrFileDirty = false;
    profileFileDirty = false;
    dirtyPageCount = 0;
    lastCheckpointAt = Date.now();
    return true;
  };

  if (!job.overwrite) {
    await flushWorkingState(true);
  }
  touchQueueJob(job, {
    completedPages: Number(workingFile.progress.completedPages || 0),
    failedPages: Number(workingFile.progress.failedPages || 0),
  });

  for (let index = 0; index < pageFiles.length; index += 1) {
    if (job.cancelRequested) {
      touchQueueJob(job, {
        status: "cancelled",
        completedAt: new Date().toISOString(),
        message: "Annule",
      });
      profileFileDirty = true;
      await flushWorkingState(true);
      return;
    }

    if (job.pauseRequested) {
      touchQueueJob(job, {
        status: "paused",
        message: "En pause",
      });
      profileFileDirty = true;
      await flushWorkingState(true);
      return;
    }

    const imagePath = pageFiles[index];
    if (!imagePath) {
      continue;
    }

    const pageKey = buildMangaPageKey(index, imagePath);
    const existingEntry = workingFile.pages?.[pageKey];
    const passProfile: OcrPassProfile = job.heavyPass ? "heavy" : "standard";

    if (!job.overwrite && existingEntry) {
      const fingerprint = await getImageFingerprint(imagePath);
      if (isStoredPageUpToDate(existingEntry, fingerprint, passProfile)) {
        workingProfile.session.pages[pageKey] = {
          pageIndex: index,
          pageNumber: index + 1,
          imagePath,
          source: "manga-file",
          computedAt: String(existingEntry.computedAt || new Date().toISOString()),
          status: "done",
          profile: null,
        };
        profileFileDirty = true;
        dirtyPageCount += 1;
        await flushWorkingState(false);
        touchQueueJob(job, {
          currentPage: index + 1,
          currentPagePath: imagePath,
          completedPages: Number(workingFile.progress?.completedPages || 0),
          failedPages: Number(workingFile.progress?.failedPages || 0),
        });
        continue;
      }
    }

    touchQueueJob(job, {
      currentPage: index + 1,
      currentPagePath: imagePath,
      status: "running",
      message: null,
    });

    try {
      const { result, fingerprint, workerProfile } = await recognizePageInternal(imagePath, settings, {
        forceRefresh: job.overwrite,
        mode: job.mode,
        passProfile,
      });

      const blocks = Array.isArray(result.page?.blocks) ? result.page.blocks : [];
      const boxes = Array.isArray(result.boxes) ? result.boxes : [];
      const nextEntry: MangaOcrPageEntry = {
        schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
        status: "done",
        pageIndex: index,
        pageNumber: index + 1,
        fileName: path.basename(imagePath),
        imagePath,
        sourceSize: fingerprint.size,
        sourceMtimeMs: fingerprint.mtimeMs,
        width: result.width,
        height: result.height,
        boxes,
        blocks,
        manualBoxes: Array.isArray(existingEntry?.manualBoxes) ? existingEntry.manualBoxes : [],
        computedAt: result.debug?.computedAt || new Date().toISOString(),
        passProfile,
      };

      await updateLanguageDetectionFromRecognizedPage(manga, workingFile, index, imagePath, result, settings);
      setMangaOcrPageEntryForFile(workingFile, pageKey, nextEntry, pageFiles.length, job.mode);
      workingProfile.session.pages[pageKey] = {
        pageIndex: index,
        pageNumber: index + 1,
        imagePath,
        source: result.debug?.source === "app-cache" || result.debug?.source === "manga-file" ? result.debug.source : "backend",
        computedAt: String(result.debug?.computedAt || new Date().toISOString()),
        status: "done",
        profile: workerProfile,
      };
      ocrFileDirty = true;
      profileFileDirty = true;
      dirtyPageCount += 1;
      await flushWorkingState(false);
      touchQueueJob(job, {
        completedPages: Number(workingFile.progress?.completedPages || 0),
        failedPages: Number(workingFile.progress?.failedPages || 0),
      });
    } catch (error: any) {
      const nextEntry: MangaOcrPageEntry = {
        schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
        status: "error",
        pageIndex: index,
        pageNumber: index + 1,
        fileName: path.basename(imagePath),
        imagePath,
        errorMessage: String(error?.message || error || "OCR error"),
      };
      setMangaOcrPageEntryForFile(workingFile, pageKey, nextEntry, pageFiles.length, job.mode);
      workingProfile.session.pages[pageKey] = {
        pageIndex: index,
        pageNumber: index + 1,
        imagePath,
        source: "backend",
        computedAt: new Date().toISOString(),
        status: "error",
        errorMessage: String(error?.message || error || "OCR error"),
        profile: null,
      };
      ocrFileDirty = true;
      profileFileDirty = true;
      dirtyPageCount += 1;
      await flushWorkingState(false);
      touchQueueJob(job, {
        completedPages: Number(workingFile.progress?.completedPages || 0),
        failedPages: Number(workingFile.progress?.failedPages || 0),
        message: String(error?.message || error || "OCR error"),
      });
    }
  }

  touchQueueJob(job, {
    status: "completed",
    completedAt: new Date().toISOString(),
    completedPages: Number(workingFile.progress?.completedPages || 0),
    failedPages: Number(workingFile.progress?.failedPages || 0),
    currentPage: undefined,
    currentPagePath: undefined,
    message: workingFile.progress?.failedPages ? "Termine avec erreurs" : "Termine",
  });
  profileFileDirty = true;
  await flushWorkingState(true);
}

async function runOcrQueue() {
  if (ocrRuntimeState.ocrQueueRunnerPromise) {
    return ocrRuntimeState.ocrQueueRunnerPromise;
  }

  ocrRuntimeState.ocrQueueRunnerPromise = (async () => {
    while (true) {
      const job = getNextRunnableQueueJob();
      if (!job) {
        break;
      }

      try {
        await processQueueJob(job);
        showQueueJobCompletionNotification(job);
      } catch (error: any) {
        touchQueueJob(job, {
          status: "error",
          completedAt: new Date().toISOString(),
          message: String(error?.message || error || "Queue processing error"),
        });
        showQueueJobCompletionNotification(job);
      }
    }
  })();

  try {
    await ocrRuntimeState.ocrQueueRunnerPromise;
  } finally {
    ocrRuntimeState.ocrQueueRunnerPromise = null;
  }
}

registerQueueRunScheduler(() => {
  void runOcrQueue();
});
