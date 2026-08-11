import type { ScraperReaderProgressRecord } from "../../shared/scraper";
import { getCollectionsDatabase } from "./connection";
import {
  parsePayloadRow,
  parsePayloadRows,
  toChangedRowCount,
} from "./repositoryUtils";

export const listScraperReaderProgress = (
  scraperId?: string | null,
): ScraperReaderProgressRecord[] => {
  const database = getCollectionsDatabase();
  const normalizedScraperId = String(scraperId ?? "").trim();
  const rows = normalizedScraperId
    ? database.prepare(`
      SELECT payload
      FROM scraper_reader_progress
      WHERE scraper_id = ?
      ORDER BY updated_at DESC, id
    `).all(normalizedScraperId)
    : database.prepare(`
      SELECT payload
      FROM scraper_reader_progress
      ORDER BY updated_at DESC, id
    `).all();

  return parsePayloadRows<ScraperReaderProgressRecord>(rows);
};

export const getStoredScraperReaderProgress = (
  recordId: string,
): ScraperReaderProgressRecord | null => (
  parsePayloadRow<ScraperReaderProgressRecord>(
    getCollectionsDatabase().prepare(`
      SELECT payload
      FROM scraper_reader_progress
      WHERE id = ?
    `).get(recordId),
  )
);

export const upsertScraperReaderProgress = (record: ScraperReaderProgressRecord): void => {
  getCollectionsDatabase().prepare(`
    INSERT INTO scraper_reader_progress
      (id, scraper_id, source_url, updated_at, payload)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      scraper_id = excluded.scraper_id,
      source_url = excluded.source_url,
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `).run(
    record.id,
    record.scraperId,
    record.sourceUrl,
    record.updatedAt,
    JSON.stringify(record),
  );
};

export const removeStoredScraperReaderProgressBySource = (
  scraperId: string,
  sourceUrl: string,
): number => {
  const result = getCollectionsDatabase().prepare(`
    DELETE FROM scraper_reader_progress
    WHERE scraper_id = ? AND source_url = ?
  `).run(scraperId, sourceUrl);

  return toChangedRowCount(result.changes);
};

export const removeStoredScraperReaderProgressByScraper = (scraperId: string): number => {
  const result = getCollectionsDatabase().prepare(`
    DELETE FROM scraper_reader_progress
    WHERE scraper_id = ?
  `).run(scraperId);

  return toChangedRowCount(result.changes);
};
