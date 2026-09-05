import type { MatchableManga, MangaMatchKind } from "@/renderer/utils/mangaMatching/titleProfiles";

export type ScraperPotentialReadingStatus = "inProgress" | "read";

export type ScraperPotentialSeriesReadingWarning = {
  sequenceLabel: string;
  seriesTitle: string;
};

export type ScraperPotentialSeriesProgress = {
  currentSequenceLabel: string;
  previousSequenceLabel: string;
  readingStatus: ScraperPotentialReadingStatus;
  seriesTitle: string;
};

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

export type ScraperPotentialMangaMatch = MatchableManga & {
  id: string;
  category: "reading" | "bookmark" | "readingList";
  title: string;
  cover?: string;
  scraperId?: string;
  chapterLabel?: string;
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
  readingListMatches: ScraperPotentialMangaMatch[];
  seriesProgress: ScraperPotentialSeriesProgress | null;
  seriesReadingWarning: ScraperPotentialSeriesReadingWarning | null;
  loading: boolean;
};
