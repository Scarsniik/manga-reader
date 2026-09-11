import { useEffect, useRef, useState } from "react";
import type { ScraperBookmarkRecord, ScraperRecord } from "@/shared/scraper";
import {
  createScraperCardDetailsCache,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  resolveScraperCardDetails,
  resolveScraperDetailsChapterCount,
  type ScraperCardDetailsCache,
} from "@/renderer/utils/scraperRuntime";
import { getScraperBookmarkStableKey } from "@/renderer/components/ScraperBookmarks/bookmarkPresentation";

export type ScraperBookmarkDuplicateStats = {
  chapterCount: number | null;
  error: boolean;
  pageCount: string | null;
};

export type ScraperBookmarkDuplicateStatsTarget = {
  bookmark: ScraperBookmarkRecord;
  scraper: ScraperRecord | null;
};

const loadBookmarkDuplicateStats = async (
  { bookmark, scraper }: ScraperBookmarkDuplicateStatsTarget,
  detailsCache: ScraperCardDetailsCache,
): Promise<ScraperBookmarkDuplicateStats> => {
  const storedPageCount = String(bookmark.pageCount ?? "").trim() || null;
  const fetchDocument = typeof window.api?.fetchScraperDocument === "function"
    ? window.api.fetchScraperDocument
    : undefined;
  if (!scraper || !fetchDocument) {
    return {
      chapterCount: null,
      error: true,
      pageCount: storedPageCount,
    };
  }

  try {
    const detailsConfig = getScraperDetailsFeatureConfig(getScraperFeature(scraper, "details"));
    const details = await resolveScraperCardDetails({
      scraper,
      detailsConfig,
      detailUrl: bookmark.sourceUrl,
      fetchDocument,
      detailsCache,
    });
    if (!details) {
      return {
        chapterCount: null,
        error: true,
        pageCount: storedPageCount,
      };
    }

    let chapterCount: number | null = null;
    let chapterError = false;
    try {
      chapterCount = await resolveScraperDetailsChapterCount({
        scraper,
        details,
        fetchDocument,
      });
    } catch (error) {
      chapterError = true;
      console.warn("Duplicate bookmark chapter count extraction failed", error);
    }

    return {
      chapterCount,
      error: chapterError,
      pageCount: String(details.pageCount ?? "").trim() || storedPageCount,
    };
  } catch (error) {
    console.warn("Duplicate bookmark details extraction failed", error);
    return {
      chapterCount: null,
      error: true,
      pageCount: storedPageCount,
    };
  }
};

export default function useScraperBookmarkDuplicateStats(
  targets: ScraperBookmarkDuplicateStatsTarget[],
): ReadonlyMap<string, ScraperBookmarkDuplicateStats> {
  const [statsByBookmarkKey, setStatsByBookmarkKey] = useState<Map<
    string,
    ScraperBookmarkDuplicateStats
  >>(new Map());
  const detailsCacheRef = useRef(createScraperCardDetailsCache());
  const requestsRef = useRef(new Map<string, Promise<ScraperBookmarkDuplicateStats>>());

  useEffect(() => {
    let active = true;

    targets.forEach((target) => {
      const bookmarkKey = getScraperBookmarkStableKey(target.bookmark);
      let request = requestsRef.current.get(bookmarkKey);
      if (!request) {
        request = loadBookmarkDuplicateStats(target, detailsCacheRef.current);
        requestsRef.current.set(bookmarkKey, request);
      }

      void request.then((stats) => {
        if (!active) {
          return;
        }

        setStatsByBookmarkKey((currentStats) => {
          const nextStats = new Map(currentStats);
          nextStats.set(bookmarkKey, stats);
          return nextStats;
        });
      });
    });

    return () => {
      active = false;
    };
  }, [targets]);

  return statsByBookmarkKey;
}
