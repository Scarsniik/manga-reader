import { type IpcMainInvokeEvent } from "electron";
import {
  type RemoveScraperBookmarkRequest,
  type SaveScraperBookmarkRequest,
  type ScraperBookmarkMetadataField,
  type ScraperBookmarkRecord,
} from "../../scraper";
import { readScraperBookmarksFile, updateScraperBookmarksFile } from "./storage";
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
    tags: normalizedRequest.tags.length ? normalizedRequest.tags : existing.tags,
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
  const records = await readScraperBookmarksFile();
  const normalizedScraperId = String(scraperId ?? "").trim();

  if (!normalizedScraperId) {
    return records;
  }

  return records.filter((record) => record.scraperId === normalizedScraperId);
}

export async function saveScraperBookmark(
  _event: IpcMainInvokeEvent,
  request: SaveScraperBookmarkRequest,
): Promise<ScraperBookmarkRecord> {
  return updateScraperBookmarksFile((records) => {
    const normalizedScraperId = String(request.scraperId ?? "").trim();
    const normalizedSourceUrl = normalizeScraperBookmarkUrl(request.sourceUrl);
    const existingIndex = records.findIndex((record) => (
      record.scraperId === normalizedScraperId && record.sourceUrl === normalizedSourceUrl
    ));
    const existing = existingIndex >= 0 ? records[existingIndex] : null;
    const merged = mergeScraperBookmarkRecord(existing, request);

    if (!merged) {
      throw new Error("Le bookmark scraper est incomplet.");
    }

    const nextRecords = [...records];
    if (existingIndex >= 0) {
      nextRecords[existingIndex] = merged;
    } else {
      nextRecords.push(merged);
    }

    return {
      records: nextRecords,
      result: merged,
    };
  });
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

  return updateScraperBookmarksFile((records) => {
    const filtered = records.filter((record) => !(
      record.scraperId === normalizedScraperId && record.sourceUrl === normalizedSourceUrl
    ));
    const removed = filtered.length !== records.length;

    return {
      records: removed ? filtered : records,
      result: removed,
      shouldWrite: removed,
    };
  });
}
