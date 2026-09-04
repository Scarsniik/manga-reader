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
