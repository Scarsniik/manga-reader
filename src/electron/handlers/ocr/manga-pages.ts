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
  NormalizedPageBlock,
  NormalizedOcrResult,
  OcrPassProfile,
  OcrQueueJobMode,
} from "./types";

const getEditedTextLines = (text: string): string[] => (
  text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
);

const updateBoxTextById = (boxes: NormalizedBox[], boxId: string, text: string, textEditedAt: string) => {
  let updated = false;
  const lines = getEditedTextLines(text);
  const nextBoxes = boxes.map((box) => {
    if (box.id !== boxId) {
      return box;
    }

    updated = true;
    return {
      ...box,
      text,
      lines,
      textEditedAt,
    };
  });

  return { boxes: nextBoxes, updated };
};

const updateBlockTextById = (
  blocks: NormalizedPageBlock[],
  boxId: string,
  text: string,
  textEditedAt: string,
) => {
  const lines = getEditedTextLines(text);

  return blocks.map((block) => {
    if (block.id !== boxId) {
      return block;
    }

    return {
      ...block,
      text,
      textEditedAt,
      lines: lines.length > 0
        ? lines.map((line, index) => ({
          ...(Array.isArray(block.lines) ? block.lines[index] : undefined),
          text: line,
        }))
        : [],
    };
  });
};

const getEditedBoxOverrides = (boxes?: NormalizedBox[] | null) => {
  const overrides = new Map<string, NormalizedBox>();

  if (!Array.isArray(boxes)) {
    return overrides;
  }

  boxes.forEach((box) => {
    if (typeof box.id !== "string" || !box.id || !box.textEditedAt) {
      return;
    }

    overrides.set(box.id, box);
  });

  return overrides;
};

const applyEditedBoxOverrides = (
  boxes: NormalizedBox[],
  overrides: Map<string, NormalizedBox>,
): NormalizedBox[] => (
  boxes.map((box) => {
    const override = overrides.get(box.id);
    if (!override) {
      return box;
    }

    return {
      ...box,
      text: override.text,
      lines: Array.isArray(override.lines) ? override.lines : getEditedTextLines(override.text),
      textEditedAt: override.textEditedAt,
    };
  })
);

const applyEditedBlockOverrides = (
  blocks: NormalizedPageBlock[],
  overrides: Map<string, NormalizedBox>,
): NormalizedPageBlock[] => (
  blocks.map((block) => {
    const override = overrides.get(block.id);
    if (!override) {
      return block;
    }

    const lines = Array.isArray(override.lines) && override.lines.length > 0
      ? override.lines
      : getEditedTextLines(override.text);

    return {
      ...block,
      text: override.text,
      textEditedAt: override.textEditedAt,
      lines: lines.map((line, index) => ({
        ...(Array.isArray(block.lines) ? block.lines[index] : undefined),
        text: line,
      })),
    };
  })
);

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
  const editedAutoBoxOverrides = getEditedBoxOverrides(existingEntry?.boxes);
  const blocks = applyEditedBlockOverrides(
    Array.isArray(result.page?.blocks) ? result.page?.blocks : [],
    editedAutoBoxOverrides,
  );
  const boxes = applyEditedBoxOverrides(
    Array.isArray(result.boxes) ? result.boxes : [],
    editedAutoBoxOverrides,
  );

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

export async function updateOcrBoxTextOnMangaPage(
  manga: any,
  imagePath: string,
  pageIndex: number,
  boxId: string,
  text: string,
) {
  const pageFiles = await listImageFiles(manga.path);
  const file = await ensureMangaOcrFile(manga, pageFiles.length);
  const pageKey = buildMangaPageKey(pageIndex, imagePath);
  const entry = file.pages[pageKey];
  if (!entry) {
    throw new Error("No OCR data stored for this page");
  }

  const currentAutoBoxes = Array.isArray(entry.boxes) ? entry.boxes : [];
  const currentManualBoxes = Array.isArray(entry.manualBoxes) ? entry.manualBoxes : [];
  const textEditedAt = new Date().toISOString();
  const nextAuto = updateBoxTextById(currentAutoBoxes, boxId, text, textEditedAt);
  const nextManual = updateBoxTextById(currentManualBoxes, boxId, text, textEditedAt);

  if (!nextAuto.updated && !nextManual.updated) {
    throw new Error("OCR bubble not found");
  }

  const nextEntry: MangaOcrPageEntry = {
    ...entry,
    schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
    boxes: nextAuto.boxes,
    blocks: updateBlockTextById(Array.isArray(entry.blocks) ? entry.blocks : [], boxId, text, textEditedAt),
    manualBoxes: nextManual.boxes,
  };

  setMangaOcrPageEntryForFile(file, pageKey, nextEntry, pageFiles.length, file.progress.mode || "on_demand");
  await writeMangaOcrFile(manga.path, file);
  await invalidateCacheForImagePath(imagePath);
  return pageEntryToNormalized(nextEntry, imagePath, "manga-file");
}
