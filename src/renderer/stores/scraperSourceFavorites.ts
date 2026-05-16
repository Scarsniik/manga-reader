import { useEffect, useMemo, useSyncExternalStore } from "react";

type ScraperSourceFavoriteRecord<TSource> = {
  id: string;
  name: string;
  sources: TSource[];
};

type SourceIdentity = {
  scraperId: string;
  sourceUrl: string;
};

type ScraperSourceFavoriteStoreConfig<
  TRecord extends ScraperSourceFavoriteRecord<TSource>,
  TSource,
  TSaveRequest,
  TRemoveRequest extends { favoriteId: string },
  TRemoveSourceRequest extends { favoriteId: string },
> = {
  api: {
    get: string;
    save: string;
    remove: string;
    removeSource: string;
  };
  eventName: string;
  unavailableMessage: string;
  loadErrorMessage: string;
  saveErrorMessage: string;
  normalizeSourceUrl: (value: unknown) => string;
  getSourceIdentity: (source: TSource) => SourceIdentity;
  getRequestSourceIdentity: (request: TSaveRequest) => SourceIdentity;
};

type SourceFavoritesSnapshot<TRecord> = {
  favorites: TRecord[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

const getApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

export const normalizeScraperSourceFavoriteUrl = (value: unknown): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
};

export function createScraperSourceFavoritesStore<
  TRecord extends ScraperSourceFavoriteRecord<TSource>,
  TSource,
  TSaveRequest,
  TRemoveRequest extends { favoriteId: string },
  TRemoveSourceRequest extends { favoriteId: string },
>(
  config: ScraperSourceFavoriteStoreConfig<TRecord, TSource, TSaveRequest, TRemoveRequest, TRemoveSourceRequest>,
) {
  const initialSnapshot: SourceFavoritesSnapshot<TRecord> = {
    favorites: [],
    loaded: false,
    loading: false,
    error: null,
  };

  let snapshot = initialSnapshot;
  let inFlightLoad: Promise<TRecord[]> | null = null;
  let hasBoundExternalUpdates = false;
  const listeners = new Set<() => void>();

  const emitChange = () => {
    listeners.forEach((listener) => listener());
  };

  const setSnapshot = (
    updater: SourceFavoritesSnapshot<TRecord>
      | ((previous: SourceFavoritesSnapshot<TRecord>) => SourceFavoritesSnapshot<TRecord>),
  ) => {
    snapshot = typeof updater === "function"
      ? (updater as (previous: SourceFavoritesSnapshot<TRecord>) => SourceFavoritesSnapshot<TRecord>)(snapshot)
      : updater;
    emitChange();
  };

  const sortFavorites = (records: TRecord[]): TRecord[] => (
    [...records].sort((left, right) => left.name.localeCompare(right.name))
  );

  const getSourceKey = (
    scraperId: string | null | undefined,
    sourceUrl: string | null | undefined,
  ): string => {
    const normalizedScraperId = String(scraperId ?? "").trim();
    const normalizedSourceUrl = config.normalizeSourceUrl(sourceUrl);

    return normalizedScraperId && normalizedSourceUrl
      ? `${normalizedScraperId}::${normalizedSourceUrl}`
      : "";
  };

  const upsertFavorite = (
    records: TRecord[],
    favorite: TRecord,
  ): TRecord[] => {
    const next = records.filter((record) => record.id !== favorite.id);
    next.push(favorite);
    return sortFavorites(next);
  };

  const removeSourceFromOtherFavorites = (
    records: TRecord[],
    request: TSaveRequest,
    savedFavoriteId: string,
  ): TRecord[] => {
    const requestIdentity = config.getRequestSourceIdentity(request);
    const scraperId = String(requestIdentity.scraperId ?? "").trim();
    const sourceUrl = config.normalizeSourceUrl(requestIdentity.sourceUrl);

    return records.reduce<TRecord[]>((nextRecords, record) => {
      if (record.id === savedFavoriteId) {
        nextRecords.push(record);
        return nextRecords;
      }

      const nextSources = record.sources.filter((source) => {
        const sourceIdentity = config.getSourceIdentity(source);
        return !(sourceIdentity.scraperId === scraperId && sourceIdentity.sourceUrl === sourceUrl);
      });

      if (!nextSources.length) {
        return nextRecords;
      }

      nextRecords.push(nextSources.length === record.sources.length
        ? record
        : {
          ...record,
          sources: nextSources,
        });
      return nextRecords;
    }, []);
  };

  const removeFavorite = (
    records: TRecord[],
    favoriteId: string,
  ): TRecord[] => (
    records.filter((record) => record.id !== favoriteId)
  );

  const patchSourceRemoval = (
    records: TRecord[],
    request: TRemoveSourceRequest,
    updatedFavorite: TRecord | null,
  ): TRecord[] => {
    if (updatedFavorite) {
      return upsertFavorite(records, updatedFavorite);
    }

    return records.filter((record) => record.id !== request.favoriteId);
  };

  const bindExternalUpdates = () => {
    if (hasBoundExternalUpdates || typeof window === "undefined") {
      return;
    }

    const handleExternalFavoritesUpdate = () => {
      void loadFavorites(true);
    };

    window.addEventListener(
      config.eventName,
      handleExternalFavoritesUpdate as EventListener,
    );
    hasBoundExternalUpdates = true;
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    bindExternalUpdates();

    return () => {
      listeners.delete(listener);
    };
  };

  const getSnapshot = (): SourceFavoritesSnapshot<TRecord> => snapshot;

  const loadFavorites = async (
    force = false,
  ): Promise<TRecord[]> => {
    bindExternalUpdates();

    const api = getApi();
    if (!api || typeof api[config.api.get] !== "function") {
      setSnapshot({
        favorites: [],
        loaded: true,
        loading: false,
        error: config.unavailableMessage,
      });
      return [];
    }

    if (!force && snapshot.loaded) {
      return snapshot.favorites;
    }

    if (inFlightLoad && !force) {
      return inFlightLoad;
    }

    setSnapshot((previous) => ({
      ...previous,
      loading: true,
      error: null,
    }));

    inFlightLoad = (async () => {
      try {
        const data = await api[config.api.get]();
        const favorites = Array.isArray(data) ? sortFavorites(data as TRecord[]) : [];
        setSnapshot({
          favorites,
          loaded: true,
          loading: false,
          error: null,
        });
        return favorites;
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : config.loadErrorMessage;
        setSnapshot((previous) => ({
          ...previous,
          loaded: true,
          loading: false,
          error: message,
        }));
        return snapshot.favorites;
      } finally {
        inFlightLoad = null;
      }
    })();

    return inFlightLoad;
  };

  const saveFavorite = async (
    request: TSaveRequest,
  ): Promise<TRecord> => {
    const api = getApi();
    if (!api || typeof api[config.api.save] !== "function") {
      throw new Error(config.unavailableMessage);
    }

    const saved = await api[config.api.save](request);
    if (!saved || typeof saved !== "object") {
      throw new Error(config.saveErrorMessage);
    }

    const savedRecord = saved as TRecord;
    setSnapshot((previous) => ({
      ...previous,
      favorites: upsertFavorite(
        removeSourceFromOtherFavorites(previous.favorites, request, savedRecord.id),
        savedRecord,
      ),
      loaded: true,
      loading: false,
      error: null,
    }));

    return savedRecord;
  };

  const removeFavoriteByRequest = async (
    request: TRemoveRequest,
  ): Promise<boolean> => {
    const api = getApi();
    if (!api || typeof api[config.api.remove] !== "function") {
      throw new Error(config.unavailableMessage);
    }

    const removed = await api[config.api.remove](request);
    if (removed) {
      setSnapshot((previous) => ({
        ...previous,
        favorites: removeFavorite(previous.favorites, request.favoriteId),
      }));
    }

    return Boolean(removed);
  };

  const removeFavoriteSource = async (
    request: TRemoveSourceRequest,
  ): Promise<TRecord | null> => {
    const api = getApi();
    if (!api || typeof api[config.api.removeSource] !== "function") {
      throw new Error(config.unavailableMessage);
    }

    const updatedFavorite = await api[config.api.removeSource](request);
    setSnapshot((previous) => ({
      ...previous,
      favorites: patchSourceRemoval(
        previous.favorites,
        request,
        updatedFavorite as TRecord | null,
      ),
    }));

    return updatedFavorite as TRecord | null;
  };

  const useFavorites = () => {
    const currentSnapshot = useSyncExternalStore(
      subscribe,
      getSnapshot,
      getSnapshot,
    );

    useEffect(() => {
      void loadFavorites(false);
    }, []);

    const sourceMap = useMemo(() => {
      const nextMap = new Map<string, TRecord>();
      currentSnapshot.favorites.forEach((favorite) => {
        favorite.sources.forEach((source) => {
          const sourceIdentity = config.getSourceIdentity(source);
          const key = getSourceKey(sourceIdentity.scraperId, sourceIdentity.sourceUrl);
          if (key) {
            nextMap.set(key, favorite);
          }
        });
      });
      return nextMap;
    }, [currentSnapshot.favorites]);

    return {
      ...currentSnapshot,
      sourceMap,
      reload: () => loadFavorites(true),
    };
  };

  const useFavoriteSource = (
    scraperId: string | null | undefined,
    sourceUrl: string | null | undefined,
  ) => {
    const { loaded, loading, error, sourceMap, reload } = useFavorites();
    const sourceKey = getSourceKey(scraperId, sourceUrl);
    const favorite = sourceKey ? sourceMap.get(sourceKey) ?? null : null;

    return {
      loaded,
      loading,
      error,
      favorite,
      isFavorite: Boolean(favorite),
      reload,
    };
  };

  return {
    getSourceKey,
    subscribe,
    getSnapshot,
    loadFavorites,
    saveFavorite,
    removeFavorite: removeFavoriteByRequest,
    removeFavoriteSource,
    useFavorites,
    useFavoriteSource,
  };
}
