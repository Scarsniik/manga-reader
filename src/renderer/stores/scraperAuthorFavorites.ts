import type {
  RemoveScraperAuthorFavoriteRequest,
  RemoveScraperAuthorFavoriteSourceRequest,
  SaveScraperAuthorFavoriteRequest,
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
} from "@/shared/scraper";
import {
  createScraperSourceFavoritesStore,
  normalizeScraperSourceFavoriteUrl,
} from "@/renderer/stores/scraperSourceFavorites";

export const normalizeScraperAuthorFavoriteUrl = normalizeScraperSourceFavoriteUrl;

const authorFavoritesStore = createScraperSourceFavoritesStore<
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
  SaveScraperAuthorFavoriteRequest,
  RemoveScraperAuthorFavoriteRequest,
  RemoveScraperAuthorFavoriteSourceRequest
>({
  api: {
    get: "getScraperAuthorFavorites",
    save: "saveScraperAuthorFavorite",
    remove: "removeScraperAuthorFavorite",
    removeSource: "removeScraperAuthorFavoriteSource",
  },
  eventName: "scraper-author-favorites-updated",
  unavailableMessage: "Les favoris auteur ne sont pas disponibles dans cette version.",
  loadErrorMessage: "Impossible de charger les favoris auteur.",
  saveErrorMessage: "Le favori auteur n'a pas pu etre enregistre.",
  normalizeSourceUrl: normalizeScraperAuthorFavoriteUrl,
  getSourceIdentity: (source) => ({
    scraperId: source.scraperId,
    sourceUrl: source.authorUrl,
  }),
  getRequestSourceIdentity: (request) => ({
    scraperId: request.source.scraperId,
    sourceUrl: request.source.authorUrl,
  }),
});

export const getScraperAuthorFavoriteSourceKey = authorFavoritesStore.getSourceKey;
export const subscribeScraperAuthorFavorites = authorFavoritesStore.subscribe;
export const getScraperAuthorFavoritesSnapshot = authorFavoritesStore.getSnapshot;
export const loadScraperAuthorFavorites = authorFavoritesStore.loadFavorites;
export const saveScraperAuthorFavorite = authorFavoritesStore.saveFavorite;
export const removeScraperAuthorFavorite = authorFavoritesStore.removeFavorite;
export const removeScraperAuthorFavoriteSource = authorFavoritesStore.removeFavoriteSource;
export const useScraperAuthorFavorites = authorFavoritesStore.useFavorites;
export const useScraperAuthorFavoriteSource = authorFavoritesStore.useFavoriteSource;
