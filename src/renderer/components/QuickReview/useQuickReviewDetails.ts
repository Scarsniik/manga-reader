import React from "react";
import type { QuickReviewItem } from "@/renderer/components/QuickReview/types";
import { buildQuickReviewCoverUrls } from "@/renderer/components/QuickReview/quickReviewImages";
import useParams from "@/renderer/hooks/useParams";
import {
  createScraperCardDetailsCache,
  getScraperChaptersFeatureConfig,
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  isScraperFeatureConfigured,
  resolveScraperCardDetails,
  resolveScraperChapters,
  getScraperRuntimeThumbnailUrl,
  type ScraperRuntimeDetailsResult,
} from "@/renderer/utils/scraperRuntime";
import { buildScraperTemplateContextFromDetails } from "@/renderer/utils/scraperTemplateContext";
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
  const imagePreloadPromisesRef = React.useRef(new Map<string, Promise<boolean>>());
  const retainedCoverPreloadsRef = React.useRef(new Map<string, {
    image: HTMLImageElement;
    promise: Promise<boolean>;
  }>());

  const preloadImage = React.useCallback((url: string, retain = false): Promise<boolean> => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) return Promise.resolve(false);
    const retainedPreload = retainedCoverPreloadsRef.current.get(normalizedUrl);
    if (retainedPreload) return retainedPreload.promise;
    const storedPromise = retain ? undefined : imagePreloadPromisesRef.current.get(normalizedUrl);
    if (storedPromise) return storedPromise;

    const image = new Image();
    image.decoding = "async";
    image.setAttribute("fetchpriority", retain ? "high" : "low");
    const promise = new Promise<boolean>((resolve) => {
      let completed = false;
      const finish = (loaded: boolean) => {
        if (completed) return;
        completed = true;
        window.clearTimeout(timeoutId);
        image.onload = null;
        image.onerror = null;
        resolve(loaded);
      };
      const timeoutId = window.setTimeout(() => finish(false), 12_000);
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
      image.src = normalizedUrl;
    });
    if (retain) {
      retainedCoverPreloadsRef.current.set(normalizedUrl, { image, promise });
    } else {
      imagePreloadPromisesRef.current.set(normalizedUrl, promise);
    }
    return promise;
  }, []);

  const preloadItemCover = React.useCallback(async (
    item: QuickReviewItem,
    details: ScraperRuntimeDetailsResult | null,
  ): Promise<void> => {
    if (!preloadCover) return;
    const urls = buildQuickReviewCoverUrls(item, details);
    for (const url of urls) {
      if (await preloadImage(url, true)) return;
    }
  }, [preloadCover, preloadImage]);

  const preloadItemThumbnails = React.useCallback(async (
    details: ScraperRuntimeDetailsResult | null,
  ): Promise<void> => {
    if (!preloadThumbnails || !details) return;
    const urls = Array.from(new Set(
      (details.thumbnails ?? [])
        .map(getScraperRuntimeThumbnailUrl)
        .map((url) => url.trim())
        .filter(Boolean),
    ));
    await Promise.all(urls.map((url) => preloadImage(url)));
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
          const chaptersFeature = getScraperFeature(scraper, "chapters");
          const chaptersConfig = isScraperFeatureConfigured(chaptersFeature)
            ? getScraperChaptersFeatureConfig(chaptersFeature)
            : null;
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
            chaptersConfig
              ? resolveScraperChapters(
                scraper.baseUrl,
                details.finalUrl || details.requestedUrl,
                chaptersConfig,
                buildScraperTemplateContextFromDetails(details),
                fetchDocument,
              ).then((resolution) => (
                resolution.sourceResult.ok ? resolution.chapters.length : null
              )).catch((error) => {
                console.warn("Quick review chapters extraction failed", error);
                return null;
              })
              : Promise.resolve(null),
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
    const queuedItems = items.slice(currentIndex + 1, currentIndex + prefetchCount + 1);

    // The listing covers are already known and must not wait for details or page thumbnails.
    const preliminaryCoverPreload = Promise.all(
      queuedItems.map((item) => preloadItemCover(item, null)),
    );

    const loadQueue = async () => {
      const currentState = await loadItemDetails(currentItem, true);
      await preloadItemCover(currentItem, currentState.details);
      await preliminaryCoverPreload;
      if (cancelled) return;

      const prefetchedDetails: ScraperRuntimeDetailsResult[] = [];
      for (const nextItem of queuedItems) {
        if (cancelled) return;
        const nextState = await loadItemDetails(nextItem, false);
        await preloadItemCover(nextItem, nextState.details);
        if (nextState.details) prefetchedDetails.push(nextState.details);
      }

      if (cancelled) return;
      await preloadItemThumbnails(currentState.details);
      for (const nextDetails of prefetchedDetails) {
        if (cancelled) return;
        await preloadItemThumbnails(nextDetails);
      }
    };

    void loadQueue();
    return () => {
      cancelled = true;
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
      await preloadItemThumbnails(nextDetails);
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
