import type { ScraperPotentialMangaMatch } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";

export type PotentialMatchCategory = "reading" | "bookmark" | "readingList";

export type PotentialMatchEntry = {
  match: ScraperPotentialMangaMatch;
  categories: PotentialMatchCategory[];
};

const getMatchIdentity = (match: ScraperPotentialMangaMatch): string => (
  match.target.kind === "library"
    ? `library:${match.target.title.trim().toLowerCase()}`
    : `scraper:${match.target.scraperId}:${match.target.sourceUrl.trim().toLowerCase()}`
);

export const buildPotentialMatchEntries = (
  groups: Array<{
    category: PotentialMatchCategory;
    matches: ScraperPotentialMangaMatch[];
  }>,
): PotentialMatchEntry[] => {
  const entriesByIdentity = new Map<string, PotentialMatchEntry>();

  groups.forEach(({ category, matches }) => {
    matches.forEach((match) => {
      const identity = getMatchIdentity(match);
      const current = entriesByIdentity.get(identity);
      if (!current) {
        entriesByIdentity.set(identity, { match, categories: [category] });
        return;
      }

      if (!current.categories.includes(category)) {
        current.categories.push(category);
      }
      if (!current.match.cover && match.cover) {
        current.match = {
          ...current.match,
          cover: match.cover,
        };
      }
    });
  });

  return Array.from(entriesByIdentity.values());
};
