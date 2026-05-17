import { type IpcMainInvokeEvent } from "electron";
import {
  type RemoveScraperTagFavoriteRequest,
  type RemoveScraperTagFavoriteSourceRequest,
  type SaveScraperTagFavoriteRequest,
  type ScraperTagFavoriteRecord,
  type ScraperTagFavoriteSource,
} from "../../scraper";
import { scraperTagFavoritesFilePath } from "../../utils";
import {
  createScraperSourceFavoritesService,
  normalizeScraperSourceFavoriteUrl,
} from "./sourceFavorites";

export const normalizeScraperTagFavoriteUrl = normalizeScraperSourceFavoriteUrl;

const sanitizeTagFavoriteSource = (
  source: Partial<ScraperTagFavoriteSource> | null | undefined,
): ScraperTagFavoriteSource | null => {
  const scraperId = String(source?.scraperId ?? "").trim();
  const tagUrl = normalizeScraperTagFavoriteUrl(source?.tagUrl);
  const name = String(source?.name ?? "").trim() || tagUrl;
  const cover = String(source?.cover ?? "").trim();
  const now = new Date().toISOString();
  const createdAt = String(source?.createdAt ?? "").trim() || now;
  const updatedAt = String(source?.updatedAt ?? "").trim() || now;

  if (!scraperId || !tagUrl) {
    return null;
  }

  return {
    scraperId,
    tagUrl,
    name,
    cover: cover || undefined,
    createdAt,
    updatedAt,
  };
};

const tagFavoritesService = createScraperSourceFavoritesService<
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource
>({
  filePath: scraperTagFavoritesFilePath,
  sourceUrlField: "tagUrl",
  readErrorMessage: "Failed to read scraper tag favorites",
  incompleteSourceMessage: "La source tag est incomplete.",
  incompleteFavoriteMessage: "Le favori tag est incomplet.",
  sanitizeSource: sanitizeTagFavoriteSource,
});

export async function getScraperTagFavorites(
  _event?: IpcMainInvokeEvent,
): Promise<ScraperTagFavoriteRecord[]> {
  return tagFavoritesService.getFavorites();
}

export async function saveScraperTagFavorite(
  _event: IpcMainInvokeEvent,
  request: SaveScraperTagFavoriteRequest,
): Promise<ScraperTagFavoriteRecord> {
  return tagFavoritesService.saveFavorite(request);
}

export async function removeScraperTagFavorite(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperTagFavoriteRequest,
): Promise<boolean> {
  return tagFavoritesService.removeFavorite(request);
}

export async function removeScraperTagFavoriteSource(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperTagFavoriteSourceRequest,
): Promise<ScraperTagFavoriteRecord | null> {
  return tagFavoritesService.removeFavoriteSource(request);
}
