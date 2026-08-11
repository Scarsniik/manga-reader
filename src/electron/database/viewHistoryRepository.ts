import type {
  ScraperViewHistoryRecord,
  ScraperViewHistorySettings,
} from "../../shared/scraper";
import { getCollectionsDatabase } from "./connection";
import {
  parsePayloadRow,
  parsePayloadRows,
} from "./repositoryUtils";

const DAY_MS = 24 * 60 * 60 * 1000;

const getActivityAt = (record: ScraperViewHistoryRecord): string => (
  record.readAt && record.readAt > record.firstSeenAt ? record.readAt : record.firstSeenAt
);

export const pruneStoredScraperViewHistory = (
  settings: ScraperViewHistorySettings,
  now = new Date(),
): void => {
  const database = getCollectionsDatabase();

  if (settings.scraperViewHistorySeenRetentionDays > 0) {
    const cutoff = new Date(
      now.getTime() - (settings.scraperViewHistorySeenRetentionDays * DAY_MS),
    ).toISOString();
    database.prepare(`
      DELETE FROM scraper_view_history
      WHERE read_at IS NULL AND activity_at < ?
    `).run(cutoff);
  }

  if (settings.scraperViewHistoryReadRetentionDays > 0) {
    const cutoff = new Date(
      now.getTime() - (settings.scraperViewHistoryReadRetentionDays * DAY_MS),
    ).toISOString();
    database.prepare(`
      DELETE FROM scraper_view_history
      WHERE read_at IS NOT NULL AND activity_at < ?
    `).run(cutoff);
  }

  if (settings.scraperViewHistoryMaxRecords > 0) {
    database.prepare(`
      DELETE FROM scraper_view_history
      WHERE id NOT IN (
        SELECT id
        FROM scraper_view_history
        ORDER BY
          CASE WHEN read_at IS NOT NULL THEN 0 ELSE 1 END,
          activity_at DESC,
          scraper_id,
          id
        LIMIT ?
      )
    `).run(settings.scraperViewHistoryMaxRecords);
  }
};

export const listScraperViewHistory = (
  scraperId?: string | null,
): ScraperViewHistoryRecord[] => {
  const database = getCollectionsDatabase();
  const normalizedScraperId = String(scraperId ?? "").trim();
  const rows = normalizedScraperId
    ? database.prepare(`
      SELECT payload
      FROM scraper_view_history
      WHERE scraper_id = ?
      ORDER BY activity_at DESC, scraper_id, id
    `).all(normalizedScraperId)
    : database.prepare(`
      SELECT payload
      FROM scraper_view_history
      ORDER BY activity_at DESC, scraper_id, id
    `).all();

  return parsePayloadRows<ScraperViewHistoryRecord>(rows);
};

export const getStoredScraperViewHistoryRecord = (
  recordId: string,
): ScraperViewHistoryRecord | null => (
  parsePayloadRow<ScraperViewHistoryRecord>(getCollectionsDatabase().prepare(`
    SELECT payload
    FROM scraper_view_history
    WHERE id = ?
  `).get(recordId))
);

export const upsertStoredScraperViewHistoryRecord = (
  record: ScraperViewHistoryRecord,
): void => {
  getCollectionsDatabase().prepare(`
    INSERT INTO scraper_view_history
      (id, scraper_id, source_url, first_seen_at, read_at, activity_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      scraper_id = excluded.scraper_id,
      source_url = excluded.source_url,
      first_seen_at = excluded.first_seen_at,
      read_at = excluded.read_at,
      activity_at = excluded.activity_at,
      payload = excluded.payload
  `).run(
    record.id,
    record.scraperId,
    record.sourceUrl ?? null,
    record.firstSeenAt,
    record.readAt ?? null,
    getActivityAt(record),
    JSON.stringify(record),
  );
};
