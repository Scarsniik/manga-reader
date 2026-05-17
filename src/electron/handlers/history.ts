import { type IpcMainInvokeEvent } from "electron";
import { promises as fs } from "fs";
import {
  EMPTY_APP_HISTORY,
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
  sanitizeHistoryRecords,
  sanitizeReadingHistoryRecord,
  sanitizeSearchHistoryRecord,
  trimHistoryTab,
} from "../historySanitizers";
import { appHistoryFilePath, ensureDataDir } from "../utils";

let historyFileQueue: Promise<void> = Promise.resolve();

const runHistoryFileOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previousOperation = historyFileQueue;
  let releaseOperation: () => void = () => undefined;

  historyFileQueue = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });

  await previousOperation.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseOperation();
  }
};

const writeHistoryFileUnlocked = async (records: AppHistoryRecords): Promise<void> => {
  await ensureDataDir();
  await fs.writeFile(appHistoryFilePath, JSON.stringify({
    reading: trimHistoryTab(records.reading),
    details: trimHistoryTab(records.details),
    searches: trimHistoryTab(records.searches),
  }, null, 2));
};

const readHistoryFileUnlocked = async (): Promise<AppHistoryRecords> => {
  try {
    const data = await fs.readFile(appHistoryFilePath, "utf-8");
    const parsed = JSON.parse(data);
    const records = sanitizeHistoryRecords(parsed);

    if (JSON.stringify(parsed, null, 2) !== JSON.stringify(records, null, 2)) {
      await writeHistoryFileUnlocked(records);
    }

    return records;
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      await writeHistoryFileUnlocked(EMPTY_APP_HISTORY);
      return EMPTY_APP_HISTORY;
    }

    console.error("Error reading history file:", error);
    throw new Error("Failed to read history");
  }
};

const upsertHistoryRecord = async <TabName extends keyof AppHistoryRecords>(
  tabName: TabName,
  records: AppHistoryRecords,
  nextRecord: AppHistoryRecords[TabName][number],
): Promise<void> => {
  await writeHistoryFileUnlocked({
    ...records,
    [tabName]: trimHistoryTab([
      nextRecord,
      ...records[tabName].filter((record) => record.id !== nextRecord.id),
    ]),
  });
};

const removeHistoryRecord = async (
  tabName: keyof AppHistoryRecords,
  historyId: string,
): Promise<AppHistoryRecords> => {
  const records = await readHistoryFileUnlocked();
  const normalizedId = normalizeHistoryText(historyId);
  const nextRecords = {
    ...records,
    [tabName]: records[tabName].filter((record) => record.id !== normalizedId),
  };

  await writeHistoryFileUnlocked(nextRecords);
  return nextRecords;
};

export async function getHistoryRecords(): Promise<AppHistoryRecords> {
  return runHistoryFileOperation(readHistoryFileUnlocked);
}

export async function recordReadingHistory(
  _event: IpcMainInvokeEvent,
  request: RecordReadingHistoryRequest,
): Promise<ReadingHistoryRecord> {
  return runHistoryFileOperation(async () => {
    const records = await readHistoryFileUnlocked();
    const now = new Date().toISOString();
    const draft = sanitizeReadingHistoryRecord({
      ...request,
      createdAt: now,
      updatedAt: now,
    });

    if (!draft) {
      throw new Error("L'entree d'historique de lecture est incomplete.");
    }

    const existing = records.reading.find((record) => record.id === draft.id);
    const nextRecord = existing
      ? {
        ...existing,
        ...draft,
        createdAt: existing.createdAt,
        updatedAt: now,
      }
      : draft;

    await upsertHistoryRecord("reading", records, nextRecord);
    return nextRecord;
  });
}

export async function recordDetailsHistory(
  _event: IpcMainInvokeEvent,
  request: RecordDetailsHistoryRequest,
): Promise<DetailsHistoryRecord> {
  return runHistoryFileOperation(async () => {
    const records = await readHistoryFileUnlocked();
    const now = new Date().toISOString();
    const draft = sanitizeDetailsHistoryRecord({
      ...request,
      createdAt: now,
      updatedAt: now,
    });

    if (!draft) {
      throw new Error("L'entree d'historique de fiche est incomplete.");
    }

    const existing = records.details.find((record) => record.id === draft.id);
    const nextRecord = existing
      ? {
        ...existing,
        ...draft,
        createdAt: existing.createdAt,
        updatedAt: now,
      }
      : draft;

    await upsertHistoryRecord("details", records, nextRecord);
    return nextRecord;
  });
}

export async function recordSearchHistory(
  _event: IpcMainInvokeEvent,
  request: RecordSearchHistoryRequest,
): Promise<SearchHistoryRecord> {
  return runHistoryFileOperation(async () => {
    const records = await readHistoryFileUnlocked();
    const now = new Date().toISOString();
    const draft = sanitizeSearchHistoryRecord({
      ...request,
      createdAt: now,
      updatedAt: now,
    });

    if (!draft) {
      throw new Error("L'entree d'historique de recherche est incomplete.");
    }

    const existing = records.searches.find((record) => record.id === draft.id);
    const nextRecord = existing
      ? {
        ...existing,
        ...draft,
        createdAt: existing.createdAt,
        updatedAt: now,
      }
      : draft;

    await upsertHistoryRecord("searches", records, nextRecord);
    return nextRecord;
  });
}

export async function removeReadingHistoryRecord(
  _event: IpcMainInvokeEvent,
  historyId: string,
): Promise<AppHistoryRecords> {
  return runHistoryFileOperation(() => removeHistoryRecord("reading", historyId));
}

export async function removeDetailsHistoryRecord(
  _event: IpcMainInvokeEvent,
  historyId: string,
): Promise<AppHistoryRecords> {
  return runHistoryFileOperation(() => removeHistoryRecord("details", historyId));
}

export async function removeSearchHistoryRecord(
  _event: IpcMainInvokeEvent,
  historyId: string,
): Promise<AppHistoryRecords> {
  return runHistoryFileOperation(() => removeHistoryRecord("searches", historyId));
}
