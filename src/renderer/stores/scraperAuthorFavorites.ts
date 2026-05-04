import { useEffect, useMemo, useSyncExternalStore } from "react";
import type {
  RemoveScraperAuthorFavoriteRequest,
  RemoveScraperAuthorFavoriteSourceRequest,
  SaveScraperAuthorFavoriteRequest,
  ScraperAuthorFavoriteRecord,
} from "@/shared/scraper";

type AuthorFavoritesSnapshot = {
  favorites: ScraperAuthorFavoriteRecord[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

const INITIAL_SNAPSHOT: AuthorFavoritesSnapshot = {
  favorites: [],
  loaded: false,
  loading: false,
  error: null,
};

let snapshot = INITIAL_SNAPSHOT;
let inFlightLoad: Promise<ScraperAuthorFavoriteRecord[]> | null = null;
let hasBoundExternalUpdates = false;
const listeners = new Set<() => void>();

const getApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

const setSnapshot = (
  updater: AuthorFavoritesSnapshot | ((previous: AuthorFavoritesSnapshot) => AuthorFavoritesSnapshot),
) => {
  snapshot = typeof updater === "function"
    ? (updater as (previous: AuthorFavoritesSnapshot) => AuthorFavoritesSnapshot)(snapshot)
    : updater;
  emitChange();
};

const sortFavorites = (
  records: ScraperAuthorFavoriteRecord[],
): ScraperAuthorFavoriteRecord[] => (
  [...records].sort((left, right) => left.name.localeCompare(right.name))
);

export const normalizeScraperAuthorFavoriteUrl = (value: unknown): string => {
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

export const getScraperAuthorFavoriteSourceKey = (
  scraperId: string | null | undefined,
  authorUrl: string | null | undefined,
): string => {
  const normalizedScraperId = String(scraperId ?? "").trim();
  const normalizedAuthorUrl = normalizeScraperAuthorFavoriteUrl(authorUrl);

  return normalizedScraperId && normalizedAuthorUrl
    ? `${normalizedScraperId}::${normalizedAuthorUrl}`
    : "";
};

const upsertFavorite = (
  records: ScraperAuthorFavoriteRecord[],
  favorite: ScraperAuthorFavoriteRecord,
): ScraperAuthorFavoriteRecord[] => {
  const next = records.filter((record) => record.id !== favorite.id);
  next.push(favorite);
  return sortFavorites(next);
};

const removeSourceFromOtherFavorites = (
  records: ScraperAuthorFavoriteRecord[],
  request: SaveScraperAuthorFavoriteRequest,
  savedFavoriteId: string,
): ScraperAuthorFavoriteRecord[] => {
  const scraperId = String(request.source.scraperId ?? "").trim();
  const authorUrl = normalizeScraperAuthorFavoriteUrl(request.source.authorUrl);

  return records.reduce<ScraperAuthorFavoriteRecord[]>((nextRecords, record) => {
    if (record.id === savedFavoriteId) {
      nextRecords.push(record);
      return nextRecords;
    }

    const nextSources = record.sources.filter((source) => !(
      source.scraperId === scraperId && source.authorUrl === authorUrl
    ));

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
  records: ScraperAuthorFavoriteRecord[],
  favoriteId: string,
): ScraperAuthorFavoriteRecord[] => (
  records.filter((record) => record.id !== favoriteId)
);

const patchSourceRemoval = (
  records: ScraperAuthorFavoriteRecord[],
  request: RemoveScraperAuthorFavoriteSourceRequest,
  updatedFavorite: ScraperAuthorFavoriteRecord | null,
): ScraperAuthorFavoriteRecord[] => {
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
    void loadScraperAuthorFavorites(true);
  };

  window.addEventListener(
    "scraper-author-favorites-updated",
    handleExternalFavoritesUpdate as EventListener,
  );
  hasBoundExternalUpdates = true;
};

export const subscribeScraperAuthorFavorites = (listener: () => void): (() => void) => {
  listeners.add(listener);
  bindExternalUpdates();

  return () => {
    listeners.delete(listener);
  };
};

export const getScraperAuthorFavoritesSnapshot = (): AuthorFavoritesSnapshot => snapshot;

export const loadScraperAuthorFavorites = async (
  force = false,
): Promise<ScraperAuthorFavoriteRecord[]> => {
  bindExternalUpdates();

  const api = getApi();
  if (!api || typeof api.getScraperAuthorFavorites !== "function") {
    setSnapshot({
      favorites: [],
      loaded: true,
      loading: false,
      error: "Les favoris auteur ne sont pas disponibles dans cette version.",
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
      const data = await api.getScraperAuthorFavorites();
      const favorites = Array.isArray(data) ? sortFavorites(data) : [];
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
        : "Impossible de charger les favoris auteur.";
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

export const saveScraperAuthorFavorite = async (
  request: SaveScraperAuthorFavoriteRequest,
): Promise<ScraperAuthorFavoriteRecord> => {
  const api = getApi();
  if (!api || typeof api.saveScraperAuthorFavorite !== "function") {
    throw new Error("Les favoris auteur ne sont pas disponibles dans cette version.");
  }

  const saved = await api.saveScraperAuthorFavorite(request);
  if (!saved || typeof saved !== "object") {
    throw new Error("Le favori auteur n'a pas pu etre enregistre.");
  }

  setSnapshot((previous) => ({
    ...previous,
    favorites: upsertFavorite(
      removeSourceFromOtherFavorites(previous.favorites, request, (saved as ScraperAuthorFavoriteRecord).id),
      saved as ScraperAuthorFavoriteRecord,
    ),
    loaded: true,
    loading: false,
    error: null,
  }));

  return saved as ScraperAuthorFavoriteRecord;
};

export const removeScraperAuthorFavorite = async (
  request: RemoveScraperAuthorFavoriteRequest,
): Promise<boolean> => {
  const api = getApi();
  if (!api || typeof api.removeScraperAuthorFavorite !== "function") {
    throw new Error("Les favoris auteur ne sont pas disponibles dans cette version.");
  }

  const removed = await api.removeScraperAuthorFavorite(request);
  if (removed) {
    setSnapshot((previous) => ({
      ...previous,
      favorites: removeFavorite(previous.favorites, request.favoriteId),
    }));
  }

  return Boolean(removed);
};

export const removeScraperAuthorFavoriteSource = async (
  request: RemoveScraperAuthorFavoriteSourceRequest,
): Promise<ScraperAuthorFavoriteRecord | null> => {
  const api = getApi();
  if (!api || typeof api.removeScraperAuthorFavoriteSource !== "function") {
    throw new Error("Les favoris auteur ne sont pas disponibles dans cette version.");
  }

  const updatedFavorite = await api.removeScraperAuthorFavoriteSource(request);
  setSnapshot((previous) => ({
    ...previous,
    favorites: patchSourceRemoval(
      previous.favorites,
      request,
      updatedFavorite as ScraperAuthorFavoriteRecord | null,
    ),
  }));

  return updatedFavorite as ScraperAuthorFavoriteRecord | null;
};

export const useScraperAuthorFavorites = () => {
  const currentSnapshot = useSyncExternalStore(
    subscribeScraperAuthorFavorites,
    getScraperAuthorFavoritesSnapshot,
    getScraperAuthorFavoritesSnapshot,
  );

  useEffect(() => {
    void loadScraperAuthorFavorites(false);
  }, []);

  const sourceMap = useMemo(() => {
    const nextMap = new Map<string, ScraperAuthorFavoriteRecord>();
    currentSnapshot.favorites.forEach((favorite) => {
      favorite.sources.forEach((source) => {
        const key = getScraperAuthorFavoriteSourceKey(source.scraperId, source.authorUrl);
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
    reload: () => loadScraperAuthorFavorites(true),
  };
};

export const useScraperAuthorFavoriteSource = (
  scraperId: string | null | undefined,
  authorUrl: string | null | undefined,
) => {
  const { loaded, loading, error, sourceMap, reload } = useScraperAuthorFavorites();
  const sourceKey = getScraperAuthorFavoriteSourceKey(scraperId, authorUrl);
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
