import { promises as fs } from "fs";
import { type IpcMainInvokeEvent } from "electron";
import {
  buildScraperLatestCheckpointId,
  buildScraperViewHistoryCardId,
  normalizeScraperLatestCheckpointLanguageCodes,
  normalizeScraperLatestCheckpointQuery,
  type SaveScraperLatestCheckpointRequest,
  type ScraperLatestCheckpointModule,
  type ScraperLatestCheckpointRecord,
} from "../../scraper";
import {
  ensureDataDir,
  scraperLatestCheckpointsFilePath,
} from "../../utils";
import { sanitizeScraperViewHistoryCardIdentity } from "./shared";

let scraperLatestCheckpointMutationQueue: Promise<void> = Promise.resolve();

const runScraperLatestCheckpointMutation = async <T>(
  mutation: () => Promise<T>,
): Promise<T> => {
  const result = scraperLatestCheckpointMutationQueue.then(mutation, mutation);
  scraperLatestCheckpointMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const normalizeText = (value: unknown): string => (
  String(value ?? "").trim()
);

const sanitizeModule = (value: unknown): ScraperLatestCheckpointModule | null => (
  value === "homepage" || value === "search" ? value : null
);

const sanitizePageIndex = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const sanitizeOptionalText = (value: unknown): string | undefined => {
  const normalized = normalizeText(value);
  return normalized || undefined;
};

const sanitizeIsoDate = (value: unknown, fallback: string): string => {
  const text = normalizeText(value);
  if (!text) {
    return fallback;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
};

const sanitizeCheckpointRecord = (
  value: Partial<ScraperLatestCheckpointRecord | SaveScraperLatestCheckpointRequest> | null | undefined,
  now = new Date().toISOString(),
): ScraperLatestCheckpointRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const scraperId = normalizeText(value.scraperId);
  const module = sanitizeModule(value.module);
  const query = normalizeScraperLatestCheckpointQuery(value.query);
  const includedLanguageCodes = normalizeScraperLatestCheckpointLanguageCodes(value.includedLanguageCodes);
  const anchorIdentity = sanitizeScraperViewHistoryCardIdentity(value.anchorIdentity ?? {});

  if (!scraperId || !module || !anchorIdentity) {
    return null;
  }

  const id = buildScraperLatestCheckpointId({
    scraperId,
    module,
    query,
    includedLanguageCodes,
  });
  const anchorCardId = normalizeText(value.anchorCardId) || buildScraperViewHistoryCardId(anchorIdentity);

  if (!id || !anchorCardId) {
    return null;
  }

  return {
    id,
    scraperId,
    module,
    query,
    includedLanguageCodes,
    scraperUpdatedAt: sanitizeOptionalText(value.scraperUpdatedAt),
    pageIndex: sanitizePageIndex(value.pageIndex),
    currentPageUrl: sanitizeOptionalText(value.currentPageUrl),
    nextPageUrl: sanitizeOptionalText(value.nextPageUrl),
    anchorCardId,
    anchorIdentity,
    updatedAt: sanitizeIsoDate((value as ScraperLatestCheckpointRecord).updatedAt, now),
  };
};

const sortCheckpoints = (
  records: ScraperLatestCheckpointRecord[],
): ScraperLatestCheckpointRecord[] => (
  [...records].sort((left, right) => {
    const scraperCompare = left.scraperId.localeCompare(right.scraperId);
    if (scraperCompare !== 0) {
      return scraperCompare;
    }

    const moduleCompare = left.module.localeCompare(right.module);
    if (moduleCompare !== 0) {
      return moduleCompare;
    }

    const queryCompare = left.query.localeCompare(right.query);
    if (queryCompare !== 0) {
      return queryCompare;
    }

    return left.includedLanguageCodes.join("|").localeCompare(right.includedLanguageCodes.join("|"));
  })
);

const readScraperLatestCheckpointFile = async (): Promise<ScraperLatestCheckpointRecord[]> => {
  try {
    const data = await fs.readFile(scraperLatestCheckpointsFilePath, "utf-8");
    const parsed = JSON.parse(data);
    const records = Array.isArray(parsed)
      ? parsed
        .map((record) => sanitizeCheckpointRecord(record))
        .filter((record): record is ScraperLatestCheckpointRecord => Boolean(record))
      : [];
    const normalizedRaw = JSON.stringify(parsed, null, 2);
    const normalizedRecords = JSON.stringify(sortCheckpoints(records), null, 2);

    if (normalizedRaw !== normalizedRecords) {
      await ensureDataDir();
      await fs.writeFile(scraperLatestCheckpointsFilePath, normalizedRecords);
    }

    return sortCheckpoints(records);
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      await ensureDataDir();
      await fs.writeFile(scraperLatestCheckpointsFilePath, JSON.stringify([], null, 2));
      return [];
    }

    console.error("Error reading scraper latest checkpoints file:", error);
    throw new Error("Failed to read scraper latest checkpoints");
  }
};

const writeScraperLatestCheckpointFile = async (
  records: ScraperLatestCheckpointRecord[],
): Promise<void> => {
  await ensureDataDir();
  await fs.writeFile(scraperLatestCheckpointsFilePath, JSON.stringify(sortCheckpoints(records), null, 2));
};

export async function getScraperLatestCheckpoints(
  _event?: IpcMainInvokeEvent,
  scraperId?: string | null,
): Promise<ScraperLatestCheckpointRecord[]> {
  await scraperLatestCheckpointMutationQueue;

  const records = await readScraperLatestCheckpointFile();
  const normalizedScraperId = normalizeText(scraperId);

  if (!normalizedScraperId) {
    return records;
  }

  return records.filter((record) => record.scraperId === normalizedScraperId);
}

export async function saveScraperLatestCheckpoint(
  _event: IpcMainInvokeEvent,
  request: SaveScraperLatestCheckpointRequest,
): Promise<ScraperLatestCheckpointRecord> {
  return runScraperLatestCheckpointMutation(async () => {
    const now = new Date().toISOString();
    const checkpoint = sanitizeCheckpointRecord(request, now);

    if (!checkpoint) {
      throw new Error("Le checkpoint de nouveautes est incomplet.");
    }

    const records = await readScraperLatestCheckpointFile();
    const recordsById = new Map(records.map((record) => [record.id, record]));
    const existing = recordsById.get(checkpoint.id);

    if (
      existing
      && existing.scraperUpdatedAt === checkpoint.scraperUpdatedAt
      && checkpoint.pageIndex < existing.pageIndex
    ) {
      return existing;
    }

    recordsById.set(checkpoint.id, checkpoint);
    await writeScraperLatestCheckpointFile(Array.from(recordsById.values()));
    return checkpoint;
  });
}
