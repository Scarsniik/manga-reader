import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  buildScraperViewHistoryCardId,
  type RecordScraperCardsSeenRequest,
  type ScraperViewHistoryCardIdentity,
  type ScraperViewHistoryRecord,
  type SetScraperCardReadRequest,
} from '@/shared/scraper';

type ScraperViewHistoryState = {
  loaded: boolean;
  loading: boolean;
  records: ScraperViewHistoryRecord[];
  error: string | null;
};

type UseScraperViewHistoryOptions = {
  scraperId?: string | null;
};

const listeners = new Set<() => void>();

let state: ScraperViewHistoryState = {
  loaded: false,
  loading: false,
  records: [],
  error: null,
};

let inFlightLoad: Promise<ScraperViewHistoryRecord[]> | null = null;
let hasBoundWindowEvents = false;

const getSnapshot = (): ScraperViewHistoryState => state;

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const setState = (
  updater: Partial<ScraperViewHistoryState> | ((previous: ScraperViewHistoryState) => ScraperViewHistoryState),
) => {
  state = typeof updater === 'function'
    ? updater(state)
    : {
      ...state,
      ...updater,
    };
  emitChange();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getApi = (): any => (
  typeof window !== 'undefined' ? (window as any).api : null
);

const getActivityTime = (record: ScraperViewHistoryRecord): number => {
  const timestamps = [
    record.readAt,
    record.firstSeenAt,
  ]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));

  return timestamps.length ? Math.max(...timestamps) : 0;
};

const sortRecords = (records: ScraperViewHistoryRecord[]): ScraperViewHistoryRecord[] => (
  [...records].sort((left, right) => {
    const activityCompare = getActivityTime(right) - getActivityTime(left);
    if (activityCompare !== 0) {
      return activityCompare;
    }

    const scraperCompare = left.scraperId.localeCompare(right.scraperId);
    if (scraperCompare !== 0) {
      return scraperCompare;
    }

    return left.id.localeCompare(right.id);
  })
);

const upsertRecord = (
  records: ScraperViewHistoryRecord[],
  record: ScraperViewHistoryRecord,
): ScraperViewHistoryRecord[] => {
  const next = records.filter((candidate) => candidate.id !== record.id);
  next.push(record);
  return sortRecords(next);
};

const replaceRecords = (records: unknown): ScraperViewHistoryRecord[] => (
  Array.isArray(records) ? sortRecords(records as ScraperViewHistoryRecord[]) : []
);

const handleExternalViewHistoryUpdate = () => {
  void loadScraperViewHistory(true);
};

const bindWindowEvents = () => {
  if (hasBoundWindowEvents || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('scraper-view-history-updated', handleExternalViewHistoryUpdate as EventListener);
  hasBoundWindowEvents = true;
};

export const loadScraperViewHistory = async (force = false): Promise<ScraperViewHistoryRecord[]> => {
  bindWindowEvents();

  const api = getApi();
  if (!api || typeof api.getScraperViewHistory !== 'function') {
    if (!state.loaded || state.records.length || state.error) {
      setState({
        loaded: true,
        loading: false,
        records: [],
        error: null,
      });
    }
    return [];
  }

  if (!force && state.loaded) {
    return state.records;
  }

  if (inFlightLoad) {
    return inFlightLoad;
  }

  setState({
    loading: true,
    error: null,
  });

  inFlightLoad = (async () => {
    try {
      const data = await api.getScraperViewHistory();
      const records = replaceRecords(data);
      setState({
        loaded: true,
        loading: false,
        records,
        error: null,
      });
      return records;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de charger l\'historique scraper.';
      setState((previous) => ({
        ...previous,
        loaded: true,
        loading: false,
        error: message,
      }));
      return state.records;
    } finally {
      inFlightLoad = null;
    }
  })();

  return inFlightLoad;
};

export const recordScraperCardsSeen = async (
  cards: ScraperViewHistoryCardIdentity[],
): Promise<ScraperViewHistoryRecord[]> => {
  const api = getApi();
  if (!api || typeof api.recordScraperCardsSeen !== 'function') {
    return state.records;
  }

  const request: RecordScraperCardsSeenRequest = { cards };
  const data = await api.recordScraperCardsSeen(request);
  const records = replaceRecords(data);

  setState({
    loaded: true,
    loading: false,
    records,
    error: null,
  });

  return records;
};

export const setScraperCardRead = async (
  request: SetScraperCardReadRequest,
): Promise<ScraperViewHistoryRecord> => {
  const api = getApi();

  if (!api || typeof api.setScraperCardRead !== 'function') {
    throw new Error('L\'historique scraper n\'est pas disponible dans cette version.');
  }

  const record = await api.setScraperCardRead(request);
  if (!record) {
    throw new Error('La carte scraper n\'a pas pu etre mise a jour.');
  }

  setState((previous) => ({
    ...previous,
    loaded: true,
    loading: false,
    error: null,
    records: upsertRecord(previous.records, record as ScraperViewHistoryRecord),
  }));

  return record as ScraperViewHistoryRecord;
};

export const useScraperViewHistory = (options?: UseScraperViewHistoryOptions) => {
  bindWindowEvents();

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void loadScraperViewHistory();
  }, []);

  const normalizedScraperId = String(options?.scraperId ?? '').trim();

  const records = useMemo(
    () => (
      normalizedScraperId
        ? snapshot.records.filter((record) => record.scraperId === normalizedScraperId)
        : snapshot.records
    ),
    [normalizedScraperId, snapshot.records],
  );

  const recordsById = useMemo(
    () => new Map(records.map((record) => [record.id, record])),
    [records],
  );

  return {
    loaded: snapshot.loaded,
    loading: snapshot.loading,
    error: snapshot.error,
    records,
    recordsById,
    getRecord: (identity: ScraperViewHistoryCardIdentity) => {
      const id = buildScraperViewHistoryCardId(identity);
      return id ? recordsById.get(id) ?? null : null;
    },
    reload: () => loadScraperViewHistory(true),
  };
};
