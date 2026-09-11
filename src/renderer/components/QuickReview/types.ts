import type { ScraperRecord, ScraperSearchResultItem } from "@/shared/scraper";

export type QuickReviewSource = {
  scraper: ScraperRecord;
  result: ScraperSearchResultItem;
};

export type QuickReviewItem = {
  id: string;
  primarySource: QuickReviewSource;
  availableSources: QuickReviewSource[];
  displayTitle?: string;
  displayCoverUrl?: string;
  displaySummary?: string;
  displayPageCount?: string;
  displayLanguageCodes?: string[];
};

export type QuickReviewSeriesLanguageAvailability = {
  languageCode: string;
  chapterCount: number;
};

export type QuickReviewSeriesChapter = {
  itemId: string;
  label: string;
};

export type QuickReviewSeriesGroup = {
  id: string;
  title: string;
  chapterCount: number;
  sourceCount: number;
  chapters: QuickReviewSeriesChapter[];
  languageAvailability: QuickReviewSeriesLanguageAvailability[];
};

export type QuickReviewSeriesSession = {
  contextLabel?: string;
  groups: QuickReviewSeriesGroup[];
};

export type QuickReviewOpenSeries = (seriesId: string) => Promise<boolean>;
