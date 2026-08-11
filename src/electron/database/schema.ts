import type { DatabaseSync } from "node:sqlite";

export const COLLECTIONS_SCHEMA_VERSION = 1;

export const configureCollectionsDatabase = (database: DatabaseSync): void => {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
};

export const migrateCollectionsSchema = (database: DatabaseSync): void => {
  const versionRow = database.prepare("PRAGMA user_version").get();
  const currentVersion = Number(versionRow?.user_version ?? 0);

  if (currentVersion > COLLECTIONS_SCHEMA_VERSION) {
    throw new Error(
      `La base de donnees utilisateur utilise une version non prise en charge (${currentVersion}).`,
    );
  }

  if (currentVersion === COLLECTIONS_SCHEMA_VERSION) {
    return;
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS collection_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS scraper_bookmarks (
        scraper_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (scraper_id, source_url)
      ) WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS scraper_bookmarks_scraper_created_index
        ON scraper_bookmarks (scraper_id, created_at, source_url);
      CREATE INDEX IF NOT EXISTS scraper_bookmarks_updated_index
        ON scraper_bookmarks (updated_at DESC);

      CREATE TABLE IF NOT EXISTS scraper_view_history (
        id TEXT PRIMARY KEY,
        scraper_id TEXT NOT NULL,
        source_url TEXT,
        first_seen_at TEXT NOT NULL,
        read_at TEXT,
        activity_at TEXT NOT NULL,
        payload TEXT NOT NULL
      ) WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS scraper_view_history_scraper_activity_index
        ON scraper_view_history (scraper_id, activity_at DESC, id);
      CREATE INDEX IF NOT EXISTS scraper_view_history_read_activity_index
        ON scraper_view_history (read_at, activity_at DESC, id);

      CREATE TABLE IF NOT EXISTS app_history (
        category TEXT NOT NULL CHECK (category IN ('reading', 'details', 'searches')),
        id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (category, id)
      ) WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS app_history_category_updated_index
        ON app_history (category, updated_at DESC, id);

      CREATE TABLE IF NOT EXISTS scraper_reader_progress (
        id TEXT PRIMARY KEY,
        scraper_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      ) WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS scraper_reader_progress_scraper_source_index
        ON scraper_reader_progress (scraper_id, source_url, updated_at DESC);

      PRAGMA user_version = 1;
    `);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
};
