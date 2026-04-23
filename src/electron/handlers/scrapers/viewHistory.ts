import { type IpcMainInvokeEvent } from "electron";
import {
  buildScraperViewHistoryCardId,
  type RecordScraperCardsSeenRequest,
  type ScraperViewHistoryCardIdentity,
  type ScraperViewHistoryRecord,
  type SetScraperCardReadRequest,
} from "../../scraper";
import {
  readScraperViewHistoryFile,
  writeScraperViewHistoryFile,
} from "./storage";
import {
  sanitizeScraperViewHistoryCardIdentity,
  sanitizeScraperViewHistoryRecord,
} from "./shared";

let scraperViewHistoryMutationQueue: Promise<void> = Promise.resolve();

const runScraperViewHistoryMutation = async <T>(
  mutation: () => Promise<T>,
): Promise<T> => {
  const result = scraperViewHistoryMutationQueue.then(mutation, mutation);
  scraperViewHistoryMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const toSeenRecord = (
  identity: ScraperViewHistoryCardIdentity,
  existing: ScraperViewHistoryRecord | null,
  now: string,
): ScraperViewHistoryRecord | null => (
  sanitizeScraperViewHistoryRecord({
    ...existing,
    scraperId: identity.scraperId,
    sourceUrl: identity.sourceUrl || undefined,
    title: identity.title || undefined,
    thumbnailUrl: identity.thumbnailUrl || undefined,
    firstSeenAt: existing?.firstSeenAt ?? now,
    readAt: existing?.readAt,
  })
);

const toReadRecord = (
  identity: ScraperViewHistoryCardIdentity,
  existing: ScraperViewHistoryRecord | null,
  now: string,
  read: boolean,
): ScraperViewHistoryRecord | null => (
  sanitizeScraperViewHistoryRecord({
    ...existing,
    scraperId: identity.scraperId,
    sourceUrl: identity.sourceUrl || undefined,
    title: identity.title || undefined,
    thumbnailUrl: identity.thumbnailUrl || undefined,
    firstSeenAt: existing?.firstSeenAt ?? now,
    readAt: read ? now : undefined,
  })
);

const normalizeSeenCardsRequest = (
  request: RecordScraperCardsSeenRequest | ScraperViewHistoryCardIdentity[] | null | undefined,
): ScraperViewHistoryCardIdentity[] => {
  const cards = Array.isArray(request)
    ? request
    : Array.isArray(request?.cards)
      ? request.cards
      : [];

  return cards
    .map((card) => sanitizeScraperViewHistoryCardIdentity(card))
    .filter((card): card is ScraperViewHistoryCardIdentity => Boolean(card));
};

export async function getScraperViewHistory(
  _event?: IpcMainInvokeEvent,
  scraperId?: string | null,
): Promise<ScraperViewHistoryRecord[]> {
  await scraperViewHistoryMutationQueue;

  const records = await readScraperViewHistoryFile();
  const normalizedScraperId = String(scraperId ?? "").trim();

  if (!normalizedScraperId) {
    return records;
  }

  return records.filter((record) => record.scraperId === normalizedScraperId);
}

export async function recordScraperCardsSeen(
  _event: IpcMainInvokeEvent,
  request: RecordScraperCardsSeenRequest | ScraperViewHistoryCardIdentity[],
): Promise<ScraperViewHistoryRecord[]> {
  return runScraperViewHistoryMutation(async () => {
    const cards = normalizeSeenCardsRequest(request);
    if (!cards.length) {
      return readScraperViewHistoryFile();
    }

    const now = new Date().toISOString();
    const records = await readScraperViewHistoryFile();
    const recordsById = new Map(records.map((record) => [record.id, record]));

    cards.forEach((card) => {
      const id = buildScraperViewHistoryCardId(card);
      if (!id) {
        return;
      }

      const record = toSeenRecord(card, recordsById.get(id) ?? null, now);
      if (record) {
        recordsById.set(record.id, record);
      }
    });

    const nextRecords = Array.from(recordsById.values());
    await writeScraperViewHistoryFile(nextRecords);
    return readScraperViewHistoryFile();
  });
}

export async function setScraperCardRead(
  _event: IpcMainInvokeEvent,
  request: SetScraperCardReadRequest,
): Promise<ScraperViewHistoryRecord> {
  return runScraperViewHistoryMutation(async () => {
    const identity = sanitizeScraperViewHistoryCardIdentity(request);
    if (!identity) {
      throw new Error("La carte scraper est incomplete.");
    }

    const now = new Date().toISOString();
    const id = buildScraperViewHistoryCardId(identity);
    const records = await readScraperViewHistoryFile();
    const existingIndex = records.findIndex((record) => record.id === id);
    const existing = existingIndex >= 0 ? records[existingIndex] : null;
    const record = toReadRecord(identity, existing, now, Boolean(request.read));

    if (!record) {
      throw new Error("La carte scraper est incomplete.");
    }

    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }

    await writeScraperViewHistoryFile(records);
    return record;
  });
}
