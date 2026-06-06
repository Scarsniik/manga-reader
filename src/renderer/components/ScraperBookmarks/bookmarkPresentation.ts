import type { ScraperBookmarkRecord, ScraperRecord } from "@/shared/scraper";
import { buildRemoteThumbnailUrl } from "@/renderer/utils/remoteThumbnails";

export const getScraperBookmarkStableKey = (bookmark: ScraperBookmarkRecord): string => (
  `${bookmark.scraperId}::${bookmark.sourceUrl}`
);

export const getScraperBookmarkCoverUrl = (
  bookmark: ScraperBookmarkRecord,
  scraper: ScraperRecord | null,
): string => {
  const cover = String(bookmark.cover ?? "").trim();
  if (!cover) {
    return "";
  }

  return buildRemoteThumbnailUrl(cover, bookmark.sourceUrl || scraper?.baseUrl) ?? "";
};
