import { type IpcMainInvokeEvent } from "electron";
import {
  buildScraperViewHistoryCardId,
  normalizeScraperViewHistorySettings,
  type RecordScraperCardsSeenRequest,
  type ScraperViewHistoryCardIdentity,
  type ScraperViewHistoryRecord,
  type ScraperViewHistorySettings,
  type SetScraperCardReadRequest,
} from "../../scraper";
import { getCollectionsDatabase } from "../../database/connection";
import { runDatabaseTransaction } from "../../database/repositoryUtils";
import {
  getStoredScraperViewHistoryRecord,
  listScraperViewHistory,
  pruneStoredScraperViewHistory,
  upsertStoredScraperViewHistoryRecord,
} from "../../database/viewHistoryRepository";
import { getSettings } from "../params";
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

const getViewHistorySettings = async (): Promise<ScraperViewHistorySettings> => (
  normalizeScraperViewHistorySettings(await getSettings())
);

const readPrunedViewHistory = async (
  scraperId?: string | null,
): Promise<ScraperViewHistoryRecord[]> => {
  pruneStoredScraperViewHistory(await getViewHistorySettings());
  return listScraperViewHistory(scraperId);
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

const upsertSeenCards = (
  cards: ScraperViewHistoryCardIdentity[],
  now: string,
): ScraperViewHistoryRecord[] => {
  const updatedRecords: ScraperViewHistoryRecord[] = [];

  cards.forEach((card) => {
    const id = buildScraperViewHistoryCardId(card);
    if (!id) {
      return;
    }

    const existing = getStoredScraperViewHistoryRecord(id);
    const record = toSeenRecord(card, existing, now);
    if (record) {
      upsertStoredScraperViewHistoryRecord(record);
      updatedRecords.push(record);
    }
  });

  return updatedRecords;
};

export async function getScraperViewHistory(
  _event?: IpcMainInvokeEvent,
  scraperId?: string | null,
): Promise<ScraperViewHistoryRecord[]> {
  await scraperViewHistoryMutationQueue;
  return readPrunedViewHistory(scraperId);
}

export async function recordScraperCardsSeen(
  _event: IpcMainInvokeEvent,
  request: RecordScraperCardsSeenRequest | ScraperViewHistoryCardIdentity[],
): Promise<ScraperViewHistoryRecord[]> {
  return runScraperViewHistoryMutation(async () => {
    const cards = normalizeSeenCardsRequest(request);
    if (!cards.length) {
      return readPrunedViewHistory();
    }

    const settings = await getViewHistorySettings();
    runDatabaseTransaction(getCollectionsDatabase(), () => {
      upsertSeenCards(cards, new Date().toISOString());
      pruneStoredScraperViewHistory(settings);
    });
    return listScraperViewHistory();
  });
}

export async function recordScraperCardsSeenCompact(
  _event: IpcMainInvokeEvent,
  request: RecordScraperCardsSeenRequest | ScraperViewHistoryCardIdentity[],
): Promise<ScraperViewHistoryRecord[]> {
  return runScraperViewHistoryMutation(async () => {
    const cards = normalizeSeenCardsRequest(request);
    if (!cards.length) {
      return [];
    }

    const settings = await getViewHistorySettings();
    return runDatabaseTransaction(getCollectionsDatabase(), () => {
      const updatedRecords = upsertSeenCards(cards, new Date().toISOString());
      pruneStoredScraperViewHistory(settings);
      return updatedRecords;
    });
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

    const id = buildScraperViewHistoryCardId(identity);
    const existing = getStoredScraperViewHistoryRecord(id);
    const record = toReadRecord(identity, existing, new Date().toISOString(), Boolean(request.read));
    if (!record) {
      throw new Error("La carte scraper est incomplete.");
    }

    const settings = await getViewHistorySettings();
    runDatabaseTransaction(getCollectionsDatabase(), () => {
      upsertStoredScraperViewHistoryRecord(record);
      pruneStoredScraperViewHistory(settings);
    });
    return record;
  });
}
