import React from "react";
import {
  buildQuickReviewSourceUrls,
  getQuickReviewSourceUrl,
} from "@/renderer/components/QuickReview/quickReviewImages";
import type { QuickReviewItem } from "@/renderer/components/QuickReview/types";
import {
  getScraperBookmarkKey,
  saveScraperBookmark,
  useScraperBookmarks,
} from "@/renderer/stores/scraperBookmarks";
import {
  enrichScraperBookmarkRequestFromDetails,
} from "@/renderer/utils/scraperBookmarkMetadata";
import type { ScraperRuntimeDetailsResult } from "@/renderer/utils/scraperRuntime";

type Options = {
  item: QuickReviewItem | null;
  details: ScraperRuntimeDetailsResult | null;
  title: string;
  authors: string[];
  authorUrls: string[];
  tags: string[];
  sourceNames: string[];
  sourceUrls: string[];
  pageCount?: string;
  languageCodes: string[];
  onError: (message: string | null) => void;
};

export default function useQuickReviewBookmark({
  item,
  details,
  title,
  authors,
  authorUrls,
  tags,
  sourceNames,
  sourceUrls,
  pageCount,
  languageCodes,
  onError,
}: Options) {
  const [bookmarking, setBookmarking] = React.useState(false);
  const [bookmarkedCount, setBookmarkedCount] = React.useState(0);
  const sourceUrl = getQuickReviewSourceUrl(item, details);
  const bookmarkSourceUrls = React.useMemo(
    () => buildQuickReviewSourceUrls(item, details),
    [details, item],
  );
  const bookmarkState = useScraperBookmarks({
    scraperId: item?.primarySource.scraper.id,
    enabled: Boolean(item && sourceUrl),
  });
  const isBookmarked = bookmarkSourceUrls.some((candidateUrl) => bookmarkState.bookmarkMap.has(
    getScraperBookmarkKey(item?.primarySource.scraper.id, candidateUrl),
  ));
  const verificationLoading = Boolean(item) && (!bookmarkState.loaded || bookmarkState.loading);

  const saveBookmark = React.useCallback(async (): Promise<boolean> => {
    const primaryResult = item?.primarySource.result;
    if (!item || !primaryResult || !sourceUrl || bookmarking) return false;

    setBookmarking(true);
    onError(null);
    try {
      const request = {
        scraperId: item.primarySource.scraper.id,
        sourceUrl,
        title,
        cover: item.displayCoverUrl || details?.cover || primaryResult.thumbnailUrl,
        summary: item.displaySummary || primaryResult.summary,
        description: details?.description,
        authors,
        authorUrls,
        tags,
        sourceNames,
        sourceUrls,
        mangaStatus: details?.mangaStatus,
        pageCount,
        languageCodes,
        excludedFields: item.primarySource.scraper.globalConfig.bookmark.excludedFields,
      };
      const enrichedRequest = details
        ? request
        : await enrichScraperBookmarkRequestFromDetails(request, item.primarySource.scraper);
      await saveScraperBookmark(enrichedRequest);
      setBookmarkedCount((count) => count + 1);
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "Impossible d'ajouter ce bookmark.");
      return false;
    } finally {
      setBookmarking(false);
    }
  }, [
    authorUrls,
    authors,
    bookmarking,
    details,
    item,
    languageCodes,
    onError,
    pageCount,
    sourceNames,
    sourceUrl,
    sourceUrls,
    tags,
    title,
  ]);

  return {
    bookmarkedCount,
    bookmarking,
    isBookmarked,
    saveBookmark,
    verificationLoading,
  };
}
