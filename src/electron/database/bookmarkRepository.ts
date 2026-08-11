import type { ScraperBookmarkRecord } from "../../shared/scraper";
import { getCollectionsDatabase } from "./connection";
import {
  parsePayloadRow,
  parsePayloadRows,
  toChangedRowCount,
} from "./repositoryUtils";

export const listScraperBookmarks = (scraperId?: string | null): ScraperBookmarkRecord[] => {
  const database = getCollectionsDatabase();
  const normalizedScraperId = String(scraperId ?? "").trim();
  const rows = normalizedScraperId
    ? database.prepare(`
      SELECT payload
      FROM scraper_bookmarks
      WHERE scraper_id = ?
      ORDER BY created_at, source_url, scraper_id
    `).all(normalizedScraperId)
    : database.prepare(`
      SELECT payload
      FROM scraper_bookmarks
      ORDER BY created_at, source_url, scraper_id
    `).all();

  return parsePayloadRows<ScraperBookmarkRecord>(rows);
};

export const countScraperBookmarks = (scraperId?: string | null): number => {
  const database = getCollectionsDatabase();
  const normalizedScraperId = String(scraperId ?? "").trim();
  const row = normalizedScraperId
    ? database.prepare("SELECT COUNT(*) AS count FROM scraper_bookmarks WHERE scraper_id = ?")
      .get(normalizedScraperId)
    : database.prepare("SELECT COUNT(*) AS count FROM scraper_bookmarks").get();

  return Number(row?.count ?? 0);
};

export const getScraperBookmark = (
  scraperId: string,
  sourceUrl: string,
): ScraperBookmarkRecord | null => (
  parsePayloadRow<ScraperBookmarkRecord>(
    getCollectionsDatabase().prepare(`
      SELECT payload
      FROM scraper_bookmarks
      WHERE scraper_id = ? AND source_url = ?
    `).get(scraperId, sourceUrl),
  )
);

export const upsertScraperBookmark = (record: ScraperBookmarkRecord): void => {
  getCollectionsDatabase().prepare(`
    INSERT INTO scraper_bookmarks
      (scraper_id, source_url, title, created_at, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (scraper_id, source_url) DO UPDATE SET
      title = excluded.title,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `).run(
    record.scraperId,
    record.sourceUrl,
    record.title,
    record.createdAt,
    record.updatedAt,
    JSON.stringify(record),
  );
};

export const removeStoredScraperBookmark = (
  scraperId: string,
  sourceUrl: string,
): boolean => {
  const result = getCollectionsDatabase().prepare(`
    DELETE FROM scraper_bookmarks
    WHERE scraper_id = ? AND source_url = ?
  `).run(scraperId, sourceUrl);

  return toChangedRowCount(result.changes) > 0;
};

export const removeStoredScraperBookmarksByScraper = (scraperId: string): number => {
  const result = getCollectionsDatabase().prepare(`
    DELETE FROM scraper_bookmarks
    WHERE scraper_id = ?
  `).run(scraperId);

  return toChangedRowCount(result.changes);
};
