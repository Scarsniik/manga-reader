import { useCallback, useState } from "react";
import type {
  SaveScraperBookmarkRequest,
  ScraperBookmarkRecord,
  ScraperRecord,
} from "@/shared/scraper";
import {
  buildScraperBookmarkRequestFromRecord,
  enrichScraperBookmarkRequestFromDetails,
  shouldSyncBookmarkMetadata,
} from "@/renderer/utils/scraperBookmarkMetadata";

type UseScraperBookmarkRefreshOptions = {
  loadBookmarks: () => Promise<ScraperBookmarkRecord[]>;
  scrapersById: Map<string, ScraperRecord>;
  onAfterRefresh?: () => Promise<unknown> | unknown;
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

const getApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

const saveScraperBookmarkRequest = async (
  request: SaveScraperBookmarkRequest,
): Promise<ScraperBookmarkRecord> => {
  const api = getApi();
  if (!api || typeof api.saveScraperBookmark !== "function") {
    throw new Error("Les bookmarks scraper ne sont pas disponibles dans cette version.");
  }

  const saved = await api.saveScraperBookmark(request);
  if (!saved) {
    throw new Error("Le bookmark scraper n'a pas pu etre enregistre.");
  }

  return saved as ScraperBookmarkRecord;
};

export default function useScraperBookmarkRefresh({
  loadBookmarks,
  scrapersById,
  onAfterRefresh,
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

    setRefreshingBookmarks(true);
    setRefreshMessage(null);
    setRefreshError(null);
    onBeforeRefresh?.();

    try {
      const bookmarksToRefresh = await loadBookmarks();
      if (!bookmarksToRefresh.length) {
        return;
      }

      setRefreshProgress({
        ...INITIAL_PROGRESS,
        total: bookmarksToRefresh.length,
      });

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
            await saveScraperBookmarkRequest(enrichedRequest);
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

      await onAfterRefresh?.();

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
    loadBookmarks,
    onAfterRefresh,
    onBeforeRefresh,
    refreshingBookmarks,
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
