import { type IpcMainInvokeEvent } from "electron";
import {
  normalizeHistoryText,
  type AppHistoryRecords,
  type DetailsHistoryRecord,
  type ReadingHistoryRecord,
  type RecordDetailsHistoryRequest,
  type RecordReadingHistoryRequest,
  type RecordSearchHistoryRequest,
  type SearchHistoryRecord,
} from "../history";
import {
  sanitizeDetailsHistoryRecord,
  sanitizeReadingHistoryRecord,
  sanitizeSearchHistoryRecord,
} from "../historySanitizers";
import {
  getStoredAppHistoryRecord,
  readStoredAppHistory,
  removeStoredAppHistoryRecord,
  upsertStoredAppHistoryRecord,
  type AppHistoryCategory,
  type AppHistoryRecord,
} from "../database/historyRepository";

const mergeHistoryRecord = <T extends AppHistoryRecord>(
  existing: T | null,
  draft: T,
  now: string,
): T => (
  existing
    ? {
      ...existing,
      ...draft,
      createdAt: existing.createdAt,
      updatedAt: now,
    }
    : draft
);

const removeHistoryRecord = (
  category: AppHistoryCategory,
  historyId: string,
): AppHistoryRecords => {
  removeStoredAppHistoryRecord(category, normalizeHistoryText(historyId));
  return readStoredAppHistory();
};

export async function getHistoryRecords(): Promise<AppHistoryRecords> {
  return readStoredAppHistory();
}

export async function recordReadingHistory(
  _event: IpcMainInvokeEvent,
  request: RecordReadingHistoryRequest,
): Promise<ReadingHistoryRecord> {
  const now = new Date().toISOString();
  const draft = sanitizeReadingHistoryRecord({
    ...request,
    createdAt: now,
    updatedAt: now,
  });

  if (!draft) {
    throw new Error("L'entree d'historique de lecture est incomplete.");
  }

  const existing = getStoredAppHistoryRecord<ReadingHistoryRecord>("reading", draft.id);
  const nextRecord = mergeHistoryRecord(existing, draft, now);
  upsertStoredAppHistoryRecord("reading", nextRecord);
  return nextRecord;
}

export async function recordDetailsHistory(
  _event: IpcMainInvokeEvent,
  request: RecordDetailsHistoryRequest,
): Promise<DetailsHistoryRecord> {
  const now = new Date().toISOString();
  const draft = sanitizeDetailsHistoryRecord({
    ...request,
    createdAt: now,
    updatedAt: now,
  });

  if (!draft) {
    throw new Error("L'entree d'historique de fiche est incomplete.");
  }

  const existing = getStoredAppHistoryRecord<DetailsHistoryRecord>("details", draft.id);
  const nextRecord = mergeHistoryRecord(existing, draft, now);
  upsertStoredAppHistoryRecord("details", nextRecord);
  return nextRecord;
}

export async function recordSearchHistory(
  _event: IpcMainInvokeEvent,
  request: RecordSearchHistoryRequest,
): Promise<SearchHistoryRecord> {
  const now = new Date().toISOString();
  const draft = sanitizeSearchHistoryRecord({
    ...request,
    createdAt: now,
    updatedAt: now,
  });

  if (!draft) {
    throw new Error("L'entree d'historique de recherche est incomplete.");
  }

  const existing = getStoredAppHistoryRecord<SearchHistoryRecord>("searches", draft.id);
  const nextRecord = mergeHistoryRecord(existing, draft, now);
  upsertStoredAppHistoryRecord("searches", nextRecord);
  return nextRecord;
}

export async function removeReadingHistoryRecord(
  _event: IpcMainInvokeEvent,
  historyId: string,
): Promise<AppHistoryRecords> {
  return removeHistoryRecord("reading", historyId);
}

export async function removeDetailsHistoryRecord(
  _event: IpcMainInvokeEvent,
  historyId: string,
): Promise<AppHistoryRecords> {
  return removeHistoryRecord("details", historyId);
}

export async function removeSearchHistoryRecord(
  _event: IpcMainInvokeEvent,
  historyId: string,
): Promise<AppHistoryRecords> {
  return removeHistoryRecord("searches", historyId);
}
