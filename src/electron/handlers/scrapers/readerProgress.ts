import { type IpcMainInvokeEvent } from "electron";
import {
  normalizeScraperViewHistorySourceUrl,
  type RemoveScraperReaderProgressRequest,
  type SaveScraperReaderProgressRequest,
  type ScraperReaderProgressRecord,
} from "../../scraper";
import {
  getStoredScraperReaderProgress,
  listScraperReaderProgress,
  removeStoredScraperReaderProgressBySource,
  upsertScraperReaderProgress,
} from "../../database/readerProgressRepository";
import { sanitizeScraperReaderProgressRecord } from "./shared";

export async function getScraperReaderProgress(
  _event: IpcMainInvokeEvent,
  scraperMangaId: string,
): Promise<ScraperReaderProgressRecord | null> {
  return getStoredScraperReaderProgress(String(scraperMangaId));
}

export async function getScraperReaderProgressRecords(
  _event?: IpcMainInvokeEvent,
  scraperId?: string | null,
): Promise<ScraperReaderProgressRecord[]> {
  return listScraperReaderProgress(scraperId);
}

export async function saveScraperReaderProgress(
  _event: IpcMainInvokeEvent,
  request: SaveScraperReaderProgressRequest,
): Promise<ScraperReaderProgressRecord> {
  const normalized = sanitizeScraperReaderProgressRecord({
    ...request,
    updatedAt: new Date().toISOString(),
  });

  if (!normalized) {
    throw new Error("La progression du reader scraper est incomplete.");
  }

  upsertScraperReaderProgress(normalized);
  return normalized;
}

export async function removeScraperReaderProgress(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperReaderProgressRequest,
): Promise<number> {
  const scraperId = String(request?.scraperId ?? "").trim();
  const sourceUrl = normalizeScraperViewHistorySourceUrl(request?.sourceUrl);

  if (!scraperId || !sourceUrl) {
    throw new Error("La source de la progression est incomplete.");
  }

  return removeStoredScraperReaderProgressBySource(scraperId, sourceUrl);
}
