import { type IpcMainInvokeEvent } from "electron";
import {
  normalizeScraperViewHistorySourceUrl,
  type RemoveScraperReaderProgressRequest,
  type SaveScraperReaderProgressRequest,
  type ScraperReaderProgressRecord,
} from "../../scraper";
import {
  readScraperReaderProgressFile,
  writeScraperReaderProgressFile,
} from "./storage";
import { sanitizeScraperReaderProgressRecord } from "./shared";

export async function getScraperReaderProgress(
  _event: IpcMainInvokeEvent,
  scraperMangaId: string,
): Promise<ScraperReaderProgressRecord | null> {
  const records = await readScraperReaderProgressFile();
  return records.find((record) => record.id === String(scraperMangaId)) ?? null;
}

export async function getScraperReaderProgressRecords(
  _event?: IpcMainInvokeEvent,
  scraperId?: string | null,
): Promise<ScraperReaderProgressRecord[]> {
  const records = await readScraperReaderProgressFile();
  const normalizedScraperId = String(scraperId ?? "").trim();

  if (!normalizedScraperId) {
    return records;
  }

  return records.filter((record) => record.scraperId === normalizedScraperId);
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

  const records = await readScraperReaderProgressFile();
  const existingIndex = records.findIndex((record) => record.id === normalized.id);

  if (existingIndex >= 0) {
    records[existingIndex] = normalized;
  } else {
    records.push(normalized);
  }

  await writeScraperReaderProgressFile(records);
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

  const records = await readScraperReaderProgressFile();
  const retainedRecords = records.filter((record) => (
    record.scraperId !== scraperId
    || normalizeScraperViewHistorySourceUrl(record.sourceUrl) !== sourceUrl
  ));
  const removedCount = records.length - retainedRecords.length;

  if (removedCount > 0) {
    await writeScraperReaderProgressFile(retainedRecords);
  }

  return removedCount;
}
