import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { BrowserWindow, type IpcMainInvokeEvent } from "electron";
import {
  type DownloadScraperMangaRequest,
  type QueueScraperDownloadResult,
  type ScraperDownloadJob,
  type ScraperDownloadQueueCounts,
  type ScraperDownloadQueueStatus,
} from "../../scraper";
import {
  addManga,
  createStoredThumbnailForMangaFromBuffer,
  ensureStoredThumbnailForManga,
  getMangaById,
  patchMangaById,
} from "../mangas";
import { ocrQueueImportManga } from "../ocr";
import { listImageFiles } from "../pages";
import { ensureSeriesByTitle } from "../series";
import { getTags } from "../tags";
import {
  createScraperDownloadJob,
  normalizeScraperDownloadRequest,
  buildDownloadHeaders,
  cleanupScraperDownloadFolder,
  ensureScraperDownloadNotCancelled,
  extractChapterValueFromLabel,
  getConfiguredLibraryRoot,
  getUniqueFolderPath,
  inferExtensionFromUrl,
  isScraperDownloadAbortError,
  isScraperDownloadTerminalStatus,
} from "./download-helpers";
import {
  type CompletedScraperDownload,
  type InternalScraperDownloadJob,
} from "./shared";

const scraperDownloadJobs = new Map<string, InternalScraperDownloadJob>();
let scraperDownloadOrder: string[] = [];
let scraperDownloadRunnerPromise: Promise<void> | null = null;

const cloneScraperDownloadJob = (job: InternalScraperDownloadJob): ScraperDownloadJob => {
  const {
    pageUrls: _pageUrls,
    defaultTagIds: _defaultTagIds,
    defaultLanguage: _defaultLanguage,
    autoAssignSeriesOnChapterDownload: _autoAssignSeriesOnChapterDownload,
    seriesTitle: _seriesTitle,
    thumbnailUrl: _thumbnailUrl,
    cancelRequested: _cancelRequested,
    abortController: _abortController,
    ...snapshot
  } = job;

  return {
    ...snapshot,
    message: snapshot.message ?? null,
    error: snapshot.error ?? null,
  };
};

const touchScraperDownloadJob = (
  job: InternalScraperDownloadJob,
  patch: Partial<InternalScraperDownloadJob>,
): InternalScraperDownloadJob => {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  scraperDownloadJobs.set(job.id, job);
  return job;
};

const notifyScraperDownloadChannel = (channel: "mangas-updated" | "series-updated") => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel);
  }
};

const getNextQueuedScraperDownloadJob = (): InternalScraperDownloadJob | null => (
  scraperDownloadOrder
    .map((jobId) => scraperDownloadJobs.get(jobId))
    .find((job): job is InternalScraperDownloadJob => job != null && job.status === "queued")
  ?? null
);

const buildScraperDownloadQueueCounts = (jobs: ScraperDownloadJob[]): ScraperDownloadQueueCounts => (
  jobs.reduce((counts, job) => {
    counts.total += 1;
    counts[job.status] += 1;
    if (!isScraperDownloadTerminalStatus(job.status)) {
      counts.active += 1;
    }
    return counts;
  }, {
    total: 0,
    active: 0,
    queued: 0,
    running: 0,
    completed: 0,
    error: 0,
    cancelled: 0,
  } satisfies ScraperDownloadQueueCounts)
);

const finalizeScraperDownloadJob = (
  job: InternalScraperDownloadJob,
  patch: Partial<InternalScraperDownloadJob>,
) => {
  touchScraperDownloadJob(job, {
    ...patch,
    abortController: null,
    currentPage: undefined,
    currentPageUrl: undefined,
    completedAt: patch.completedAt ?? new Date().toISOString(),
  });
};

type ResolvedReplacementTarget = {
  manga: any;
  hasLocalPath: boolean;
};

const resolveReplacementManga = async (
  job: InternalScraperDownloadJob,
): Promise<ResolvedReplacementTarget | null> => {
  if (!job.replaceMangaId) {
    return null;
  }

  const manga = await getMangaById(job.replaceMangaId);
  if (!manga?.id) {
    throw new Error("Le manga a remplacer est introuvable.");
  }

  return {
    manga,
    hasLocalPath: Boolean(manga.path && typeof manga.path === "string"),
  };
};

const createReplacementStagingFolder = async (targetFolderPath: string): Promise<string> => {
  const parentPath = path.dirname(targetFolderPath);
  const stagingPath = path.join(parentPath, `.manga-helper-redownload-${randomUUID()}`);
  await fs.mkdir(stagingPath, { recursive: true });
  return stagingPath;
};

const replaceLocalImageFiles = async (
  sourceFolderPath: string,
  targetFolderPath: string,
) => {
  await fs.mkdir(targetFolderPath, { recursive: true });

  const oldImageFiles = await listImageFiles(targetFolderPath).catch(() => []);
  for (const imageFile of oldImageFiles) {
    await fs.rm(imageFile, { force: true });
  }

  const newImageFiles = await listImageFiles(sourceFolderPath);
  for (const imageFile of newImageFiles) {
    await fs.rename(imageFile, path.join(targetFolderPath, path.basename(imageFile)));
  }

  await cleanupScraperDownloadFolder(sourceFolderPath);
};

const applyScraperThumbnail = async (
  manga: any,
  job: InternalScraperDownloadJob,
): Promise<any> => {
  if (!manga?.id) {
    return manga;
  }

  if (job.thumbnailUrl) {
    try {
      const thumbnailResponse = await fetch(job.thumbnailUrl, {
        method: "GET",
        redirect: "follow",
        headers: buildDownloadHeaders(job.refererUrl),
      });

      if (
        thumbnailResponse.ok
        && String(thumbnailResponse.headers.get("content-type") || "").toLowerCase().startsWith("image/")
      ) {
        const thumbnailBuffer = Buffer.from(await thumbnailResponse.arrayBuffer());
        const thumbnailPath = await createStoredThumbnailForMangaFromBuffer(
          String(manga.id),
          thumbnailBuffer,
        );

        if (thumbnailPath) {
          return patchMangaById(String(manga.id), { thumbnailPath });
        }
      }
    } catch (error) {
      console.warn("Failed to override scraper download thumbnail from scraper cover", {
        mangaId: manga.id,
        thumbnailUrl: job.thumbnailUrl,
        error,
      });
    }
  }

  const { manga: mangaWithThumbnail } = await ensureStoredThumbnailForManga(manga, {
    forceRegenerate: true,
  });

  if (mangaWithThumbnail?.thumbnailPath !== manga.thumbnailPath) {
    return patchMangaById(String(manga.id), { thumbnailPath: mangaWithThumbnail.thumbnailPath ?? null });
  }

  return mangaWithThumbnail;
};

const executeScraperDownloadJob = async (
  job: InternalScraperDownloadJob,
): Promise<CompletedScraperDownload> => {
  const libraryRoot = await getConfiguredLibraryRoot();
  await fs.mkdir(libraryRoot, { recursive: true });

  ensureScraperDownloadNotCancelled(job);

  const replacementTarget = await resolveReplacementManga(job);
  const replacementManga = replacementTarget?.manga ?? null;
  const hasLocalReplacementPath = Boolean(replacementTarget?.hasLocalPath);
  const targetFolderPath = hasLocalReplacementPath && replacementManga?.path
    ? path.resolve(replacementManga.path)
    : await getUniqueFolderPath(libraryRoot, job.title);
  const downloadFolderPath = hasLocalReplacementPath
    ? await createReplacementStagingFolder(targetFolderPath)
    : targetFolderPath;

  await fs.mkdir(downloadFolderPath, { recursive: true });
  touchScraperDownloadJob(job, {
    folderPath: targetFolderPath,
    libraryRoot,
    message: hasLocalReplacementPath
      ? "Preparation du remplacement local"
      : "Preparation du dossier local",
  });

  const fileNameWidth = Math.max(3, String(job.pageUrls.length - 1).length);

  try {
    for (let index = 0; index < job.pageUrls.length; index += 1) {
      const pageUrl = job.pageUrls[index];
      ensureScraperDownloadNotCancelled(job);

      touchScraperDownloadJob(job, {
        currentPage: index + 1,
        currentPageUrl: pageUrl,
        message: `Telechargement de la page ${index + 1}/${job.totalPages}`,
      });

      const response = await fetch(pageUrl, {
        method: "GET",
        redirect: "follow",
        headers: buildDownloadHeaders(job.refererUrl),
        signal: job.abortController?.signal,
      });

      if (!response.ok) {
        throw new Error(`La page ${index + 1} a repondu avec le code HTTP ${response.status}.`);
      }

      const contentType = response.headers.get("content-type");
      if (!String(contentType || "").toLowerCase().startsWith("image/")) {
        throw new Error(`La page ${index + 1} ne ressemble pas a une image telechargeable.`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const extension = inferExtensionFromUrl(response.url || pageUrl, contentType);
      const fileName = `${String(index).padStart(fileNameWidth, "0")}${extension}`;
      const targetFilePath = path.join(downloadFolderPath, fileName);

      await fs.writeFile(targetFilePath, buffer);
      touchScraperDownloadJob(job, {
        downloadedPages: index + 1,
        downloadedCount: index + 1,
        message: `Page ${index + 1}/${job.totalPages} telechargee`,
      });
    }

    ensureScraperDownloadNotCancelled(job);
    touchScraperDownloadJob(job, {
      message: hasLocalReplacementPath
        ? "Remplacement des images locales"
        : "Ajout du manga a la bibliotheque",
    });
    if (hasLocalReplacementPath) {
      await replaceLocalImageFiles(downloadFolderPath, targetFolderPath);
    }
  } catch (error) {
    await cleanupScraperDownloadFolder(downloadFolderPath);
    throw error;
  }

  const availableTags = await getTags();
  const availableTagIds = new Set(
    Array.isArray(availableTags)
      ? availableTags.map((tag) => String(tag?.id ?? "").trim()).filter((tagId) => tagId.length > 0)
      : [],
  );
  const defaultTagIds = job.defaultTagIds.filter((tagId) => availableTagIds.has(tagId));
  const linkedSeries = job.autoAssignSeriesOnChapterDownload && job.seriesTitle && job.chapterLabel
    ? await ensureSeriesByTitle(job.seriesTitle)
    : null;
  const chapterValue = job.chapterLabel
    ? extractChapterValueFromLabel(job.chapterLabel)
    : undefined;

  if (replacementManga) {
    const updatedManga = await patchMangaById(String(replacementManga.id), {
      title: job.title,
      path: replacementManga.path || targetFolderPath,
      sourceKind: "scraper",
      scraperId: job.scraperId ?? replacementManga.scraperId ?? null,
      sourceUrl: job.sourceUrl ?? job.refererUrl ?? replacementManga.sourceUrl ?? null,
      sourceChapterUrl: job.sourceChapterUrl ?? null,
      sourceChapterLabel: job.sourceChapterLabel ?? job.chapterLabel ?? null,
      currentPage: null,
      pages: job.pageUrls.length,
    });
    const mangaWithThumbnail = await applyScraperThumbnail(updatedManga, job);

    return {
      result: {
        ok: true,
        mangaId: String(mangaWithThumbnail.id),
        folderPath: targetFolderPath,
        libraryRoot,
        downloadedCount: job.pageUrls.length,
      },
      notifySeriesUpdated: false,
      libraryManga: mangaWithThumbnail,
    };
  }

  const createdManga = await addManga(undefined as any, {
    id: randomUUID(),
    title: job.title,
    path: targetFolderPath,
    createdAt: new Date().toISOString(),
    authorIds: [],
    tagIds: defaultTagIds,
    language: job.defaultLanguage,
    seriesId: linkedSeries?.id ?? null,
    chapters: linkedSeries ? (chapterValue || job.chapterLabel) : undefined,
    sourceKind: "scraper",
    scraperId: job.scraperId ?? null,
    sourceUrl: job.sourceUrl ?? job.refererUrl ?? null,
    sourceChapterUrl: job.sourceChapterUrl ?? null,
    sourceChapterLabel: job.sourceChapterLabel ?? job.chapterLabel ?? null,
  });

  const inserted = Array.isArray(createdManga)
    ? createdManga[createdManga.length - 1]
    : null;

  if (!inserted?.id) {
    throw new Error("Le manga a ete telecharge, mais son ajout a la bibliotheque a echoue.");
  }

  const mangaWithThumbnail = await applyScraperThumbnail(inserted, job);

  return {
    result: {
      ok: true,
      mangaId: String(mangaWithThumbnail.id),
      folderPath: targetFolderPath,
      libraryRoot,
      downloadedCount: job.pageUrls.length,
    },
    notifySeriesUpdated: Boolean(linkedSeries),
    libraryManga: mangaWithThumbnail,
  };
};

async function runQueuedScraperDownloadJob(job: InternalScraperDownloadJob): Promise<void> {
  if (job.status !== "queued") {
    return;
  }

  touchScraperDownloadJob(job, {
    status: "running",
    startedAt: job.startedAt ?? new Date().toISOString(),
    error: null,
    message: "Preparation du telechargement",
  });
  job.abortController = new AbortController();

  try {
    const completed = await executeScraperDownloadJob(job);

    finalizeScraperDownloadJob(job, {
      status: "completed",
      downloadedPages: completed.result.downloadedCount,
      downloadedCount: completed.result.downloadedCount,
      folderPath: completed.result.folderPath,
      libraryRoot: completed.result.libraryRoot,
      mangaId: completed.result.mangaId,
      message: `${completed.result.downloadedCount} page(s) telechargee(s)`,
      error: null,
      cancelRequested: false,
    });

    notifyScraperDownloadChannel("mangas-updated");
    if (completed.notifySeriesUpdated) {
      notifyScraperDownloadChannel("series-updated");
    }

    setTimeout(() => {
      void (async () => {
        try {
          const queueResult = await ocrQueueImportManga(completed.libraryManga);
          if (queueResult?.queued) {
            notifyScraperDownloadChannel("mangas-updated");
          }
        } catch (ocrError) {
          console.warn("Failed to auto-queue OCR after scraper download import", {
            mangaId: completed.result.mangaId,
            error: ocrError,
          });
        }
      })();
    }, 0);
  } catch (error) {
    if (isScraperDownloadAbortError(error) || job.cancelRequested) {
      finalizeScraperDownloadJob(job, {
        status: "cancelled",
        message: "Telechargement annule",
        error: null,
        cancelRequested: true,
      });
      return;
    }

    finalizeScraperDownloadJob(job, {
      status: "error",
      message: "Telechargement en erreur",
      error: error instanceof Error ? error.message : "Le telechargement a echoue.",
      cancelRequested: false,
    });
  }
}

const scheduleScraperDownloadRun = () => {
  if (scraperDownloadRunnerPromise) {
    return;
  }

  scraperDownloadRunnerPromise = (async () => {
    while (true) {
      const nextJob = getNextQueuedScraperDownloadJob();
      if (!nextJob) {
        break;
      }

      try {
        await runQueuedScraperDownloadJob(nextJob);
      } catch (error) {
        console.error("Unexpected scraper download queue failure", {
          jobId: nextJob.id,
          error,
        });
      }
    }
  })()
    .finally(() => {
      scraperDownloadRunnerPromise = null;
      if (getNextQueuedScraperDownloadJob()) {
        scheduleScraperDownloadRun();
      }
    });
};

export async function queueScraperDownload(
  _event: IpcMainInvokeEvent,
  request: DownloadScraperMangaRequest,
): Promise<QueueScraperDownloadResult> {
  const normalizedRequest = normalizeScraperDownloadRequest(request);
  const job = createScraperDownloadJob(normalizedRequest);

  scraperDownloadJobs.set(job.id, job);
  scraperDownloadOrder = scraperDownloadOrder.filter((jobId) => jobId !== job.id);
  scraperDownloadOrder.push(job.id);
  scheduleScraperDownloadRun();

  return {
    ok: true,
    job: cloneScraperDownloadJob(job),
    status: await getScraperDownloadQueueStatus(),
  };
}

export async function getScraperDownloadQueueStatus(): Promise<ScraperDownloadQueueStatus> {
  const jobs = scraperDownloadOrder
    .map((jobId) => scraperDownloadJobs.get(jobId))
    .filter((job): job is InternalScraperDownloadJob => Boolean(job))
    .map((job) => cloneScraperDownloadJob(job));

  return {
    jobs,
    counts: buildScraperDownloadQueueCounts(jobs),
  };
}

export async function cancelScraperDownloadJob(
  _event: IpcMainInvokeEvent,
  jobId: string,
): Promise<ScraperDownloadJob> {
  const job = scraperDownloadJobs.get(String(jobId));
  if (!job) {
    throw new Error("Job de telechargement introuvable.");
  }

  if (isScraperDownloadTerminalStatus(job.status)) {
    return cloneScraperDownloadJob(job);
  }

  const shouldFinishImmediately = job.status === "queued";
  touchScraperDownloadJob(job, {
    cancelRequested: true,
    status: shouldFinishImmediately ? "cancelled" : job.status,
    message: "Annulation demandee",
    completedAt: shouldFinishImmediately ? new Date().toISOString() : job.completedAt,
  });

  job.abortController?.abort();
  return cloneScraperDownloadJob(job);
}

export async function cancelAllScraperDownloadJobs() {
  const activeJobs = scraperDownloadOrder
    .map((jobId) => scraperDownloadJobs.get(jobId))
    .filter((job): job is InternalScraperDownloadJob => Boolean(job))
    .filter((job) => !isScraperDownloadTerminalStatus(job.status));

  for (const job of activeJobs) {
    const shouldFinishImmediately = job.status === "queued";
    touchScraperDownloadJob(job, {
      cancelRequested: true,
      status: shouldFinishImmediately ? "cancelled" : job.status,
      message: "Annulation demandee",
      completedAt: shouldFinishImmediately ? new Date().toISOString() : job.completedAt,
    });
    job.abortController?.abort();
  }

  return {
    cancelledCount: activeJobs.length,
    status: await getScraperDownloadQueueStatus(),
  };
}
