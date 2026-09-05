import {
  normalizeScraperLatestCheckpointQuery,
  type ResetScraperLatestCheckpointTarget,
  type ScraperLatestCheckpointRecord,
  type ScraperRecord,
  type ScraperTagFavoriteRecord,
} from "@/shared/scraper";

export type ScraperLatestCheckpointSection = {
  key: string;
  name: string;
  detail: string;
  scraperUpdatedAt?: string;
  target: ResetScraperLatestCheckpointTarget;
  checkpoints: ScraperLatestCheckpointRecord[];
};

export type ScraperLatestCheckpointEntry = {
  key: string;
  name: string;
  detail: string;
  target: ResetScraperLatestCheckpointTarget;
  sections: ScraperLatestCheckpointSection[];
};

const sortCheckpoints = (
  checkpoints: ScraperLatestCheckpointRecord[],
): ScraperLatestCheckpointRecord[] => (
  [...checkpoints].sort((left, right) => {
    const languageCompare = left.includedLanguageCodes.join("|").localeCompare(
      right.includedLanguageCodes.join("|"),
    );
    return languageCompare !== 0
      ? languageCompare
      : right.updatedAt.localeCompare(left.updatedAt);
  })
);

const getModuleLabel = (module: ScraperLatestCheckpointRecord["module"]): string => {
  if (module === "search") return "Recherche";
  if (module === "tag") return "Tag";
  return "Page d'accueil";
};

export const getScraperLatestCheckpointCount = (
  entry: ScraperLatestCheckpointEntry,
): number => entry.sections.reduce((count, section) => count + section.checkpoints.length, 0);

export const buildScraperCheckpointEntries = (
  scrapers: ScraperRecord[],
  checkpoints: ScraperLatestCheckpointRecord[],
): ScraperLatestCheckpointEntry[] => scrapers
  .map((scraper) => {
    const scraperCheckpoints = checkpoints.filter((checkpoint) => (
      checkpoint.scraperId === scraper.id && checkpoint.module !== "tag"
    ));
    const configuredModule = scraper.globalConfig.latest?.module === "search" ? "search" : "homepage";
    const configuredQuery = configuredModule === "search"
      ? normalizeScraperLatestCheckpointQuery(scraper.globalConfig.homeSearch?.query)
      : "";
    const sectionKeys = new Set([
      `${configuredModule}\u0000${configuredQuery}`,
      ...scraperCheckpoints.map((checkpoint) => `${checkpoint.module}\u0000${checkpoint.query}`),
    ]);
    const sections = Array.from(sectionKeys).map((sectionKey) => {
      const [module, query = ""] = sectionKey.split("\u0000");
      const sectionCheckpoints = scraperCheckpoints.filter((checkpoint) => (
        checkpoint.module === module && checkpoint.query === query
      ));
      const isConfigured = module === configuredModule && query === configuredQuery;
      return {
        key: `${scraper.id}:${sectionKey}`,
        name: `${getModuleLabel(module as ScraperLatestCheckpointRecord["module"])}${isConfigured ? " · actif" : ""}`,
        detail: query || "Sans requête",
        scraperUpdatedAt: scraper.updatedAt,
        target: {
          kind: "source" as const,
          scraperId: scraper.id,
          module: module as ScraperLatestCheckpointRecord["module"],
          query,
        },
        checkpoints: sortCheckpoints(sectionCheckpoints),
      };
    });

    return {
      key: `scraper:${scraper.id}`,
      name: scraper.name,
      detail: scraper.baseUrl,
      target: { kind: "scraper" as const, scraperId: scraper.id },
      sections,
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

export const buildTagCheckpointEntries = (
  favorites: ScraperTagFavoriteRecord[],
  scrapers: ScraperRecord[],
  checkpoints: ScraperLatestCheckpointRecord[],
): ScraperLatestCheckpointEntry[] => {
  const scrapersById = new Map(scrapers.map((scraper) => [scraper.id, scraper]));

  return favorites
    .map((favorite) => {
      const sources = favorite.sources.map((source) => ({
        scraperId: source.scraperId,
        query: normalizeScraperLatestCheckpointQuery(source.tagUrl),
      }));
      const sections = favorite.sources.map((source, sourceIndex) => {
        const query = normalizeScraperLatestCheckpointQuery(source.tagUrl);
        return {
          key: `${favorite.id}:${source.scraperId}:${query}:${sourceIndex}`,
          name: [
            source.name,
            scrapersById.get(source.scraperId)?.name ?? source.scraperId,
          ].filter(Boolean).join(" · "),
          detail: source.tagUrl,
          scraperUpdatedAt: scrapersById.get(source.scraperId)?.updatedAt,
          target: {
            kind: "source" as const,
            scraperId: source.scraperId,
            module: "tag" as const,
            query,
          },
          checkpoints: sortCheckpoints(checkpoints.filter((checkpoint) => (
            checkpoint.module === "tag"
            && checkpoint.scraperId === source.scraperId
            && checkpoint.query === query
          ))),
        };
      });

      return {
        key: `tag:${favorite.id}`,
        name: favorite.name,
        detail: `${favorite.sources.length} source(s)`,
        target: { kind: "tag" as const, sources },
        sections,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};
