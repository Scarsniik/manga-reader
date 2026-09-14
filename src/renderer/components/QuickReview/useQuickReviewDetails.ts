import React from "react";
import type { QuickReviewItem } from "@/renderer/components/QuickReview/types";
import { buildQuickReviewCoverUrls } from "@/renderer/components/QuickReview/quickReviewImages";
import useParams from "@/renderer/hooks/useParams";
import {
  createScraperCardDetailsCache,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  resolveScraperCardDetails,
  resolveScraperDetailsChapterCount,
  getScraperRuntimeThumbnailUrl,
  type ScraperRuntimeDetailsResult,
} from "@/renderer/utils/scraperRuntime";
import {
  autoLoadInitialScraperDetailsThumbnails,
  canLoadMoreScraperDetailsThumbnails,
  getLoadMoreScraperDetailsThumbnailsLabel,
  loadMoreScraperDetailsThumbnails,
} from "@/renderer/utils/scraperDetailsThumbnails";
import { normalizeQuickReviewPrefetchCount } from "@/shared/quickReviewSettings";

export type QuickReviewDetailsLoadState = {
  details: ScraperRuntimeDetailsResult | null;
  chapterCount: number | null;
  error: string | null;
};

type QuickReviewDetailsState = {
  detailsState: QuickReviewDetailsLoadState | null;
  details: ScraperRuntimeDetailsResult | null;
  chapterCount: number | null;
  detailsLoading: boolean;
  detailsByItemId: ReadonlyMap<string, ScraperRuntimeDetailsResult | null>;
  loadingMoreThumbnails: boolean;
  canLoadMoreThumbnails: boolean;
  loadMoreThumbnailsLabel: string;
  loadMoreThumbnails: () => Promise<void>;
};

type RetainedImagePreload = {
  image: HTMLImageElement;
  promise: Promise<boolean>;
};

type RetainedImagePreloads = Map<string, RetainedImagePreload>;

const QUICK_REVIEW_BACKGROUND_THUMBNAIL_LIMIT = 6;
const QUICK_REVIEW_FOREGROUND_THUMBNAIL_LIMIT = 12;
const QUICK_REVIEW_IMAGE_PRELOAD_CONCURRENCY = 2;

const scheduleQuickReviewIdleTask = (task: () => void): (() => void) => {
  const idleWindow = window as typeof window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(task, { timeout: 1_000 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const timeoutId = window.setTimeout(task, 250);
  return () => window.clearTimeout(timeoutId);
};

export default function useQuickReviewDetails(
  items: QuickReviewItem[],
  currentIndex: number,
  currentItem: QuickReviewItem | null,
  preloadCover: boolean,
  preloadThumbnails: boolean,
): QuickReviewDetailsState {
  const { params } = useParams();
  const prefetchCount = normalizeQuickReviewPrefetchCount(params?.quickReviewPrefetchCount);
  const [revision, setRevision] = React.useState(0);
  const [loadingItemId, setLoadingItemId] = React.useState<string | null>(null);
  const [loadingMoreItemId, setLoadingMoreItemId] = React.useState<string | null>(null);
  const detailsCacheRef = React.useRef(createScraperCardDetailsCache());
  const detailsStatesRef = React.useRef(new Map<string, QuickReviewDetailsLoadState>());
  const detailsPromisesRef = React.useRef(new Map<string, Promise<QuickReviewDetailsLoadState>>());
  const retainedCoverPreloadsRef = React.useRef<RetainedImagePreloads>(new Map());
  const retainedThumbnailPreloadsRef = React.useRef(new Map<string, RetainedImagePreloads>());

  const preloadImage = React.useCallback((
    url: string,
    retainedPreloads: RetainedImagePreloads,
    priority: "high" | "low",
    signal?: AbortSignal,
  ): Promise<boolean> => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl || signal?.aborted) return Promise.resolve(false);
    const retainedPreload = retainedPreloads.get(normalizedUrl);
    if (retainedPreload) return retainedPreload.promise;

    const image = new Image();
    image.decoding = "async";
    image.setAttribute("fetchpriority", priority);
    const promise = new Promise<boolean>((resolve) => {
      let completed = false;
      let timeoutId: number | undefined;
      const finish = (loaded: boolean) => {
        if (completed) return;
        completed = true;
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        image.onload = null;
        image.onerror = null;
        signal?.removeEventListener("abort", abort);
        if (!loaded && retainedPreloads.get(normalizedUrl)?.image === image) {
          retainedPreloads.delete(normalizedUrl);
        }
        resolve(loaded);
      };
      const abort = () => {
        image.src = "";
        finish(false);
      };
      timeoutId = window.setTimeout(() => finish(false), 12_000);
      image.onload = () => {
        if (typeof image.decode !== "function") {
          finish(true);
          return;
        }
        void image.decode().then(
          () => finish(true),
          () => finish(true),
        );
      };
      image.onerror = () => finish(false);
      signal?.addEventListener("abort", abort, { once: true });
      image.src = normalizedUrl;
    });
    retainedPreloads.set(normalizedUrl, { image, promise });
    return promise;
  }, []);

  const preloadItemCover = React.useCallback(async (
    item: QuickReviewItem,
    details: ScraperRuntimeDetailsResult | null,
    signal?: AbortSignal,
  ): Promise<void> => {
    if (!preloadCover) return;
    const urls = buildQuickReviewCoverUrls(item, details);
    for (const url of urls) {
      if (await preloadImage(url, retainedCoverPreloadsRef.current, "high", signal)) return;
    }
  }, [preloadCover, preloadImage]);

  const preloadItemThumbnails = React.useCallback(async (
    itemId: string,
    details: ScraperRuntimeDetailsResult | null,
    priority: "high" | "low" = "low",
    signal?: AbortSignal,
  ): Promise<void> => {
    if (!preloadThumbnails || !details) return;
    let retainedPreloads = retainedThumbnailPreloadsRef.current.get(itemId);
    if (!retainedPreloads) {
      retainedPreloads = new Map();
      retainedThumbnailPreloadsRef.current.set(itemId, retainedPreloads);
    }
    const limit = priority === "high"
      ? QUICK_REVIEW_FOREGROUND_THUMBNAIL_LIMIT
      : QUICK_REVIEW_BACKGROUND_THUMBNAIL_LIMIT;
    const urls = Array.from(new Set(
      (details.thumbnails ?? [])
        .map(getScraperRuntimeThumbnailUrl)
        .map((url) => url.trim())
        .filter(Boolean),
    )).slice(0, limit);
    let nextIndex = 0;
    await Promise.all(Array.from({
      length: Math.min(QUICK_REVIEW_IMAGE_PRELOAD_CONCURRENCY, urls.length),
    }, async () => {
      while (nextIndex < urls.length && !signal?.aborted) {
        const index = nextIndex;
        nextIndex += 1;
        await preloadImage(urls[index], retainedPreloads, priority, signal);
      }
    }));
  }, [preloadImage, preloadThumbnails]);

  const loadItemDetails = React.useCallback(async (
    item: QuickReviewItem,
    foreground: boolean,
  ): Promise<QuickReviewDetailsLoadState> => {
    const stored = detailsStatesRef.current.get(item.id);
    if (stored) return stored;

    let request = detailsPromisesRef.current.get(item.id);
    if (!request) {
      request = (async () => {
        const { scraper, result } = item.primarySource;
        const detailsConfig = getScraperDetailsFeatureConfig(getScraperFeature(scraper, "details"));
        const fetchDocument = typeof window.api?.fetchScraperDocument === "function"
          ? (documentRequest: Parameters<typeof window.api.fetchScraperDocument>[0]) => (
            window.api.fetchScraperDocument(documentRequest)
          )
          : undefined;

        try {
          const details = await resolveScraperCardDetails({
            scraper,
            detailsConfig,
            detailUrl: result.detailsSourceUrl || result.detailUrl,
            fetchDocument,
            detailsCache: detailsCacheRef.current,
          });
          if (!details || !fetchDocument) {
            return { details, chapterCount: null, error: null };
          }

          const pagesConfig = getScraperPagesFeatureConfig(getScraperFeature(scraper, "pages"));
          const [detailsWithInitialThumbnails, chapterCount] = await Promise.all([
            autoLoadInitialScraperDetailsThumbnails({
              scraper,
              details,
              detailsConfig,
              pagesConfig,
              fetchDocument,
            }).catch((error) => {
              console.warn("Scraper initial thumbnails fetch failed", error);
              return details;
            }),
            resolveScraperDetailsChapterCount({
              scraper,
              details,
              fetchDocument,
            }).catch((error) => {
                console.warn("Quick review chapters extraction failed", error);
                return null;
              }),
          ]);
          return { details: detailsWithInitialThumbnails, chapterCount, error: null };
        } catch (error) {
          return {
            details: null,
            chapterCount: null,
            error: error instanceof Error ? error.message : "Impossible de charger cette fiche.",
          };
        }
      })();
      detailsPromisesRef.current.set(item.id, request);
    }

    if (foreground) setLoadingItemId(item.id);
    const state = await request;
    detailsStatesRef.current.set(item.id, state);
    detailsPromisesRef.current.delete(item.id);
    setRevision((revision) => revision + 1);
    if (foreground) setLoadingItemId((itemId) => itemId === item.id ? null : itemId);
    return state;
  }, []);

  React.useEffect(() => {
    if (!currentItem) return;
    let cancelled = false;
    const preloadController = new AbortController();
    let cancelIdleTask: () => void = () => undefined;
    const queuedItems = items.slice(currentIndex + 1, currentIndex + prefetchCount + 1);
    const retainedThumbnailItemIds = new Set([
      currentItem.id,
      ...queuedItems.map((item) => item.id),
    ]);
    for (const itemId of retainedThumbnailPreloadsRef.current.keys()) {
      if (!retainedThumbnailItemIds.has(itemId)) {
        retainedThumbnailPreloadsRef.current.delete(itemId);
      }
    }
    const retainedCoverUrls = new Set(
      [currentItem, ...queuedItems].flatMap((item) => buildQuickReviewCoverUrls(item, null)),
    );
    for (const coverUrl of retainedCoverPreloadsRef.current.keys()) {
      if (!retainedCoverUrls.has(coverUrl)) retainedCoverPreloadsRef.current.delete(coverUrl);
    }

    // The listing covers are already known and must not wait for details or page thumbnails.
    const immediatelyQueuedItem = queuedItems[0];
    if (immediatelyQueuedItem) {
      void preloadItemCover(immediatelyQueuedItem, null, preloadController.signal);
    }

    const preloadQueuedItem = async (itemOffset: number): Promise<void> => {
      const nextItem = queuedItems[itemOffset];
      if (!nextItem || cancelled || preloadController.signal.aborted) return;
      const nextState = await loadItemDetails(nextItem, false);
      if (cancelled || preloadController.signal.aborted) return;
      await Promise.all([
        preloadItemCover(nextItem, nextState.details, preloadController.signal),
        preloadItemThumbnails(
          nextItem.id,
          nextState.details,
          "low",
          preloadController.signal,
        ),
      ]);
      if (cancelled || preloadController.signal.aborted || !queuedItems[itemOffset + 1]) return;
      cancelIdleTask = scheduleQuickReviewIdleTask(() => {
        if (!cancelled) void preloadQueuedItem(itemOffset + 1);
      });
    };

    const loadCurrentItem = async () => {
      const currentState = await loadItemDetails(currentItem, true);
      void preloadItemCover(currentItem, currentState.details, preloadController.signal);
      if (cancelled) return;
      cancelIdleTask = scheduleQuickReviewIdleTask(() => {
        if (!cancelled) void preloadQueuedItem(0);
      });
    };

    void loadCurrentItem();
    return () => {
      cancelled = true;
      cancelIdleTask();
      preloadController.abort();
    };
  }, [
    currentIndex,
    currentItem,
    items,
    loadItemDetails,
    prefetchCount,
    preloadItemCover,
    preloadItemThumbnails,
  ]);

  const detailsState = currentItem
    ? detailsStatesRef.current.get(currentItem.id) ?? null
    : null;
  const currentDetails = detailsState?.details ?? null;
  const detailsByItemId = React.useMemo(
    () => new Map(Array.from(detailsStatesRef.current, ([itemId, state]) => [
      itemId,
      state.details,
    ])),
    [revision],
  );
  const currentPagesConfig = currentItem
    ? getScraperPagesFeatureConfig(getScraperFeature(currentItem.primarySource.scraper, "pages"))
    : null;
  const loadMoreThumbnails = React.useCallback(async () => {
    if (!currentItem || loadingMoreItemId === currentItem.id) return;
    const storedState = detailsStatesRef.current.get(currentItem.id);
    if (!storedState?.details) return;

    const { scraper } = currentItem.primarySource;
    const detailsConfig = getScraperDetailsFeatureConfig(getScraperFeature(scraper, "details"));
    const pagesConfig = getScraperPagesFeatureConfig(getScraperFeature(scraper, "pages"));
    const fetchScraperDocument = window.api?.fetchScraperDocument;
    if (typeof fetchScraperDocument !== "function") {
      detailsStatesRef.current.set(currentItem.id, {
        ...storedState,
        error: "Le runtime du scrapper n'est pas disponible dans cette version.",
      });
      setRevision((revision) => revision + 1);
      return;
    }

    setLoadingMoreItemId(currentItem.id);
    try {
      const nextDetails = await loadMoreScraperDetailsThumbnails({
        scraper,
        details: storedState.details,
        detailsConfig,
        pagesConfig,
        fetchDocument: fetchScraperDocument,
      });
      detailsStatesRef.current.set(currentItem.id, {
        details: nextDetails,
        chapterCount: storedState.chapterCount,
        error: null,
      });
      await preloadItemThumbnails(currentItem.id, nextDetails, "high");
      setRevision((revision) => revision + 1);
    } catch (error) {
      detailsStatesRef.current.set(currentItem.id, {
        ...storedState,
        error: error instanceof Error ? error.message : "Impossible de charger la suite des vignettes.",
      });
      setRevision((revision) => revision + 1);
    } finally {
      setLoadingMoreItemId((itemId) => itemId === currentItem.id ? null : itemId);
    }
  }, [currentItem, loadingMoreItemId, preloadItemThumbnails]);

  return {
    detailsState,
    details: currentDetails,
    chapterCount: detailsState?.chapterCount ?? null,
    detailsLoading: loadingItemId === currentItem?.id && !detailsState,
    detailsByItemId,
    loadingMoreThumbnails: loadingMoreItemId === currentItem?.id,
    canLoadMoreThumbnails: canLoadMoreScraperDetailsThumbnails(currentDetails, currentPagesConfig),
    loadMoreThumbnailsLabel: getLoadMoreScraperDetailsThumbnailsLabel(currentDetails),
    loadMoreThumbnails,
  };
}
