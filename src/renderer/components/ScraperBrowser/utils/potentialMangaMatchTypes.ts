import type { MatchableManga, MangaMatchKind } from "@/renderer/utils/mangaMatching/titleProfiles";

export type ScraperPotentialMatchTarget =
  | {
    kind: "library";
    title: string;
  }
  | {
    kind: "scraperDetails";
    scraperId: string;
    sourceUrl: string;
    title: string;
  };

export type ScraperPotentialReadingStatus = "inProgress" | "read";

export type ScraperPotentialMangaMatch = MatchableManga & {
  id: string;
  category: "reading" | "bookmark";
  title: string;
  sourceLabel: string;
  detailLabel: string;
  updatedAt?: string;
  readingStatus?: ScraperPotentialReadingStatus;
  target: ScraperPotentialMatchTarget;
  matchKind?: MangaMatchKind;
};

export type ScraperPotentialMangaMatchState = {
  readingMatches: ScraperPotentialMangaMatch[];
  bookmarkMatches: ScraperPotentialMangaMatch[];
  loading: boolean;
};
