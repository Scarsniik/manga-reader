import type {
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
} from "@/shared/scraper";
import { normalizeScraperAuthorFavoriteUrl } from "@/renderer/stores/scraperAuthorFavorites";

export type ScraperFavoriteAuthorMatch = {
  favorite: ScraperAuthorFavoriteRecord;
  source: ScraperAuthorFavoriteSource;
  name: string;
};
const normalizeAuthorName = (value: unknown): string => (
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim()
);

export const getFavoriteScraperAuthors = (
  favorites: readonly ScraperAuthorFavoriteRecord[],
  scraperId: string,
  authorNames: readonly string[] | null | undefined,
  authorUrls: readonly string[] | null | undefined,
): ScraperFavoriteAuthorMatch[] => {
  const normalizedNames = (authorNames ?? []).map(normalizeAuthorName);
  const normalizedUrls = new Set(
    (authorUrls ?? []).map(normalizeScraperAuthorFavoriteUrl).filter(Boolean),
  );
  const seenFavorites = new Set<string>();

  return favorites.reduce<ScraperFavoriteAuthorMatch[]>((matches, favorite) => {
    const source = favorite.sources.find((candidate) => {
      if (candidate.scraperId !== scraperId) {
        return false;
      }

      const normalizedUrl = normalizeScraperAuthorFavoriteUrl(candidate.authorUrl);
      if (normalizedUrl && normalizedUrls.has(normalizedUrl)) {
        return true;
      }

      const sourceName = normalizeAuthorName(candidate.name);
      const favoriteName = normalizeAuthorName(favorite.name);
      return normalizedNames.some((name) => name === sourceName || name === favoriteName);
    });

    if (!source || seenFavorites.has(favorite.id)) {
      return matches;
    }

    seenFavorites.add(favorite.id);
    const sourceName = normalizeAuthorName(source.name);
    const favoriteName = normalizeAuthorName(favorite.name);
    const matchingNameIndex = normalizedNames.findIndex((name) => (
      name === sourceName || name === favoriteName
    ));
    matches.push({
      favorite,
      source,
      name: matchingNameIndex >= 0
        ? String(authorNames?.[matchingNameIndex] ?? source.name).trim()
        : source.name || favorite.name,
    });
    return matches;
  }, []);
};
