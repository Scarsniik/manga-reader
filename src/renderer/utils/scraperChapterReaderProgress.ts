import type { ScraperReaderProgressRecord } from "@/shared/scraper";
import {
  createScraperMangaId,
  type ScraperRuntimeChapterResult,
} from "@/renderer/utils/scraperRuntime";

type SelectScraperChapterReaderTargetOptions = {
  scraperId: string;
  sourceUrls: string[];
  chapters: ScraperRuntimeChapterResult[];
  progressRecords: ScraperReaderProgressRecord[];
};

export type ScraperChapterReaderTarget = {
  chapter: ScraperRuntimeChapterResult;
  mangaId: string;
  progress: ScraperReaderProgressRecord | null;
  sourceUrl: string;
};

const normalizeSourceUrl = (value: unknown): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return trimmed.replace(/\/+$/, "") || trimmed;
  }
};

const toTimestamp = (value: unknown): number => {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const selectScraperChapterReaderTarget = ({
  scraperId,
  sourceUrls,
  chapters,
  progressRecords,
}: SelectScraperChapterReaderTargetOptions): ScraperChapterReaderTarget | null => {
  const normalizedSourceUrls = new Set(sourceUrls.map(normalizeSourceUrl).filter(Boolean));
  const matchingProgressRecords = progressRecords
    .filter((record) => (
      record.scraperId === scraperId
      && normalizedSourceUrls.has(normalizeSourceUrl(record.sourceUrl))
    ))
    .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt));

  for (const progress of matchingProgressRecords) {
    const chapter = chapters.find((candidate) => (
      createScraperMangaId(scraperId, progress.sourceUrl, candidate.url) === progress.id
    ));
    if (chapter) {
      return {
        chapter,
        mangaId: progress.id,
        progress,
        sourceUrl: progress.sourceUrl,
      };
    }
  }

  const firstChapter = chapters[0];
  const sourceUrl = sourceUrls.find((value) => value.trim())?.trim() ?? "";
  if (!firstChapter || !sourceUrl) return null;

  return {
    chapter: firstChapter,
    mangaId: createScraperMangaId(scraperId, sourceUrl, firstChapter.url),
    progress: null,
    sourceUrl,
  };
};
