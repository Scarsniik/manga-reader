import { type IpcMainInvokeEvent } from "electron";
import {
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
