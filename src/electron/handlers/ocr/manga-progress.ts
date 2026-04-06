import { MANGA_OCR_PAGE_SCHEMA_VERSION, MANGA_OCR_SCHEMA_VERSION } from "./constants";
import {
  doesStoredPassProfileSatisfy,
  getStoredEntryPassProfile,
  normalizeMangaOcrProgressMode,
} from "./helpers";
import type {
  MangaOcrFile,
  MangaOcrPageEntry,
  NormalizedOcrResult,
  OcrPassProfile,
  OcrQueueJobMode,
} from "./types";

function getTrackedMangaOcrStatus(entry?: MangaOcrPageEntry | null): "done" | "error" | null {
  if (entry?.status === "done" || entry?.status === "error") {
    return entry.status;
  }
  return null;
}

function getHighestStoredMangaPageNumber(file: MangaOcrFile): number | undefined {
  let highestPageNumber = 0;

  for (const entry of Object.values(file.pages || {})) {
    const pageNumber = Number(entry?.pageNumber || 0);
    if (Number.isFinite(pageNumber) && pageNumber > highestPageNumber) {
      highestPageNumber = Math.floor(pageNumber);
    }
  }

  return highestPageNumber > 0 ? highestPageNumber : undefined;
}

function rebuildMangaFileProgress(file: MangaOcrFile, totalPages: number, mode: OcrQueueJobMode | "on_demand") {
  let completedPages = 0;
  let failedPages = 0;
  let lastProcessedPage = 0;

  for (const entry of Object.values(file.pages || {})) {
    if (entry?.status === "done") {
      completedPages += 1;
    } else if (entry?.status === "error") {
      failedPages += 1;
    }

    const pageNumber = Number(entry?.pageNumber || 0);
    if (Number.isFinite(pageNumber) && pageNumber > lastProcessedPage) {
      lastProcessedPage = Math.floor(pageNumber);
    }
  }

  const computedTotalPages = Math.max(totalPages, completedPages + failedPages, lastProcessedPage);
  file.progress = {
    ...file.progress,
    totalPages: computedTotalPages,
    completedPages,
    failedPages,
    lastProcessedPage: lastProcessedPage > 0 ? lastProcessedPage : undefined,
    mode: normalizeMangaOcrProgressMode(mode),
    updatedAt: new Date().toISOString(),
  };

  return file.progress;
}

export function ensureMangaFileProgress(file: MangaOcrFile, totalPages: number, mode: OcrQueueJobMode | "on_demand") {
  const progress = file.progress || {
    totalPages,
    completedPages: 0,
    failedPages: 0,
    lastProcessedPage: undefined,
    mode: normalizeMangaOcrProgressMode(mode),
    updatedAt: new Date().toISOString(),
  };
  const normalizedMode = normalizeMangaOcrProgressMode(progress.mode || mode);
  const completedPages = Number(progress.completedPages);
  const failedPages = Number(progress.failedPages);
  const lastProcessedPage = Number(progress.lastProcessedPage || 0);
  const computedTotalPages = Math.max(
    totalPages,
    Number(progress.totalPages || 0),
    Number.isFinite(completedPages) ? Math.floor(completedPages) : 0,
    Number.isFinite(failedPages) ? Math.floor(failedPages) : 0,
    Number.isFinite(lastProcessedPage) ? Math.floor(lastProcessedPage) : 0,
  );
  const hasValidCounts = Number.isFinite(completedPages)
    && completedPages >= 0
    && Number.isFinite(failedPages)
    && failedPages >= 0
    && (completedPages + failedPages) <= computedTotalPages;

  if (!hasValidCounts) {
    return rebuildMangaFileProgress(file, totalPages, normalizedMode);
  }

  let normalizedLastProcessedPage = Number.isFinite(lastProcessedPage) && lastProcessedPage > 0
    ? Math.floor(lastProcessedPage)
    : undefined;

  if (normalizedLastProcessedPage === undefined && Object.keys(file.pages || {}).length > 0) {
    normalizedLastProcessedPage = getHighestStoredMangaPageNumber(file);
  }

  file.progress = {
    ...progress,
    totalPages: computedTotalPages,
    completedPages: Math.floor(completedPages),
    failedPages: Math.floor(failedPages),
    lastProcessedPage: normalizedLastProcessedPage,
    mode: normalizedMode,
    updatedAt: progress.updatedAt || new Date().toISOString(),
  };

  return file.progress;
}

export function touchMangaFileProgress(file: MangaOcrFile, totalPages: number, mode: OcrQueueJobMode | "on_demand") {
  const progress = ensureMangaFileProgress(file, totalPages, mode);
  const normalizedMode = normalizeMangaOcrProgressMode(mode);
  const computedTotalPages = Math.max(
    totalPages,
    Number(progress.totalPages || 0),
    Number(progress.completedPages || 0) + Number(progress.failedPages || 0),
    Number(progress.lastProcessedPage || 0),
  );

  file.progress = {
    ...progress,
    totalPages: computedTotalPages,
    mode: normalizedMode,
    updatedAt: new Date().toISOString(),
  };

  return file.progress;
}

function updateMangaFileProgressForPageChange(
  file: MangaOcrFile,
  totalPages: number,
  mode: OcrQueueJobMode | "on_demand",
  previousEntry?: MangaOcrPageEntry,
  nextEntry?: MangaOcrPageEntry,
) {
  const progress = ensureMangaFileProgress(file, totalPages, mode);
  let completedPages = Number(progress.completedPages || 0);
  let failedPages = Number(progress.failedPages || 0);

  const previousStatus = getTrackedMangaOcrStatus(previousEntry);
  const nextStatus = getTrackedMangaOcrStatus(nextEntry);

  if (previousStatus === "done") {
    completedPages = Math.max(0, completedPages - 1);
  } else if (previousStatus === "error") {
    failedPages = Math.max(0, failedPages - 1);
  }

  if (nextStatus === "done") {
    completedPages += 1;
  } else if (nextStatus === "error") {
    failedPages += 1;
  }

  const previousLastProcessedPage = Number(progress.lastProcessedPage || 0);
  const nextPageNumber = Number(nextEntry?.pageNumber || 0);
  const previousPageNumber = Number(previousEntry?.pageNumber || 0);
  let lastProcessedPage = previousLastProcessedPage > 0 ? previousLastProcessedPage : 0;

  if (Number.isFinite(nextPageNumber) && nextPageNumber > 0) {
    lastProcessedPage = Math.max(lastProcessedPage, Math.floor(nextPageNumber));
  } else if (!nextEntry && previousPageNumber === previousLastProcessedPage) {
    lastProcessedPage = getHighestStoredMangaPageNumber(file) || 0;
  }

  const computedTotalPages = Math.max(totalPages, completedPages + failedPages, lastProcessedPage);
  file.progress = {
    ...progress,
    totalPages: computedTotalPages,
    completedPages,
    failedPages,
    lastProcessedPage: lastProcessedPage > 0 ? lastProcessedPage : undefined,
    mode: normalizeMangaOcrProgressMode(mode),
    updatedAt: new Date().toISOString(),
  };

  return file.progress;
}

export function setMangaOcrPageEntryForFile(
  file: MangaOcrFile,
  pageKey: string,
  entry: MangaOcrPageEntry,
  totalPages: number,
  mode: OcrQueueJobMode | "on_demand",
) {
  const previousEntry = file.pages?.[pageKey];
  file.pages[pageKey] = entry;
  updateMangaFileProgressForPageChange(file, totalPages, mode, previousEntry, entry);
  return file.pages[pageKey];
}

export function pageEntryToNormalized(
  entry: MangaOcrPageEntry,
  imagePath: string,
  source: "manga-file" | "app-cache" | "backend",
): NormalizedOcrResult | null {
  if (entry.status !== "done" || !entry.width || !entry.height) {
    return null;
  }

  const autoBoxes = Array.isArray(entry.boxes) ? entry.boxes : [];
  const manualBoxes = Array.isArray(entry.manualBoxes)
    ? entry.manualBoxes.map((box) => ({ ...box, manual: true }))
    : [];
  const boxes = [...autoBoxes, ...manualBoxes];
  const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];

  return {
    engine: "mokuro",
    width: entry.width,
    height: entry.height,
    boxes,
    fromCache: source !== "backend",
    debug: {
      cacheKey: "",
      computedAt: entry.computedAt || new Date(0).toISOString(),
      forceRefreshUsed: false,
      fromCache: source !== "backend",
      source,
    },
    page: {
      version: MANGA_OCR_SCHEMA_VERSION,
      engine: "mokuro",
      source: {
        imagePath,
        width: entry.width,
        height: entry.height,
      },
      fromCache: source !== "backend",
      blocks,
    },
  };
}

export function isStoredPageUpToDate(
  entry: MangaOcrPageEntry | undefined,
  fingerprint: { imagePath: string; size: number; mtimeMs: number },
  passProfile: OcrPassProfile = "standard",
) {
  if (!entry || entry.status !== "done") {
    return false;
  }

  if (entry.schemaVersion !== MANGA_OCR_PAGE_SCHEMA_VERSION) {
    return false;
  }

  return entry.imagePath === fingerprint.imagePath
    && Number(entry.sourceSize || 0) === Number(fingerprint.size)
    && Number(entry.sourceMtimeMs || 0) === Number(fingerprint.mtimeMs)
    && doesStoredPassProfileSatisfy(passProfile, getStoredEntryPassProfile(entry));
}
