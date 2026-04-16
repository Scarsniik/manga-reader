import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { app } from "electron";
import {
  type DownloadScraperMangaRequest,
  type ScraperDownloadJobStatus,
} from "../../scraper";
import { getSettings } from "../params";
import {
  MAX_SCRAPER_DOWNLOAD_PAGES,
  sanitizeStringList,
  type InternalScraperDownloadJob,
  type NormalizedScraperDownloadRequest,
} from "./shared";

const DEFAULT_DOWNLOADED_MANGA_FOLDER_NAME = "Manga Helper Library";

const sanitizePathSegment = (value: string): string => {
  const sanitized = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return sanitized || "manga";
};

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export const normalizeChapterValue = (value: string): string => value
  .replace(/[–—]/g, "-")
  .replace(/\s+/g, " ")
  .trim();

export const extractChapterValueFromLabel = (label: string): string | undefined => {
  const normalizedLabel = normalizeChapterValue(label);
  if (!normalizedLabel) {
    return undefined;
  }

  const explicitChapterMatch = normalizedLabel.match(
    /(?:chap(?:it(?:re)?)?|chapter|ch|cap(?:itulo)?|ep(?:isode)?)\s*\.?\s*([0-9]+(?:[.,][0-9]+)?(?:\s*-\s*[0-9]+(?:[.,][0-9]+)?)?)/i,
  );
  if (explicitChapterMatch?.[1]) {
    return normalizeChapterValue(explicitChapterMatch[1]).replace(/\s*-\s*/g, "-");
  }

  const lastNumericMatch = Array.from(
    normalizedLabel.matchAll(/([0-9]+(?:[.,][0-9]+)?(?:\s*-\s*[0-9]+(?:[.,][0-9]+)?)?)/g),
  ).pop();
  if (lastNumericMatch?.[1]) {
    return normalizeChapterValue(lastNumericMatch[1]).replace(/\s*-\s*/g, "-");
  }

  return normalizedLabel || undefined;
};

export const getConfiguredLibraryRoot = async (): Promise<string> => {
  const settings = await getSettings();
  const configuredLibraryPath = String(settings?.libraryPath || "").trim();

  if (configuredLibraryPath) {
    return path.isAbsolute(configuredLibraryPath)
      ? configuredLibraryPath
      : path.resolve(configuredLibraryPath);
  }

  return path.join(app.getPath("documents"), DEFAULT_DOWNLOADED_MANGA_FOLDER_NAME);
};

export const getUniqueFolderPath = async (libraryRoot: string, title: string): Promise<string> => {
  const baseName = sanitizePathSegment(title);
  let candidatePath = path.join(libraryRoot, baseName);
  let suffix = 2;

  while (await pathExists(candidatePath)) {
    candidatePath = path.join(libraryRoot, `${baseName} (${suffix})`);
    suffix += 1;
  }

  return candidatePath;
};

const inferExtensionFromContentType = (contentType: string | null): string => {
  const normalized = String(contentType || "").toLowerCase();

  if (normalized.includes("image/webp")) return ".webp";
  if (normalized.includes("image/png")) return ".png";
  if (normalized.includes("image/avif")) return ".avif";
  if (normalized.includes("image/gif")) return ".gif";
  if (normalized.includes("image/jpeg")) return ".jpg";
  if (normalized.includes("image/jpg")) return ".jpg";

  return ".jpg";
};

export const inferExtensionFromUrl = (targetUrl: string, contentType: string | null): string => {
  try {
    const parsed = new URL(targetUrl);
    const extension = path.extname(parsed.pathname);
    if (extension && extension.length <= 8) {
      return extension;
    }
  } catch {
    // Fall back to content-type when URL parsing fails.
  }

  return inferExtensionFromContentType(contentType);
};

export const buildDownloadHeaders = (refererUrl?: string): HeadersInit => {
  const headers: Record<string, string> = {
    "User-Agent": "Manga Helper Scraper Downloader/1.0",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };

  if (refererUrl) {
    headers.Referer = refererUrl;
  }

  return headers;
};

export class ScraperDownloadCancelledError extends Error {
  constructor() {
    super("Le telechargement a ete annule.");
    this.name = "ScraperDownloadCancelledError";
  }
}

export const isScraperDownloadTerminalStatus = (
  status: ScraperDownloadJobStatus,
): boolean => (
  status === "completed" || status === "error" || status === "cancelled"
);

export const isScraperDownloadAbortError = (error: unknown): boolean => (
  error instanceof ScraperDownloadCancelledError
  || (error instanceof Error && error.name === "AbortError")
);

export const ensureScraperDownloadNotCancelled = (job: InternalScraperDownloadJob) => {
  if (job.cancelRequested || job.status === "cancelled") {
    throw new ScraperDownloadCancelledError();
  }
};

export const cleanupScraperDownloadFolder = async (folderPath?: string) => {
  if (!folderPath) {
    return;
  }

  try {
    await fs.rm(folderPath, { recursive: true, force: true });
  } catch {
    // Best effort cleanup only.
  }
};

export const normalizeScraperDownloadRequest = (
  request: DownloadScraperMangaRequest,
): NormalizedScraperDownloadRequest => {
  const title = String(request.title || "").trim();
  const rawPageUrls = Array.isArray(request.pageUrls)
    ? request.pageUrls
      .map((pageUrl) => String(pageUrl || "").trim())
      .filter((pageUrl) => pageUrl.length > 0)
    : [];
  const refererUrl = typeof request.refererUrl === "string" && request.refererUrl.trim().length > 0
    ? request.refererUrl.trim()
    : undefined;
  const scraperId = typeof request.scraperId === "string" && request.scraperId.trim().length > 0
    ? request.scraperId.trim()
    : undefined;
  const scraperName = typeof request.scraperName === "string" && request.scraperName.trim().length > 0
    ? request.scraperName.trim()
    : undefined;
  const sourceUrl = typeof request.sourceUrl === "string" && request.sourceUrl.trim().length > 0
    ? request.sourceUrl.trim()
    : undefined;
  const sourceChapterUrl = typeof request.sourceChapterUrl === "string" && request.sourceChapterUrl.trim().length > 0
    ? request.sourceChapterUrl.trim()
    : undefined;
  const sourceChapterLabel = typeof request.sourceChapterLabel === "string" && request.sourceChapterLabel.trim().length > 0
    ? request.sourceChapterLabel.trim()
    : undefined;
  const replaceMangaId = typeof request.replaceMangaId === "string" && request.replaceMangaId.trim().length > 0
    ? request.replaceMangaId.trim()
    : undefined;
  const defaultTagIds = sanitizeStringList(request.defaultTagIds);
  const defaultLanguage = String(request.defaultLanguage ?? "").trim().toLowerCase() || undefined;
  const autoAssignSeriesOnChapterDownload = Boolean(request.autoAssignSeriesOnChapterDownload);
  const seriesTitle = String(request.seriesTitle ?? "").trim();
  const chapterLabel = String(request.chapterLabel ?? "").trim();
  const thumbnailUrl = typeof request.thumbnailUrl === "string" && request.thumbnailUrl.trim().length > 0
    ? request.thumbnailUrl.trim()
    : undefined;

  if (!title) {
    throw new Error("Le titre du manga est requis pour le telechargement.");
  }

  if (!rawPageUrls.length) {
    throw new Error("Aucune page a telecharger.");
  }

  if (rawPageUrls.length > MAX_SCRAPER_DOWNLOAD_PAGES) {
    throw new Error(`Le telechargement est limite a ${MAX_SCRAPER_DOWNLOAD_PAGES} pages pour cette version.`);
  }

  return {
    title,
    pageUrls: Array.from(new Set(rawPageUrls)),
    refererUrl,
    scraperId,
    scraperName,
    sourceUrl,
    sourceChapterUrl,
    sourceChapterLabel,
    replaceMangaId,
    defaultTagIds,
    defaultLanguage,
    autoAssignSeriesOnChapterDownload,
    seriesTitle,
    chapterLabel,
    thumbnailUrl,
  };
};

export const createScraperDownloadJob = (
  request: NormalizedScraperDownloadRequest,
): InternalScraperDownloadJob => {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    title: request.title,
    status: "queued",
    mode: request.chapterLabel ? "chapter" : "full_manga",
    scraperId: request.scraperId,
    scraperName: request.scraperName,
    sourceUrl: request.sourceUrl,
    sourceChapterUrl: request.sourceChapterUrl,
    sourceChapterLabel: request.sourceChapterLabel,
    replaceMangaId: request.replaceMangaId,
    refererUrl: request.refererUrl,
    chapterLabel: request.chapterLabel || undefined,
    createdAt: now,
    updatedAt: now,
    totalPages: request.pageUrls.length,
    downloadedPages: 0,
    downloadedCount: 0,
    message: "En attente",
    error: null,
    pageUrls: request.pageUrls,
    defaultTagIds: request.defaultTagIds,
    defaultLanguage: request.defaultLanguage,
    autoAssignSeriesOnChapterDownload: request.autoAssignSeriesOnChapterDownload,
    seriesTitle: request.seriesTitle,
    thumbnailUrl: request.thumbnailUrl,
    cancelRequested: false,
    abortController: null,
  };
};
