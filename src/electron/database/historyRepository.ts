import type {
  AppHistoryRecords,
  DetailsHistoryRecord,
  ReadingHistoryRecord,
  SearchHistoryRecord,
} from "../history";
import { getCollectionsDatabase } from "./connection";
import {
  parsePayloadRow,
  parsePayloadRows,
} from "./repositoryUtils";

export const APP_HISTORY_RECORD_LIMIT = 5000;

export type AppHistoryCategory = keyof AppHistoryRecords;
export type AppHistoryRecord = ReadingHistoryRecord | DetailsHistoryRecord | SearchHistoryRecord;

const listHistoryCategory = <T extends AppHistoryRecord>(category: AppHistoryCategory): T[] => (
  parsePayloadRows<T>(getCollectionsDatabase().prepare(`
    SELECT payload
    FROM app_history
    WHERE category = ?
    ORDER BY updated_at DESC, id
    LIMIT ?
  `).all(category, APP_HISTORY_RECORD_LIMIT))
);

export const readStoredAppHistory = (): AppHistoryRecords => ({
  reading: listHistoryCategory<ReadingHistoryRecord>("reading"),
  details: listHistoryCategory<DetailsHistoryRecord>("details"),
  searches: listHistoryCategory<SearchHistoryRecord>("searches"),
});

export const getStoredAppHistoryRecord = <T extends AppHistoryRecord>(
  category: AppHistoryCategory,
  historyId: string,
): T | null => (
  parsePayloadRow<T>(getCollectionsDatabase().prepare(`
    SELECT payload
    FROM app_history
    WHERE category = ? AND id = ?
  `).get(category, historyId))
);

export const upsertStoredAppHistoryRecord = (
  category: AppHistoryCategory,
  record: AppHistoryRecord,
): void => {
  const database = getCollectionsDatabase();
  database.prepare(`
    INSERT INTO app_history
      (category, id, created_at, updated_at, payload)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (category, id) DO UPDATE SET
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `).run(
    category,
    record.id,
    record.createdAt,
    record.updatedAt,
    JSON.stringify(record),
  );

  database.prepare(`
    DELETE FROM app_history
    WHERE category = ?
      AND id NOT IN (
        SELECT id
        FROM app_history
        WHERE category = ?
        ORDER BY updated_at DESC, id
        LIMIT ?
      )
  `).run(category, category, APP_HISTORY_RECORD_LIMIT);
};

export const removeStoredAppHistoryRecord = (
  category: AppHistoryCategory,
  historyId: string,
): void => {
  getCollectionsDatabase().prepare(`
    DELETE FROM app_history
    WHERE category = ? AND id = ?
  `).run(category, historyId);
};
