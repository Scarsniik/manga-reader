import { normalizeScraperViewHistorySourceUrl } from "@/shared/scraper";
import {
  getMangaMergeMatchKind,
  type MatchableManga,
  type MangaMergeOptions,
} from "@/renderer/utils/mangaMatching/titleProfiles";
import type {
  ScraperPotentialMangaMatch,
  ScraperPotentialReadingStatus,
} from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes";

const compareDatesDescending = (
  left: string | undefined,
  right: string | undefined,
): number => (
  Date.parse(right || "") - Date.parse(left || "")
);

const getReadingStatusRank = (status: ScraperPotentialReadingStatus | undefined): number => {
  if (status === "read") {
    return 2;
  }

  if (status === "inProgress") {
    return 1;
  }

  return 0;
};

const getTargetKey = (match: ScraperPotentialMangaMatch): string => {
  if (match.target.kind === "library") {
    return `library:${match.target.title.toLowerCase()}`;
  }

  return `scraper:${match.target.scraperId}:${normalizeScraperViewHistorySourceUrl(match.target.sourceUrl)}`;
};

const dedupeMatches = (
  matches: ScraperPotentialMangaMatch[],
): ScraperPotentialMangaMatch[] => {
  const matchesByKey = new Map<string, ScraperPotentialMangaMatch>();

  matches.forEach((match) => {
    const key = `${match.category}:${getTargetKey(match)}`;
    const current = matchesByKey.get(key);
    if (!current) {
      matchesByKey.set(key, match);
      return;
    }

    const statusCompare = getReadingStatusRank(match.readingStatus) - getReadingStatusRank(current.readingStatus);
    if (statusCompare > 0 || (statusCompare === 0 && compareDatesDescending(match.updatedAt, current.updatedAt) < 0)) {
      matchesByKey.set(key, match);
    }
  });

  return Array.from(matchesByKey.values());
};

const sortMatches = (matches: ScraperPotentialMangaMatch[]): ScraperPotentialMangaMatch[] => (
  [...matches].sort((left, right) => {
    const statusCompare = getReadingStatusRank(right.readingStatus) - getReadingStatusRank(left.readingStatus);
    if (statusCompare !== 0) {
      return statusCompare;
    }

    const dateCompare = compareDatesDescending(left.updatedAt, right.updatedAt);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return left.title.localeCompare(right.title);
  })
);

export const matchPotentialMangaCandidates = (
  current: MatchableManga,
  candidates: ScraperPotentialMangaMatch[],
  options: MangaMergeOptions,
): ScraperPotentialMangaMatch[] => (
  sortMatches(dedupeMatches(
    candidates
      .map((candidate) => ({
        ...candidate,
        matchKind: getMangaMergeMatchKind(current, candidate, options) ?? undefined,
      }))
      .filter((candidate) => Boolean(candidate.matchKind)),
  ))
);
