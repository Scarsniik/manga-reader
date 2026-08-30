import { type IpcMainInvokeEvent } from "electron";
import {
  type RemoveScraperBookmarkRequest,
  type SaveScraperBookmarkRequest,
  type ScraperBookmarkMetadataField,
  type ScraperBookmarkRecord,
} from "../../scraper";
import {
  getScraperBookmark,
  listScraperBookmarks,
  removeStoredScraperBookmark,
  upsertScraperBookmark,
} from "../../database/bookmarkRepository";
import {
  normalizeScraperBookmarkUrl,
  sanitizeBookmarkMetadataFieldList,
  sanitizeScraperBookmarkRecord,
} from "./shared";

const applyExcludedBookmarkFields = <T extends Partial<ScraperBookmarkRecord>>(
  record: T,
  excludedFields: ScraperBookmarkMetadataField[],
): T => {
  const nextRecord: Partial<ScraperBookmarkRecord> = { ...record };

  excludedFields.forEach((field) => {
    if (field === "authors" || field === "tags" || field === "languageCodes") {
      nextRecord[field] = [];
      if (field === "authors") {
        nextRecord.authorUrls = [];
      }
      return;
    }

    nextRecord[field] = undefined;
  });

  return nextRecord as T;
};

const mergeScraperBookmarkRecord = (
  existing: ScraperBookmarkRecord | null,
  request: SaveScraperBookmarkRequest,
): ScraperBookmarkRecord | null => {
  const now = new Date().toISOString();
  const excludedFields = sanitizeBookmarkMetadataFieldList(request.excludedFields);
  const normalizedRequest = sanitizeScraperBookmarkRecord({
    ...existing,
    ...applyExcludedBookmarkFields(request, excludedFields),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  if (!normalizedRequest) {
    return null;
  }

  if (!existing) {
    return normalizedRequest;
  }

  return sanitizeScraperBookmarkRecord(applyExcludedBookmarkFields({
    scraperId: existing.scraperId,
    sourceUrl: existing.sourceUrl,
    title: normalizedRequest.title || existing.title,
    cover: normalizedRequest.cover || existing.cover,
    summary: normalizedRequest.summary || existing.summary,
    description: normalizedRequest.description || existing.description,
    authors: normalizedRequest.authors.length ? normalizedRequest.authors : existing.authors,
    authorUrls: normalizedRequest.authorUrls?.length
      ? normalizedRequest.authorUrls
      : existing.authorUrls,
    tags: normalizedRequest.tags.length ? normalizedRequest.tags : existing.tags,
    sourceNames: normalizedRequest.sourceNames?.length
      ? normalizedRequest.sourceNames
      : existing.sourceNames,
    sourceUrls: normalizedRequest.sourceUrls?.length
      ? normalizedRequest.sourceUrls
      : existing.sourceUrls,
    mangaStatus: normalizedRequest.mangaStatus || existing.mangaStatus,
    pageCount: normalizedRequest.pageCount || existing.pageCount,
    languageCodes: normalizedRequest.languageCodes?.length
      ? normalizedRequest.languageCodes
      : existing.languageCodes,
    createdAt: existing.createdAt,
    updatedAt: now,
  }, excludedFields));
};

export async function getScraperBookmarks(
  _event?: IpcMainInvokeEvent,
  scraperId?: string | null,
): Promise<ScraperBookmarkRecord[]> {
  return listScraperBookmarks(scraperId);
}

export async function saveScraperBookmark(
  _event: IpcMainInvokeEvent,
  request: SaveScraperBookmarkRequest,
): Promise<ScraperBookmarkRecord> {
  const normalizedScraperId = String(request.scraperId ?? "").trim();
  const normalizedSourceUrl = normalizeScraperBookmarkUrl(request.sourceUrl);
  const existing = getScraperBookmark(normalizedScraperId, normalizedSourceUrl);
  const merged = mergeScraperBookmarkRecord(existing, request);

  if (!merged) {
    throw new Error("Le bookmark scraper est incomplet.");
  }

  upsertScraperBookmark(merged);
  return merged;
}

export async function removeScraperBookmark(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperBookmarkRequest,
): Promise<boolean> {
  const normalizedScraperId = String(request.scraperId ?? "").trim();
  const normalizedSourceUrl = normalizeScraperBookmarkUrl(request.sourceUrl);

  if (!normalizedScraperId || !normalizedSourceUrl) {
    return false;
  }

  return removeStoredScraperBookmark(normalizedScraperId, normalizedSourceUrl);
}
