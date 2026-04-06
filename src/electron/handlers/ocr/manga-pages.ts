import path from "path";
import { getImageSize } from "../../utils";
import { listImageFiles } from "../pages";
import { invalidateCacheForImagePath } from "./cache";
import { MANGA_OCR_PAGE_SCHEMA_VERSION } from "./constants";
import {
  buildMangaPageKey,
  getImageFingerprint,
  normalizeManualBoxes,
  normalizeOcrPassProfile,
} from "./helpers";
import { updateLanguageDetectionFromRecognizedPage } from "./manga-language";
import {
  isStoredPageUpToDate,
  pageEntryToNormalized,
  setMangaOcrPageEntryForFile,
} from "./manga-progress";
import { ensureMangaOcrFile, readMangaOcrFile, writeMangaOcrFile } from "./manga-storage";
import type {
  MangaOcrPageEntry,
  NormalizedBox,
  NormalizedOcrResult,
  OcrPassProfile,
  OcrQueueJobMode,
} from "./types";

export async function persistPageResultForManga(
  manga: any,
  imagePath: string,
  pageIndex: number,
  fingerprint: { imagePath: string; size: number; mtimeMs: number },
  result: NormalizedOcrResult,
  mode: OcrQueueJobMode | "on_demand",
  settings: any,
  passProfile: OcrPassProfile = "standard",
) {
  const pageFiles = await listImageFiles(manga.path);
  const file = await ensureMangaOcrFile(manga, pageFiles.length);
  const pageKey = buildMangaPageKey(pageIndex, imagePath);
  const existingEntry = file.pages[pageKey];
  const blocks = Array.isArray(result.page?.blocks) ? result.page?.blocks : [];
  const boxes = Array.isArray(result.boxes) ? result.boxes : [];

  const nextEntry: MangaOcrPageEntry = {
    schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
    status: "done",
    pageIndex,
    pageNumber: pageIndex + 1,
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
    passProfile: normalizeOcrPassProfile(passProfile),
  };

  await updateLanguageDetectionFromRecognizedPage(manga, file, pageIndex, imagePath, result, settings);
  setMangaOcrPageEntryForFile(file, pageKey, nextEntry, pageFiles.length, mode);
  await writeMangaOcrFile(manga.path, file);
  return file;
}

export async function readStoredPageFromMangaFile(
  mangaPath: string,
  imagePath: string,
  pageIndex: number,
  passProfile: OcrPassProfile = "standard",
) {
  const file = await readMangaOcrFile(mangaPath);
  if (!file) {
    return null;
  }

  const pageKey = buildMangaPageKey(pageIndex, imagePath);
  const entry = file.pages?.[pageKey];
  if (!entry) {
    return null;
  }

  const fingerprint = await getImageFingerprint(imagePath);
  if (!isStoredPageUpToDate(entry, fingerprint, passProfile)) {
    return null;
  }

  return pageEntryToNormalized(entry, imagePath, "manga-file");
}

export async function addManualBoxesToMangaPage(
  manga: any,
  imagePath: string,
  pageIndex: number,
  boxes: NormalizedBox[],
) {
  const normalizedBoxes = normalizeManualBoxes(boxes);
  if (normalizedBoxes.length === 0) {
    throw new Error("No manual OCR boxes to save");
  }

  const pageFiles = await listImageFiles(manga.path);
  const file = await ensureMangaOcrFile(manga, pageFiles.length);
  const pageKey = buildMangaPageKey(pageIndex, imagePath);
  const fingerprint = await getImageFingerprint(imagePath);
  const imageSize = await getImageSize(imagePath);
  const existingEntry = file.pages[pageKey];
  const existingManualBoxes = Array.isArray(existingEntry?.manualBoxes) ? existingEntry.manualBoxes : [];

  const nextEntry: MangaOcrPageEntry = {
    schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
    status: existingEntry?.status === "error" ? "done" : (existingEntry?.status || "done"),
    pageIndex,
    pageNumber: pageIndex + 1,
    fileName: path.basename(imagePath),
    imagePath,
    sourceSize: fingerprint.size,
    sourceMtimeMs: fingerprint.mtimeMs,
    width: Number(existingEntry?.width || imageSize.width || 0),
    height: Number(existingEntry?.height || imageSize.height || 0),
    boxes: Array.isArray(existingEntry?.boxes) ? existingEntry.boxes : [],
    blocks: Array.isArray(existingEntry?.blocks) ? existingEntry.blocks : [],
    manualBoxes: [...existingManualBoxes, ...normalizedBoxes],
    computedAt: existingEntry?.computedAt || new Date().toISOString(),
    errorMessage: undefined,
    passProfile: existingEntry?.passProfile,
  };

  setMangaOcrPageEntryForFile(file, pageKey, nextEntry, pageFiles.length, file.progress.mode || "on_demand");
  await writeMangaOcrFile(manga.path, file);
  await invalidateCacheForImagePath(imagePath);
  return pageEntryToNormalized(file.pages[pageKey], imagePath, "manga-file");
}

export async function removeManualBoxFromMangaPage(
  manga: any,
  imagePath: string,
  pageIndex: number,
  boxId: string,
) {
  const pageFiles = await listImageFiles(manga.path);
  const file = await ensureMangaOcrFile(manga, pageFiles.length);
  const pageKey = buildMangaPageKey(pageIndex, imagePath);
  const entry = file.pages[pageKey];
  if (!entry) {
    throw new Error("No OCR data stored for this page");
  }

  const manualBoxes = Array.isArray(entry.manualBoxes) ? entry.manualBoxes : [];
  const nextManualBoxes = manualBoxes.filter((box) => box.id !== boxId);
  if (nextManualBoxes.length === manualBoxes.length) {
    throw new Error("Manual OCR selection not found");
  }

  const nextEntry: MangaOcrPageEntry = {
    ...entry,
    schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
    manualBoxes: nextManualBoxes,
  };
  setMangaOcrPageEntryForFile(file, pageKey, nextEntry, pageFiles.length, file.progress.mode || "on_demand");
  await writeMangaOcrFile(manga.path, file);
  await invalidateCacheForImagePath(imagePath);
  return pageEntryToNormalized(nextEntry, imagePath, "manga-file");
}
