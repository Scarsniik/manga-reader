import { type IpcMainInvokeEvent } from "electron";
import {
  type RemoveScraperAuthorFavoriteRequest,
  type RemoveScraperAuthorFavoriteSourceRequest,
  type SaveScraperAuthorFavoriteRequest,
  type ScraperAuthorFavoriteRecord,
  type ScraperAuthorFavoriteSource,
} from "../../scraper";
import { scraperAuthorFavoritesFilePath } from "../../utils";
import {
  createScraperSourceFavoritesService,
  normalizeScraperSourceFavoriteUrl,
} from "./sourceFavorites";

export const normalizeScraperAuthorFavoriteUrl = normalizeScraperSourceFavoriteUrl;

const sanitizeTemplateContext = (
  value: unknown,
): Record<string, string | undefined> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>).reduce<Record<string, string | undefined>>(
    (context, [key, entryValue]) => {
      const normalizedKey = key.trim();
      if (!normalizedKey) {
        return context;
      }

      context[normalizedKey] = entryValue == null ? undefined : String(entryValue);
      return context;
    },
    {},
  );

  return Object.keys(entries).length ? entries : undefined;
};

const sanitizeAuthorFavoriteSource = (
  source: Partial<ScraperAuthorFavoriteSource> | null | undefined,
): ScraperAuthorFavoriteSource | null => {
  const scraperId = String(source?.scraperId ?? "").trim();
  const authorUrl = normalizeScraperAuthorFavoriteUrl(source?.authorUrl);
  const name = String(source?.name ?? "").trim() || authorUrl;
  const cover = String(source?.cover ?? "").trim();
  const now = new Date().toISOString();
  const createdAt = String(source?.createdAt ?? "").trim() || now;
  const updatedAt = String(source?.updatedAt ?? "").trim() || now;

  if (!scraperId || !authorUrl) {
    return null;
  }

  return {
    scraperId,
    authorUrl,
    name,
    cover: cover || undefined,
    templateContext: sanitizeTemplateContext(source?.templateContext),
    createdAt,
    updatedAt,
  };
};

const authorFavoritesService = createScraperSourceFavoritesService<
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource
>({
  filePath: scraperAuthorFavoritesFilePath,
  sourceUrlField: "authorUrl",
  readErrorMessage: "Failed to read scraper author favorites",
  incompleteSourceMessage: "La source auteur est incomplete.",
  incompleteFavoriteMessage: "Le favori auteur est incomplet.",
  sanitizeSource: sanitizeAuthorFavoriteSource,
});

export async function getScraperAuthorFavorites(
  _event?: IpcMainInvokeEvent,
): Promise<ScraperAuthorFavoriteRecord[]> {
  return authorFavoritesService.getFavorites();
}

export async function saveScraperAuthorFavorite(
  _event: IpcMainInvokeEvent,
  request: SaveScraperAuthorFavoriteRequest,
): Promise<ScraperAuthorFavoriteRecord> {
  return authorFavoritesService.saveFavorite(request);
}

export async function removeScraperAuthorFavorite(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperAuthorFavoriteRequest,
): Promise<boolean> {
  return authorFavoritesService.removeFavorite(request);
}

export async function removeScraperAuthorFavoriteSource(
  _event: IpcMainInvokeEvent,
  request: RemoveScraperAuthorFavoriteSourceRequest,
): Promise<ScraperAuthorFavoriteRecord | null> {
  return authorFavoritesService.removeFavoriteSource(request);
}
