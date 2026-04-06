import { createHash } from "crypto";
import { getMangaById, patchMangaById } from "../mangas";
import {
  countJapaneseChars,
  countLatinChars,
  countMeaningfulOcrChars,
  toLocalFileUrl,
} from "./helpers";
import { ensureMangaOcrFile, writeMangaOcrFile } from "./manga-storage";
import { callWorkerRecognize } from "./worker";
import type {
  MangaOcrFile,
  NormalizedOcrResult,
  OcrLanguageDetection,
  OcrLanguageDetectionSample,
  OcrLanguageDetectionStatus,
} from "./types";

function buildLanguageDetectionFromTexts(
  texts: string[],
  options?: {
    source?: OcrLanguageDetection["source"];
    sampledPages?: number[];
    sampleDetails?: OcrLanguageDetectionSample[];
  },
): OcrLanguageDetection {
  const combinedText = texts.join("\n");
  const japaneseChars = countJapaneseChars(combinedText);
  const latinChars = countLatinChars(combinedText);
  const meaningfulChars = countMeaningfulOcrChars(combinedText);
  const ratioJapanese = meaningfulChars > 0 ? japaneseChars / meaningfulChars : null;

  let status: OcrLanguageDetectionStatus = "uncertain";
  if (meaningfulChars < 8) {
    status = "uncertain";
  } else if (japaneseChars >= 8 && ratioJapanese !== null && ratioJapanese >= 0.45) {
    status = "likely_japanese";
  } else if (latinChars >= 8 && ratioJapanese !== null && ratioJapanese <= 0.15) {
    status = "likely_non_japanese";
  }

  return {
    status,
    score: ratioJapanese,
    sampledPages: options?.sampledPages || [],
    sampledAt: new Date().toISOString(),
    appliedLanguageTag: false,
    source: options?.source || "ocr-samples",
    sampleDetails: options?.sampleDetails || [],
  };
}

function getMetadataLanguageDetection(manga: any): OcrLanguageDetection | null {
  const language = typeof manga?.language === "string" ? manga.language.trim().toLowerCase() : "";
  if (!language) {
    return null;
  }

  if (language === "ja") {
    return {
      status: "likely_japanese",
      score: 1,
      sampledPages: [],
      sampledAt: new Date().toISOString(),
      appliedLanguageTag: true,
      source: "metadata",
      sampleDetails: [],
    };
  }

  return {
    status: "likely_non_japanese",
    score: 0,
    sampledPages: [],
    sampledAt: new Date().toISOString(),
    appliedLanguageTag: false,
    source: "metadata",
    sampleDetails: [],
  };
}

function pickSamplePageIndices(totalPages: number, seedInput: string, sampleCount: number = 3) {
  if (totalPages <= 0) {
    return [];
  }

  if (totalPages <= sampleCount) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const digest = createHash("sha1").update(seedInput).digest();
  const selected = new Set<number>();
  let cursor = 0;

  while (selected.size < Math.min(sampleCount, totalPages) && cursor < digest.length * 4) {
    const byte = digest[cursor % digest.length] || 0;
    const candidate = byte % totalPages;
    selected.add(candidate);
    cursor += 1;
  }

  if (selected.size < sampleCount) {
    selected.add(0);
    selected.add(Math.floor(totalPages / 2));
    selected.add(totalPages - 1);
  }

  return Array.from(selected).sort((left, right) => left - right).slice(0, sampleCount);
}

async function applyAutoJapaneseLanguageIfNeeded(mangaId: string, detection: OcrLanguageDetection, settings: any) {
  if (!settings?.ocrAutoAssignJapaneseLanguage) {
    return false;
  }

  if (detection.status !== "likely_japanese") {
    return false;
  }

  const manga = await getMangaById(mangaId);
  if (!manga) {
    return false;
  }

  if (String(manga.language || "").toLowerCase() === "ja") {
    return false;
  }

  await patchMangaById(mangaId, { language: "ja" });
  return true;
}

export async function detectLanguageForManga(
  manga: any,
  pageFiles: string[],
  settings: any,
  forceResample: boolean = false,
): Promise<OcrLanguageDetection> {
  const totalPages = pageFiles.length;
  const file = await ensureMangaOcrFile(manga, totalPages);

  if (!forceResample && file.languageDetection && file.languageDetection.status !== "not_run") {
    return file.languageDetection;
  }

  const metadataDetection = getMetadataLanguageDetection(manga);
  if (metadataDetection && !forceResample) {
    file.languageDetection = metadataDetection;
    file.languageDetection.appliedLanguageTag = metadataDetection.status === "likely_japanese";
    await writeMangaOcrFile(manga.path, file);
    return file.languageDetection;
  }

  const sampleIndices = pickSamplePageIndices(totalPages, `${manga.id}:${manga.path}`);
  const sampleDetails: OcrLanguageDetectionSample[] = [];
  const sampleTexts: string[] = [];

  for (const index of sampleIndices) {
    const imagePath = pageFiles[index];
    if (!imagePath) {
      continue;
    }

    const raw = await callWorkerRecognize(imagePath, settings);
    const texts = Array.isArray(raw?.blocks)
      ? raw.blocks.flatMap((block) => Array.isArray(block.lines) ? block.lines.map((line) => String(line)) : [])
      : [];
    const previewText = texts.join("").slice(0, 120);
    const meaningfulChars = countMeaningfulOcrChars(previewText);
    const japaneseChars = countJapaneseChars(previewText);
    const latinChars = countLatinChars(previewText);

    sampleTexts.push(texts.join("\n"));
    sampleDetails.push({
      pageIndex: index,
      imagePath,
      localUrl: toLocalFileUrl(imagePath),
      previewText,
      japaneseChars,
      latinChars,
      meaningfulChars,
      ratioJapanese: meaningfulChars > 0 ? japaneseChars / meaningfulChars : null,
    });
  }

  const detection = buildLanguageDetectionFromTexts(sampleTexts, {
    source: "ocr-samples",
    sampledPages: sampleIndices.map((index) => index + 1),
    sampleDetails,
  });

  detection.appliedLanguageTag = await applyAutoJapaneseLanguageIfNeeded(manga.id, detection, settings);
  file.languageDetection = detection;
  await writeMangaOcrFile(manga.path, file);
  return detection;
}

export async function updateLanguageDetectionFromRecognizedPage(
  manga: any,
  file: MangaOcrFile,
  pageIndex: number,
  imagePath: string,
  result: NormalizedOcrResult,
  settings: any,
) {
  const texts = Array.isArray(result.page?.blocks)
    ? result.page.blocks.map((block) => block.text)
    : Array.isArray(result.boxes)
      ? result.boxes.map((box) => box.text)
      : [];
  const joinedText = texts.join("");
  const joinedMeaningfulChars = countMeaningfulOcrChars(joinedText);
  const japaneseChars = countJapaneseChars(joinedText);
  const detection = buildLanguageDetectionFromTexts(texts, {
    source: "reader-page",
    sampledPages: [pageIndex + 1],
    sampleDetails: [{
      pageIndex,
      imagePath,
      localUrl: toLocalFileUrl(imagePath),
      previewText: joinedText.slice(0, 120),
      japaneseChars,
      latinChars: countLatinChars(joinedText),
      meaningfulChars: joinedMeaningfulChars,
      ratioJapanese: joinedMeaningfulChars > 0 ? japaneseChars / joinedMeaningfulChars : null,
    }],
  });

  if (detection.status !== "likely_japanese") {
    return file.languageDetection;
  }

  const currentStatus = file.languageDetection?.status || "not_run";
  if (currentStatus !== "likely_japanese") {
    detection.appliedLanguageTag = await applyAutoJapaneseLanguageIfNeeded(manga.id, detection, settings);
    file.languageDetection = detection;
  }

  return file.languageDetection;
}
