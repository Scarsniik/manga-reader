import { IpcMainInvokeEvent } from "electron";
import path from "path";
import { getSettings } from "../params";
import { getMangaById, getMangas } from "../mangas";
import { listImageFiles } from "../pages";
import { ensureOcrDirs, resolveImagePath, resolveWorkerInput } from "./helpers";
import {
  addManualBoxesToMangaPage,
  detectLanguageForManga,
  readMangaOcrFile,
  removeManualBoxFromMangaPage,
} from "./manga-file";
import { getQueueStatusInternal, startMangaOcrInternal, recognizePageInternal, getMangaOcrStatusInternal, ensureMangaOcrReadyForVocabularyExtraction, enqueueMangaQueueJob, pauseQueueJob, resumeQueueJob, cancelQueueJob, cancelAllQueueJobs } from "./queue";
import { ocrRuntimeState } from "./state";
import { buildVocabularyFileFromOcr, normalizeVocabularyMode, readMangaVocabularyForUi, writeMangaVocabularyFile } from "./vocabulary";
import { callWorkerPrewarm, ensureOcrWorkerAvailable, normalizeRawResult, terminateOcrWorker, callWorkerRecognize } from "./worker";
import { isOcrRuntimeUnavailableError } from "../ocrRuntime/index";
import type { NormalizedBox } from "./types";

export async function ocrRecognize(_event: IpcMainInvokeEvent, imagePathOrDataUrl: string, opts?: Record<string, any>) {
  if (!imagePathOrDataUrl) {
    throw new Error("No image provided for OCR");
  }

  const settings = await getSettings();
  await ensureOcrWorkerAvailable(settings);
  await ensureOcrDirs();

  const { imagePath, cleanup } = await resolveWorkerInput(imagePathOrDataUrl);

  try {
    if (opts?.manualCropMode) {
      const raw = await callWorkerRecognize(imagePath, settings, { mode: "manual_crop" });
      return normalizeRawResult(raw, imagePath, false, {
        computedAt: new Date().toISOString(),
        forceRefreshUsed: true,
      });
    }

    const mangaContext = opts?.mangaId && opts?.mangaPath
      ? {
        id: String(opts.mangaId),
        title: String(opts.mangaTitle || path.basename(String(opts.mangaPath))),
        path: String(opts.mangaPath),
      }
      : null;

    const pageIndex = typeof opts?.pageIndex === "number" ? opts.pageIndex : undefined;
    const { result } = await recognizePageInternal(imagePath, settings, {
      forceRefresh: !!opts?.forceRefresh,
      manga: mangaContext,
      pageIndex,
      mode: "on_demand",
      passProfile: opts?.heavyPass ? "heavy" : "standard",
    });
    return result;
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
}

export async function ocrAddManualSelections(
  _event: IpcMainInvokeEvent,
  payload?: Record<string, any>,
) {
  const mangaId = payload?.mangaId;
  const imagePathValue = payload?.imagePath;
  const pageIndexValue = payload?.pageIndex;
  const boxes = payload?.boxes;

  if (!mangaId) {
    throw new Error("Missing mangaId for manual OCR selection");
  }

  if (typeof imagePathValue !== "string" || !imagePathValue.trim()) {
    throw new Error("Missing imagePath for manual OCR selection");
  }

  if (typeof pageIndexValue !== "number" || !Number.isFinite(pageIndexValue) || pageIndexValue < 0) {
    throw new Error("Missing pageIndex for manual OCR selection");
  }

  const manga = await getMangaById(String(mangaId));
  if (!manga) {
    throw new Error("Manga not found");
  }

  const imagePath = resolveImagePath(imagePathValue);
  const result = await addManualBoxesToMangaPage(manga, imagePath, Math.floor(pageIndexValue), boxes as NormalizedBox[]);
  if (!result) {
    throw new Error("Unable to save manual OCR selections");
  }

  return result;
}

export async function ocrDeleteManualSelection(
  _event: IpcMainInvokeEvent,
  payload?: Record<string, any>,
) {
  const mangaId = payload?.mangaId;
  const imagePathValue = payload?.imagePath;
  const pageIndexValue = payload?.pageIndex;
  const boxId = payload?.boxId;

  if (!mangaId) {
    throw new Error("Missing mangaId for manual OCR removal");
  }

  if (typeof imagePathValue !== "string" || !imagePathValue.trim()) {
    throw new Error("Missing imagePath for manual OCR removal");
  }

  if (typeof pageIndexValue !== "number" || !Number.isFinite(pageIndexValue) || pageIndexValue < 0) {
    throw new Error("Missing pageIndex for manual OCR removal");
  }

  if (typeof boxId !== "string" || !boxId.trim()) {
    throw new Error("Missing boxId for manual OCR removal");
  }

  const manga = await getMangaById(String(mangaId));
  if (!manga) {
    throw new Error("Manga not found");
  }

  const imagePath = resolveImagePath(imagePathValue);
  const result = await removeManualBoxFromMangaPage(manga, imagePath, Math.floor(pageIndexValue), boxId.trim());
  if (!result) {
    throw new Error("Unable to remove manual OCR selection");
  }

  return result;
}

export async function ocrGetMangaStatus(_event: IpcMainInvokeEvent, mangaId: string) {
  const manga = await getMangaById(mangaId);
  if (!manga) {
    throw new Error("Manga not found");
  }
  return getMangaOcrStatusInternal(manga);
}

export async function ocrGetMangaCompletionMap(_event: IpcMainInvokeEvent, mangaIds?: string[]) {
  const requestedIds = Array.isArray(mangaIds) && mangaIds.length > 0
    ? new Set(mangaIds.map((id) => String(id)))
    : null;
  const mangas = (await getMangas())
    .filter((manga: any) => !requestedIds || requestedIds.has(String(manga.id)));

  const entries = await Promise.all(mangas.map(async (manga: any) => {
    const status = await getMangaOcrStatusInternal(manga);
    const totalPages = Math.max(Number(status.totalPages || 0), Number(status.progress?.totalPages || 0));
    const processedPages = Number(status.completedPages || 0) + Number(status.progress?.failedPages || 0);
    const hasCompleteOcr = !!status.exists && totalPages > 0 && processedPages >= totalPages;
    return [String(manga.id), hasCompleteOcr] as const;
  }));

  return Object.fromEntries(entries);
}

export async function ocrStartManga(_event: IpcMainInvokeEvent, mangaId: string, options?: Record<string, any>) {
  const manga = await getMangaById(mangaId);
  if (!manga) {
    throw new Error("Manga not found");
  }
  return startMangaOcrInternal(manga, {
    ...(options || {}),
    priority: "user_requested",
  });
}

export async function ocrStartLibrary(_event: IpcMainInvokeEvent, options?: Record<string, any>) {
  const allMangas = await getMangas();
  const requestedIds = Array.isArray(options?.mangaIds)
    ? new Set(options.mangaIds.map((id: unknown) => String(id)))
    : null;
  const mangas = requestedIds
    ? allMangas.filter((manga: any) => requestedIds.has(String(manga.id)))
    : allMangas;
  const settings = await getSettings();
  await ensureOcrWorkerAvailable(settings);
  const mode = options?.mode === "overwrite_all" ? "overwrite_all" : "missing_only";
  const queuedJobs = [];
  const skippedExisting: string[] = [];
  const skippedNonJapanese: Array<{ mangaId: string; title: string; detection: any }> = [];
  const uncertain: Array<{ mangaId: string; title: string; detection: any }> = [];

  for (const manga of mangas) {
    const status = await getMangaOcrStatusInternal(manga);
    if (mode === "missing_only" && status.exists && status.completedPages > 0) {
      skippedExisting.push(String(manga.id));
      continue;
    }

    const pageFiles = await listImageFiles(manga.path);
    const detection = await detectLanguageForManga(manga, pageFiles, settings, false);
    if (detection.status === "likely_non_japanese") {
      skippedNonJapanese.push({ mangaId: String(manga.id), title: String(manga.title), detection });
      continue;
    }
    if (detection.status === "uncertain") {
      uncertain.push({ mangaId: String(manga.id), title: String(manga.title), detection });
      continue;
    }

    queuedJobs.push(enqueueMangaQueueJob(manga, {
      overwrite: mode === "overwrite_all",
      mode: "full_manga",
      detection,
      priority: "background",
      heavyPass: !!options?.heavyPass,
    }));
  }

  return {
    scope: requestedIds ? "subset" : "library",
    requestedCount: mangas.length,
    queuedCount: queuedJobs.length,
    queuedJobs,
    skippedExisting,
    skippedNonJapanese,
    uncertain,
    status: await getQueueStatusInternal(),
  };
}

export async function ocrQueueImportManga(manga: any) {
  const settings = await getSettings();
  if (!settings?.ocrAutoRunOnImport) {
    return { queued: false, reason: "auto-import-disabled" };
  }

  try {
    await ensureOcrWorkerAvailable(settings);
  } catch (error) {
    if (isOcrRuntimeUnavailableError(error)) {
      return {
        queued: false,
        reason: "ocr-runtime-missing",
        runtimeStatus: error.runtimeStatus,
      };
    }

    throw error;
  }

  const pageFiles = await listImageFiles(manga.path);
  const detection = await detectLanguageForManga(manga, pageFiles, settings, false);

  if (detection.status !== "likely_japanese") {
    return {
      queued: false,
      reason: detection.status,
      detection,
    };
  }

  return {
    queued: true,
    job: enqueueMangaQueueJob(manga, {
      overwrite: false,
      mode: "full_manga",
      detection,
      priority: "background",
      heavyPass: false,
    }),
  };
}

export async function ocrReadMangaVocabulary(_event: IpcMainInvokeEvent, mangaId: string) {
  const manga = await getMangaById(mangaId);
  if (!manga) {
    throw new Error("Manga not found");
  }

  return readMangaVocabularyForUi(manga.path);
}

export async function ocrExtractMangaVocabulary(
  _event: IpcMainInvokeEvent,
  mangaId: string,
  options?: Record<string, any>,
) {
  const manga = await getMangaById(mangaId);
  if (!manga) {
    throw new Error("Manga not found");
  }

  const ensureResult = await ensureMangaOcrReadyForVocabularyExtraction(manga, options);
  if ((ensureResult as any)?.requiresConfirmation) {
    return ensureResult;
  }

  const settings = await getSettings();
  const apiKey = String(settings?.jpdbApiKey || "").trim();
  if (!apiKey) {
    throw new Error("JPDB API key not configured.");
  }

  const ocrFile = await readMangaOcrFile(manga.path);
  if (!ocrFile) {
    throw new Error("Le fichier OCR du manga est introuvable apres la fin du job.");
  }

  const mode = normalizeVocabularyMode(options?.mode);
  const vocabularyFile = await buildVocabularyFileFromOcr(manga, ocrFile, mode, apiKey);
  const savedVocabulary = await writeMangaVocabularyFile(manga.path, vocabularyFile);

  return {
    ok: true,
    status: await getMangaOcrStatusInternal(manga),
    vocabulary: {
      ...(await readMangaVocabularyForUi(manga.path)),
      tokens: savedVocabulary.tokens,
      csv: savedVocabulary.tokens.join(","),
    },
  };
}

export async function ocrGetQueueStatus() {
  return getQueueStatusInternal();
}

export async function ocrPauseJob(_event: IpcMainInvokeEvent, jobId: string) {
  return pauseQueueJob(jobId);
}

export async function ocrResumeJob(_event: IpcMainInvokeEvent, jobId: string) {
  return resumeQueueJob(jobId);
}

export async function ocrCancelJob(_event: IpcMainInvokeEvent, jobId: string) {
  return cancelQueueJob(jobId);
}

export async function ocrCancelAllJobs() {
  return cancelAllQueueJobs();
}

export async function prewarmOcrEngine() {
  if (ocrRuntimeState.workerPrewarmPromise) {
    return ocrRuntimeState.workerPrewarmPromise;
  }

  ocrRuntimeState.workerPrewarmPromise = (async () => {
    const settings = await getSettings();
    await ensureOcrWorkerAvailable(settings);
    await ensureOcrDirs();
    await callWorkerPrewarm(settings);
    return true;
  })();

  try {
    return await ocrRuntimeState.workerPrewarmPromise;
  } catch (error) {
    ocrRuntimeState.workerPrewarmPromise = null;
    throw error;
  }
}

export async function processOcrResult(res: any, originalPathOrDataUrl: string, _options?: Record<string, any>) {
  const { imagePath, cleanup } = await resolveWorkerInput(originalPathOrDataUrl);

  try {
    return await normalizeRawResult(res as any, imagePath, false);
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
}

export async function ocrTerminate() {
  return terminateOcrWorker();
}
