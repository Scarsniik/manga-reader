import type {
  RemoveScraperTagFavoriteRequest,
  RemoveScraperTagFavoriteSourceRequest,
  SaveScraperTagFavoriteRequest,
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
} from "@/shared/scraper";
import {
  createScraperSourceFavoritesStore,
  normalizeScraperSourceFavoriteUrl,
} from "@/renderer/stores/scraperSourceFavorites";

export const normalizeScraperTagFavoriteUrl = normalizeScraperSourceFavoriteUrl;

const tagFavoritesStore = createScraperSourceFavoritesStore<
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
  SaveScraperTagFavoriteRequest,
  RemoveScraperTagFavoriteRequest,
  RemoveScraperTagFavoriteSourceRequest
>({
  api: {
    get: "getScraperTagFavorites",
    save: "saveScraperTagFavorite",
    remove: "removeScraperTagFavorite",
    removeSource: "removeScraperTagFavoriteSource",
  },
  eventName: "scraper-tag-favorites-updated",
  unavailableMessage: "Les favoris tag ne sont pas disponibles dans cette version.",
  loadErrorMessage: "Impossible de charger les favoris tag.",
  saveErrorMessage: "Le favori tag n'a pas pu etre enregistre.",
  normalizeSourceUrl: normalizeScraperTagFavoriteUrl,
  getSourceIdentity: (source) => ({
    scraperId: source.scraperId,
    sourceUrl: source.tagUrl,
  }),
  getRequestSourceIdentity: (request) => ({
    scraperId: request.source.scraperId,
    sourceUrl: request.source.tagUrl,
  }),
});

export const getScraperTagFavoriteSourceKey = tagFavoritesStore.getSourceKey;
export const subscribeScraperTagFavorites = tagFavoritesStore.subscribe;
export const getScraperTagFavoritesSnapshot = tagFavoritesStore.getSnapshot;
export const loadScraperTagFavorites = tagFavoritesStore.loadFavorites;
export const saveScraperTagFavorite = tagFavoritesStore.saveFavorite;
export const removeScraperTagFavorite = tagFavoritesStore.removeFavorite;
export const removeScraperTagFavoriteSource = tagFavoritesStore.removeFavoriteSource;
export const useScraperTagFavorites = tagFavoritesStore.useFavorites;
export const useScraperTagFavoriteSource = tagFavoritesStore.useFavoriteSource;
