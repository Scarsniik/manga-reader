import { useCallback, useState } from "react";
import type { ScraperBookmarkRecord, ScraperRecord } from "@/shared/scraper";
import { saveScraperBookmark } from "@/renderer/stores/scraperBookmarks";
import {
  buildScraperBookmarkRequestFromRecord,
  enrichScraperBookmarkRequestFromDetails,
  shouldSyncBookmarkMetadata,
} from "@/renderer/utils/scraperBookmarkMetadata";

type UseScraperBookmarkRefreshOptions = {
  allBookmarks: ScraperBookmarkRecord[];
  scrapersById: Map<string, ScraperRecord>;
  reload: () => Promise<ScraperBookmarkRecord[]>;
  reloadAllBookmarks: () => Promise<ScraperBookmarkRecord[]>;
  onBeforeRefresh?: () => void;
};

export type ScraperBookmarkRefreshProgress = {
  current: number;
  total: number;
  updated: number;
  failed: number;
};

const INITIAL_PROGRESS: ScraperBookmarkRefreshProgress = {
  current: 0,
  total: 0,
  updated: 0,
  failed: 0,
};

export default function useScraperBookmarkRefresh({
  allBookmarks,
  scrapersById,
  reload,
  reloadAllBookmarks,
  onBeforeRefresh,
}: UseScraperBookmarkRefreshOptions) {
  const [refreshingBookmarks, setRefreshingBookmarks] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<ScraperBookmarkRefreshProgress>(INITIAL_PROGRESS);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refreshAllBookmarks = useCallback(async () => {
    if (refreshingBookmarks) {
      return;
    }

    const bookmarksToRefresh = allBookmarks;
    if (!bookmarksToRefresh.length) {
      return;
    }

    setRefreshingBookmarks(true);
    setRefreshMessage(null);
    setRefreshError(null);
    onBeforeRefresh?.();
    setRefreshProgress({
      ...INITIAL_PROGRESS,
      total: bookmarksToRefresh.length,
    });

    try {
      let updated = 0;
      let failed = 0;

      for (let index = 0; index < bookmarksToRefresh.length; index += 1) {
        const bookmark = bookmarksToRefresh[index];
        const scraper = scrapersById.get(bookmark.scraperId) ?? null;

        setRefreshProgress({
          current: index + 1,
          total: bookmarksToRefresh.length,
          updated,
          failed,
        });

        if (!scraper) {
          failed += 1;
          continue;
        }

        try {
          const request = buildScraperBookmarkRequestFromRecord(bookmark, scraper);
          const enrichedRequest = await enrichScraperBookmarkRequestFromDetails(request, scraper);

          if (shouldSyncBookmarkMetadata(bookmark, enrichedRequest)) {
            await saveScraperBookmark(enrichedRequest);
            updated += 1;
          }
        } catch (err) {
          failed += 1;
          console.warn("Failed to refresh scraper bookmark metadata", bookmark, err);
        }
      }

      setRefreshProgress({
        current: bookmarksToRefresh.length,
        total: bookmarksToRefresh.length,
        updated,
        failed,
      });

      await reloadAllBookmarks();
      await reload();

      if (failed > 0) {
        setRefreshError(`${failed} bookmark(s) n'ont pas pu etre rescannes.`);
      }

      setRefreshMessage(
        updated > 0
          ? `${updated} bookmark(s) ont ete mis a jour.`
          : "Les bookmarks ont ete rescannes, aucune nouvelle info trouvee.",
      );
    } finally {
      setRefreshingBookmarks(false);
    }
  }, [
    allBookmarks,
    onBeforeRefresh,
    refreshingBookmarks,
    reload,
    reloadAllBookmarks,
    scrapersById,
  ]);

  return {
    refreshAllBookmarks,
    refreshingBookmarks,
    refreshProgress,
    refreshMessage,
    refreshError,
  };
}
