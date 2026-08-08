import type {
  ListingBackgroundInput,
  ListingBackgroundSource,
} from "@/shared/backgroundSearch";
import type {
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
  ScraperRecord,
} from "@/shared/scraper";

export type AuthorListingSearchKind = "scraperAuthor" | "latestAuthors" | "authorFavoriteRefresh";

export type AuthorListingSearchSettings = {
  maxPages: number | null;
  concurrency: number;
  includedLanguageCodes: string[];
  scrapeDetailsWithCards: boolean;
  useAuthorFavoriteCache?: boolean;
  authorFavoriteCacheMaxAgeHours?: number;
  selectedFavoriteIds?: string[];
  searchMode?: "quick" | "continuous" | "deep";
  quickConsecutiveSeenStopThreshold?: number;
};

export type ScraperAuthorListingSearchSettings = Omit<
  AuthorListingSearchSettings,
  "includedLanguageCodes" | "useAuthorFavoriteCache" | "authorFavoriteCacheMaxAgeHours"
> & {
  templateContext?: Record<string, string | undefined> | null;
};

const buildAuthorSourceIdentity = (source: ScraperAuthorFavoriteSource): string => (
  `${source.scraperId}::${source.authorUrl}`
);

export const buildAuthorListingSources = (
  favorites: ScraperAuthorFavoriteRecord[],
  scrapersById: Map<string, ScraperRecord>,
  kind: Extract<AuthorListingSearchKind, "latestAuthors" | "authorFavoriteRefresh">,
): ListingBackgroundSource[] => {
  const contextualAuthorNames = Array.from(new Set(favorites.flatMap((favorite) => [
    favorite.name,
    ...favorite.sources.map((source) => source.name),
  ]).map((name) => name.trim()).filter(Boolean)));
  const seenSourceIds = new Set<string>();

  return favorites.flatMap((favorite) => favorite.sources.flatMap((source) => {
    const scraper = scrapersById.get(source.scraperId);
    const sourceIdentity = buildAuthorSourceIdentity(source);
    if (!scraper || seenSourceIds.has(sourceIdentity)) return [];
    seenSourceIds.add(sourceIdentity);

    return [{
      id: kind === "latestAuthors"
        ? `${favorite.id}::${sourceIdentity}`
        : sourceIdentity,
      name: kind === "latestAuthors"
        ? `${favorite.name} · ${source.name}`
        : source.name,
      scraper,
      query: source.authorUrl,
      favoriteId: favorite.id,
      favoriteUpdatedAt: favorite.updatedAt,
      favoriteSourceName: source.name,
      mode: "author" as const,
      templateContext: source.templateContext ?? null,
      contextualAuthorNames,
    }];
  }));
};

export const buildAuthorListingSearchInput = (
  favorites: ScraperAuthorFavoriteRecord[],
  scrapersById: Map<string, ScraperRecord>,
  kind: Extract<AuthorListingSearchKind, "latestAuthors" | "authorFavoriteRefresh">,
  settings: AuthorListingSearchSettings,
): ListingBackgroundInput => ({
  favoriteId: favorites.length === 1 ? favorites[0].id : undefined,
  favoriteUpdatedAt: favorites.length === 1 ? favorites[0].updatedAt : undefined,
  sources: buildAuthorListingSources(favorites, scrapersById, kind),
  maxPages: settings.maxPages,
  resultLimit: 0,
  paceMode: "careful",
  concurrency: Math.max(1, Math.floor(settings.concurrency)),
  includedLanguageCodes: settings.includedLanguageCodes,
  scrapeDetailsWithCards: settings.scrapeDetailsWithCards,
  useAuthorFavoriteCache: settings.useAuthorFavoriteCache,
  authorFavoriteCacheMaxAgeHours: settings.authorFavoriteCacheMaxAgeHours,
  selectedFavoriteIds: settings.selectedFavoriteIds,
  searchMode: settings.searchMode,
  quickConsecutiveSeenStopThreshold: settings.quickConsecutiveSeenStopThreshold,
});

export const buildScraperAuthorListingSearchInput = (
  scraper: ScraperRecord,
  query: string,
  settings: ScraperAuthorListingSearchSettings,
): ListingBackgroundInput => ({
  sources: [{
    id: `${scraper.id}::${query}`,
    name: query,
    scraper,
    query,
    mode: "author",
    templateContext: settings.templateContext ?? null,
    contextualAuthorNames: [query],
  }],
  maxPages: settings.maxPages,
  resultLimit: 0,
  paceMode: "careful",
  concurrency: Math.max(1, Math.floor(settings.concurrency)),
  includedLanguageCodes: [],
  scrapeDetailsWithCards: settings.scrapeDetailsWithCards,
});
