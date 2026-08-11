import type { DatabaseSync } from "node:sqlite";

export const parsePayloadRow = <T>(row: Record<string, unknown> | undefined): T | null => {
  if (!row || typeof row.payload !== "string") {
    return null;
  }

  return JSON.parse(row.payload) as T;
};

export const parsePayloadRows = <T>(rows: Record<string, unknown>[]): T[] => (
  rows.map((row) => parsePayloadRow<T>(row)).filter((record): record is T => Boolean(record))
);

export const runDatabaseTransaction = <T>(
  database: DatabaseSync,
  operation: () => T,
): T => {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};

export const toChangedRowCount = (value: number | bigint): number => Number(value);
