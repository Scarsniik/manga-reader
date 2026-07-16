import path from "path";
import { getSettings } from "../params";
import { listImageFiles } from "../pages";
import { getMangaById } from "../mangas";
import {
  MANGA_OCR_CHECKPOINT_INTERVAL_MS,
  MANGA_OCR_CHECKPOINT_PAGE_INTERVAL,
  MANGA_OCR_PAGE_SCHEMA_VERSION,
} from "./constants";
import { preserveEditedOcrText } from "./edited-box-overrides";
import { buildMangaPageKey, getImageFingerprint } from "./helpers";
import {
  createEmptyMangaOcrProfileFile,
  ensureMangaOcrFile,
  isStoredPageUpToDate,
  readMangaOcrFile,
  setMangaOcrPageEntryForFile,
  showQueueJobCompletionNotification,
  syncMangaOcrProfileSession,
  updateLanguageDetectionFromRecognizedPage,
  writeMangaOcrFile,
  writeMangaOcrProfileFile,
} from "./manga-file";
import { withMangaOcrFileMutationLock } from "./ocr-file-mutation-lock";
import {
  doesOcrPageEntryMatchSource,
  getOcrPageErrorFallback,
  prepareOcrPagesForOverwrite,
  rebaseUserOwnedOcrPageFields,
} from "./ocr-page-preservation";
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
  const orderedPages = pageFiles.map((imagePath, index) => ({
    pageKey: buildMangaPageKey(index, imagePath),
    imagePath,
  }));
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
      pages: prepareOcrPagesForOverwrite(workingFile.pages, orderedPages),
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
      workingFile = await withMangaOcrFileMutationLock(manga.path, async () => {
        const latestFile = await readMangaOcrFile(manga.path);
        if (latestFile) {
          const latestLanguageDetection = latestFile.languageDetection;
          workingFile = {
            ...workingFile,
            languageDetection: workingFile.languageDetection?.status === "likely_japanese"
              ? workingFile.languageDetection
              : latestLanguageDetection?.status !== "not_run"
                ? latestLanguageDetection
                : workingFile.languageDetection,
            pages: rebaseUserOwnedOcrPageFields(workingFile.pages, latestFile.pages),
          };
        }
        return writeMangaOcrFile(manga.path, workingFile);
      });
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

  const setProcessedPageEntry = (pageKey: string, entry: MangaOcrPageEntry) => {
    if (job.overwrite && workingFile.pages[pageKey]) {
      workingFile.pages[pageKey] = {
        ...workingFile.pages[pageKey],
        status: "pending",
      };
    }
    return setMangaOcrPageEntryForFile(workingFile, pageKey, entry, pageFiles.length, job.mode);
  };

  await flushWorkingState(true);
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
          completedPages: Number(workingFile.progress.completedPages || 0),
          failedPages: Number(workingFile.progress.failedPages || 0),
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

      const sourceFingerprintIsUnchanged = doesOcrPageEntryMatchSource(existingEntry, fingerprint);
      const preservedResult = preserveEditedOcrText(
        Array.isArray(result.boxes) ? result.boxes : [],
        Array.isArray(result.page?.blocks) ? result.page.blocks : [],
        sourceFingerprintIsUnchanged ? existingEntry?.boxes : undefined,
        { retainUnmatched: sourceFingerprintIsUnchanged },
      );
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
        boxes: preservedResult.boxes,
        blocks: preservedResult.blocks,
        manualBoxes: sourceFingerprintIsUnchanged && Array.isArray(existingEntry?.manualBoxes)
          ? existingEntry.manualBoxes
          : [],
        computedAt: result.debug?.computedAt || new Date().toISOString(),
        passProfile,
      };

      await updateLanguageDetectionFromRecognizedPage(manga, workingFile, index, imagePath, result, settings);
      setProcessedPageEntry(pageKey, nextEntry);
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
        completedPages: Number(workingFile.progress.completedPages || 0),
        failedPages: Number(workingFile.progress.failedPages || 0),
      });
    } catch (error: any) {
      let failureFingerprint: { imagePath: string; size: number; mtimeMs: number } | null = null;
      try {
        failureFingerprint = await getImageFingerprint(imagePath);
      } catch {
        failureFingerprint = null;
      }
      const errorFallback = getOcrPageErrorFallback(existingEntry, failureFingerprint);
      const nextEntry: MangaOcrPageEntry = {
        schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
        status: "error",
        pageIndex: index,
        pageNumber: index + 1,
        fileName: path.basename(imagePath),
        imagePath,
        sourceSize: failureFingerprint?.size,
        sourceMtimeMs: failureFingerprint?.mtimeMs,
        width: errorFallback.width,
        height: errorFallback.height,
        boxes: errorFallback.boxes,
        blocks: errorFallback.blocks,
        manualBoxes: errorFallback.manualBoxes,
        errorMessage: String(error?.message || error || "OCR error"),
      };
      setProcessedPageEntry(pageKey, nextEntry);
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
        completedPages: Number(workingFile.progress.completedPages || 0),
        failedPages: Number(workingFile.progress.failedPages || 0),
        message: String(error?.message || error || "OCR error"),
      });
    }
  }

  if (job.overwrite) {
    const currentPageKeys = new Set(orderedPages.map(({ pageKey }) => pageKey));
    for (const storedPageKey of Object.keys(workingFile.pages || {})) {
      if (!currentPageKeys.has(storedPageKey)) {
        delete workingFile.pages[storedPageKey];
      }
    }

    const storedPages = Object.values(workingFile.pages || {});
    const highestPageNumber = storedPages.reduce(
      (highest, page) => Math.max(highest, Number(page.pageNumber || 0)),
      0,
    );
    workingFile.progress = {
      ...workingFile.progress,
      totalPages: pageFiles.length,
      completedPages: storedPages.filter((page) => page.status === "done").length,
      failedPages: storedPages.filter((page) => page.status === "error").length,
      lastProcessedPage: highestPageNumber > 0 ? highestPageNumber : undefined,
      mode: job.mode,
      updatedAt: new Date().toISOString(),
    };
    ocrFileDirty = true;
  }

  const finalProgress = {
    completedPages: Number(workingFile.progress.completedPages || 0),
    failedPages: Number(workingFile.progress.failedPages || 0),
  };
  touchQueueJob(job, {
    status: "completed",
    completedAt: new Date().toISOString(),
    ...finalProgress,
    currentPage: undefined,
    currentPagePath: undefined,
    message: finalProgress.failedPages ? "Termine avec erreurs" : "Termine",
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
