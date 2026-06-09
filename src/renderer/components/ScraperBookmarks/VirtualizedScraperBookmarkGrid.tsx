import React from "react";
import type { ScraperBookmarkRecord } from "@/shared/scraper";
import {
  MEASUREMENT_PRECISION_PX,
  getColumnCount,
  getEstimatedRowHeight,
  getScrollableParent,
  getViewportRange,
  type ScrollTarget,
  type ViewportRange,
  type VirtualItemHeight,
} from "@/renderer/components/MultiSearch/multiSearchVirtualization";
import ScraperBookmarkVirtualItem from "@/renderer/components/ScraperBookmarks/ScraperBookmarkVirtualItem";
import {
  INITIAL_RENDER_ROW_COUNT,
  buildVirtualBookmarkRows,
  getBookmarkId,
  getRowsTotalHeight,
} from "@/renderer/components/ScraperBookmarks/bookmarkVirtualization";

type Props = {
  bookmarks: ScraperBookmarkRecord[];
  renderBookmark: (bookmark: ScraperBookmarkRecord) => React.ReactNode;
};

const MIN_BOOKMARK_OVERSCAN_PX = 2600;
const BOOKMARK_OVERSCAN_VIEWPORT_MULTIPLIER = 3;
const MIN_ESTIMATED_BOOKMARK_ROW_HEIGHT = 900;
const FALLBACK_RENDER_ROW_RADIUS = 4;

export default function VirtualizedScraperBookmarkGrid({
  bookmarks,
  renderBookmark,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollTargetRef = React.useRef<ScrollTarget | null>(null);
  const exactHeightCacheRef = React.useRef(new Map<string, number>());
  const fallbackHeightCacheRef = React.useRef(new Map<string, number>());
  const viewportUpdateFrameRef = React.useRef<number | null>(null);
  const containerWidthRef = React.useRef(0);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [heightVersion, setHeightVersion] = React.useState(0);
  const [viewportRange, setViewportRange] = React.useState<ViewportRange>({
    start: 0,
    end: 0,
    height: 0,
  });
  const [stickyBookmarkIds, setStickyBookmarkIds] = React.useState<Set<string>>(() => new Set());

  const columnCount = React.useMemo(
    () => getColumnCount(containerWidth),
    [containerWidth],
  );
  const estimatedRowHeight = React.useMemo(
    () => Math.max(
      getEstimatedRowHeight(containerWidth, columnCount),
      MIN_ESTIMATED_BOOKMARK_ROW_HEIGHT,
    ),
    [columnCount, containerWidth],
  );
  const getItemHeight = React.useCallback((bookmarkId: string): VirtualItemHeight | undefined => {
    const exactHeight = exactHeightCacheRef.current.get(bookmarkId);
    if (exactHeight !== undefined) {
      return {
        height: exactHeight,
        isExact: true,
      };
    }

    const fallbackHeight = fallbackHeightCacheRef.current.get(bookmarkId);
    return fallbackHeight === undefined
      ? undefined
      : {
        height: fallbackHeight,
        isExact: false,
      };
  }, []);
  const rows = React.useMemo(
    () => buildVirtualBookmarkRows(bookmarks, columnCount, estimatedRowHeight, getItemHeight),
    [bookmarks, columnCount, estimatedRowHeight, getItemHeight, heightVersion],
  );
  const totalHeight = React.useMemo(() => getRowsTotalHeight(rows), [rows]);

  const updateViewportRange = React.useCallback(() => {
    const container = containerRef.current;
    const target = scrollTargetRef.current;
    if (container && target) {
      setViewportRange(getViewportRange(container, target));
    }
  }, []);

  const scheduleViewportUpdate = React.useCallback(() => {
    if (viewportUpdateFrameRef.current !== null) {
      return;
    }

    viewportUpdateFrameRef.current = window.requestAnimationFrame(() => {
      viewportUpdateFrameRef.current = null;
      updateViewportRange();
    });
  }, [updateViewportRange]);

  const updateItemHeight = React.useCallback((bookmarkId: string, height: number) => {
    const previousHeight = exactHeightCacheRef.current.get(bookmarkId);
    if (
      previousHeight !== undefined
      && Math.abs(previousHeight - height) < MEASUREMENT_PRECISION_PX
    ) {
      return;
    }

    exactHeightCacheRef.current.set(bookmarkId, height);
    fallbackHeightCacheRef.current.set(bookmarkId, height);
    scheduleViewportUpdate();
    setHeightVersion((currentVersion) => currentVersion + 1);
  }, [scheduleViewportUpdate]);

  const updateStickyState = React.useCallback((bookmarkId: string, isSticky: boolean) => {
    setStickyBookmarkIds((currentIds) => {
      if (currentIds.has(bookmarkId) === isSticky) {
        return currentIds;
      }

      const nextIds = new Set(currentIds);
      if (isSticky) {
        nextIds.add(bookmarkId);
      } else {
        nextIds.delete(bookmarkId);
      }

      return nextIds;
    });
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    scrollTargetRef.current = getScrollableParent(container);
    const scrollTarget = scrollTargetRef.current;
    const scheduleScrollViewportUpdate = () => {
      if (viewportUpdateFrameRef.current !== null) {
        return;
      }

      viewportUpdateFrameRef.current = window.requestAnimationFrame(() => {
        viewportUpdateFrameRef.current = null;
        updateViewportRange();
      });
    };

    updateViewportRange();
    scrollTarget.addEventListener("scroll", scheduleScrollViewportUpdate, { passive: true });
    window.addEventListener("resize", scheduleScrollViewportUpdate, { passive: true });

    return () => {
      if (viewportUpdateFrameRef.current !== null) {
        window.cancelAnimationFrame(viewportUpdateFrameRef.current);
        viewportUpdateFrameRef.current = null;
      }

      scrollTarget.removeEventListener("scroll", scheduleScrollViewportUpdate);
      window.removeEventListener("resize", scheduleScrollViewportUpdate);
    };
  }, [updateViewportRange]);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const measure = (nextWidth: number) => {
      if (nextWidth <= 0 || containerWidthRef.current === nextWidth) {
        return;
      }

      containerWidthRef.current = nextWidth;
      exactHeightCacheRef.current.clear();
      setContainerWidth(nextWidth);
      scheduleViewportUpdate();
      setHeightVersion((currentVersion) => currentVersion + 1);
    };

    if (typeof ResizeObserver === "undefined") {
      measure(Math.floor(container.getBoundingClientRect().width));
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      measure(Math.floor(entries[0]?.contentRect.width ?? 0));
    });

    observer.observe(container);
    measure(Math.floor(container.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, [scheduleViewportUpdate]);

  React.useEffect(() => {
    const bookmarkIds = new Set(bookmarks.map(getBookmarkId));
    let didPruneHeights = false;

    [exactHeightCacheRef.current, fallbackHeightCacheRef.current].forEach((cache) => {
      Array.from(cache.keys()).forEach((bookmarkId) => {
        if (!bookmarkIds.has(bookmarkId)) {
          cache.delete(bookmarkId);
          didPruneHeights = true;
        }
      });
    });

    setStickyBookmarkIds((currentIds) => {
      const nextIds = new Set(Array.from(currentIds).filter((bookmarkId) => bookmarkIds.has(bookmarkId)));
      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });

    if (didPruneHeights) {
      setHeightVersion((currentVersion) => currentVersion + 1);
    }
    scheduleViewportUpdate();
  }, [bookmarks, scheduleViewportUpdate]);

  const overscan = Math.max(
    MIN_BOOKMARK_OVERSCAN_PX,
    viewportRange.height * BOOKMARK_OVERSCAN_VIEWPORT_MULTIPLIER,
  );
  const visibleStart = viewportRange.start - overscan;
  const visibleEnd = viewportRange.end + overscan;
  const rowsInViewport = rows.filter((row) => {
    const isInRange = viewportRange.height === 0
      ? row.index < INITIAL_RENDER_ROW_COUNT
      : row.top + row.height >= visibleStart && row.top <= visibleEnd;
    const hasStickyItem = row.bookmarks.some((bookmark) => stickyBookmarkIds.has(getBookmarkId(bookmark)));

    return isInRange || hasStickyItem;
  });
  const fallbackRowIndex = rows.findIndex((row) => row.top + row.height >= Math.max(0, viewportRange.start));
  const resolvedFallbackRowIndex = fallbackRowIndex === -1 ? Math.max(0, rows.length - 1) : fallbackRowIndex;
  const visibleRows = rowsInViewport.length ? rowsInViewport : rows.slice(
    Math.max(0, resolvedFallbackRowIndex - FALLBACK_RENDER_ROW_RADIUS),
    Math.max(INITIAL_RENDER_ROW_COUNT, resolvedFallbackRowIndex + FALLBACK_RENDER_ROW_RADIUS + 1),
  );

  return (
    <div
      ref={containerRef}
      className="scraper-bookmarks-view__virtual-grid"
      style={{ height: totalHeight }}
    >
      {visibleRows.map((row) => (
        <div
          key={row.index}
          className="scraper-bookmarks-view__virtual-row"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            top: row.top,
            zIndex: row.bookmarks.some((bookmark) => stickyBookmarkIds.has(getBookmarkId(bookmark))) ? 2 : undefined,
          }}
        >
          {row.bookmarks.map((bookmark) => (
            <ScraperBookmarkVirtualItem
              key={getBookmarkId(bookmark)}
              bookmark={bookmark}
              renderBookmark={renderBookmark}
              onHeightChange={updateItemHeight}
              onStickyChange={updateStickyState}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
