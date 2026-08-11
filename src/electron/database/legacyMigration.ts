import fs from "fs";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import {
  sanitizeHistoryRecords,
} from "../historySanitizers";
import type { AppHistoryRecords } from "../history";
import type {
  ScraperBookmarkRecord,
  ScraperReaderProgressRecord,
  ScraperViewHistoryRecord,
} from "../../shared/scraper";
import {
  sanitizeScraperBookmarkRecord,
  sanitizeScraperReaderProgressRecord,
  sanitizeScraperViewHistoryRecord,
} from "../handlers/scrapers/shared";

const LEGACY_IMPORT_KEY = "legacy_json_import_v1";

export type LegacyCollectionPaths = {
  bookmarks: string;
  viewHistory: string;
  appHistory: string;
  readerProgress: string;
};

type LegacyCollectionSnapshot = {
  bookmarks: ScraperBookmarkRecord[];
  viewHistory: ScraperViewHistoryRecord[];
  appHistory: AppHistoryRecords;
  readerProgress: ScraperReaderProgressRecord[];
};

const readOptionalJsonFile = (filePath: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw new Error(`Impossible de convertir le stockage JSON ${filePath}: ${error?.message ?? error}`);
  }
};

const parseViewHistoryFile = (filePath: string): unknown => {
  let data: string;
  try {
    data = fs.readFileSync(filePath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  try {
    return JSON.parse(data);
  } catch (originalError: any) {
    let candidate = data.trim();
    for (let attempt = 0; attempt < 3 && candidate.endsWith("]"); attempt += 1) {
      candidate = candidate.slice(0, -1).trimEnd();
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // Only the historical trailing-bracket corruption is repaired here.
      }
    }

    throw new Error(
      `Impossible de convertir le stockage JSON ${filePath}: ${originalError?.message ?? originalError}`,
    );
  }
};

const sanitizeArray = <Input, Output>(
  input: unknown,
  sanitize: (record: Input) => Output | null,
): Output[] => (
  Array.isArray(input)
    ? input.map((record) => sanitize(record as Input)).filter((record): record is Output => Boolean(record))
    : []
);

const readLegacySnapshot = (paths: LegacyCollectionPaths): LegacyCollectionSnapshot => ({
  bookmarks: sanitizeArray(readOptionalJsonFile(paths.bookmarks), sanitizeScraperBookmarkRecord),
  viewHistory: sanitizeArray(parseViewHistoryFile(paths.viewHistory), sanitizeScraperViewHistoryRecord),
  appHistory: sanitizeHistoryRecords(readOptionalJsonFile(paths.appHistory)),
  readerProgress: sanitizeArray(
    readOptionalJsonFile(paths.readerProgress),
    sanitizeScraperReaderProgressRecord,
  ),
});

const insertBookmarks = (
  statement: StatementSync,
  records: ScraperBookmarkRecord[],
): void => {
  records.forEach((record) => {
    statement.run(
      record.scraperId,
      record.sourceUrl,
      record.title,
      record.createdAt,
      record.updatedAt,
      JSON.stringify(record),
    );
  });
};

const getViewHistoryActivityAt = (record: ScraperViewHistoryRecord): string => (
  record.readAt && record.readAt > record.firstSeenAt ? record.readAt : record.firstSeenAt
);

const insertViewHistory = (
  statement: StatementSync,
  records: ScraperViewHistoryRecord[],
): void => {
  records.forEach((record) => {
    statement.run(
      record.id,
      record.scraperId,
      record.sourceUrl ?? null,
      record.firstSeenAt,
      record.readAt ?? null,
      getViewHistoryActivityAt(record),
      JSON.stringify(record),
    );
  });
};

const insertAppHistory = (
  statement: StatementSync,
  records: AppHistoryRecords,
): void => {
  (Object.keys(records) as Array<keyof AppHistoryRecords>).forEach((category) => {
    records[category].forEach((record) => {
      statement.run(
        category,
        record.id,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      );
    });
  });
};

const insertReaderProgress = (
  statement: StatementSync,
  records: ScraperReaderProgressRecord[],
): void => {
  records.forEach((record) => {
    statement.run(
      record.id,
      record.scraperId,
      record.sourceUrl,
      record.updatedAt,
      JSON.stringify(record),
    );
  });
};

const getStoredCollectionCount = (database: DatabaseSync): number => {
  const row = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM scraper_bookmarks)
      + (SELECT COUNT(*) FROM scraper_view_history)
      + (SELECT COUNT(*) FROM app_history)
      + (SELECT COUNT(*) FROM scraper_reader_progress) AS count
  `).get();

  return Number(row?.count ?? 0);
};

export const migrateLegacyCollections = (
  database: DatabaseSync,
  paths: LegacyCollectionPaths,
): void => {
  const existingMigration = database.prepare(
    "SELECT value FROM collection_metadata WHERE key = ?",
  ).get(LEGACY_IMPORT_KEY);
  if (existingMigration) {
    return;
  }

  if (getStoredCollectionCount(database) > 0) {
    throw new Error("La base de donnees contient des donnees sans migration JSON finalisee.");
  }

  const snapshot = readLegacySnapshot(paths);
  const bookmarkStatement = database.prepare(`
    INSERT OR REPLACE INTO scraper_bookmarks
      (scraper_id, source_url, title, created_at, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const viewHistoryStatement = database.prepare(`
    INSERT OR REPLACE INTO scraper_view_history
      (id, scraper_id, source_url, first_seen_at, read_at, activity_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const appHistoryStatement = database.prepare(`
    INSERT OR REPLACE INTO app_history
      (category, id, created_at, updated_at, payload)
    VALUES (?, ?, ?, ?, ?)
  `);
  const progressStatement = database.prepare(`
    INSERT OR REPLACE INTO scraper_reader_progress
      (id, scraper_id, source_url, updated_at, payload)
    VALUES (?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN IMMEDIATE");
  try {
    insertBookmarks(bookmarkStatement, snapshot.bookmarks);
    insertViewHistory(viewHistoryStatement, snapshot.viewHistory);
    insertAppHistory(appHistoryStatement, snapshot.appHistory);
    insertReaderProgress(progressStatement, snapshot.readerProgress);

    const migrationSummary = {
      completedAt: new Date().toISOString(),
      counts: {
        bookmarks: snapshot.bookmarks.length,
        viewHistory: snapshot.viewHistory.length,
        readingHistory: snapshot.appHistory.reading.length,
        detailsHistory: snapshot.appHistory.details.length,
        searchHistory: snapshot.appHistory.searches.length,
        readerProgress: snapshot.readerProgress.length,
      },
    };
    database.prepare(
      "INSERT INTO collection_metadata (key, value) VALUES (?, ?)",
    ).run(LEGACY_IMPORT_KEY, JSON.stringify(migrationSummary));
    database.exec("COMMIT");
    console.info("Converted legacy JSON collections to SQLite", migrationSummary.counts);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};
