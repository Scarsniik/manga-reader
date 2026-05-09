import React from "react";
import type {
  ScraperViewHistoryCardIdentity,
  ScraperViewHistoryRecord,
} from "@/shared/scraper";
import MultiSearchResultCard from "@/renderer/components/MultiSearch/MultiSearchResultCard";
import type { Manga } from "@/renderer/types";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type { MultiSearchProgressIndex } from "@/renderer/components/MultiSearch/multiSearchSourceState";
import {
  MEASUREMENT_PRECISION_PX,
  MIN_OVERSCAN_PX,
  OVERSCAN_VIEWPORT_MULTIPLIER,
  buildVirtualRows,
  findFirstVisibleItem,
  getColumnCount,
  getEstimatedRowHeight,
  getRowsTotalHeight,
  getScrollableParent,
  getScrollTargetTop,
  getViewportRange,
  hasStickyState,
  scrollBy,
  type ScrollAnchor,
  type ScrollTarget,
  type VirtualItemHeight,
  type ViewportRange,
} from "@/renderer/components/MultiSearch/multiSearchVirtualization";

type Props = {
  results: MultiSearchMergedResult[];
  libraryMangas: Manga[];
  bookmarkedSourceKeys: Set<string>;
  sourceProgressIndex: MultiSearchProgressIndex;
  viewHistoryRecordsById: Map<string, ScraperViewHistoryRecord>;
  onOpenSource: (source: MultiSearchSourceResult) => void;
  onOpenSourceInWorkspace: (source: MultiSearchSourceResult) => void;
  onOpenProgressReader: (
    source: MultiSearchSourceResult,
    page: number,
    totalPages: number | null,
    readerMangaId?: string,
  ) => void;
  onSetSourcesRead: (identities: ScraperViewHistoryCardIdentity[], read: boolean) => void;
};

type MeasuredItemProps = Omit<Props, "results"> & {
  result: MultiSearchMergedResult;
  onHeightChange: (resultId: string, height: number) => void;
  onStickyChange: (resultId: string, isSticky: boolean) => void;
};

function MeasuredMultiSearchResultCard({
  result,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
  onHeightChange,
  onStickyChange,
}: MeasuredItemProps) {
  const itemRef = React.useRef<HTMLDivElement | null>(null);
  const blurTimeoutRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    const item = itemRef.current;
    if (!item) {
      return undefined;
    }

    let frameId: number | null = null;
    const measure = () => {
      frameId = null;
      onHeightChange(result.id, Math.ceil(item.getBoundingClientRect().height));
    };
    const scheduleMeasure = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(scheduleMeasure);

    observer.observe(item);
    scheduleMeasure();

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [onHeightChange, result.id]);

  React.useEffect(() => {
    const item = itemRef.current;
    if (!item) {
      return undefined;
    }

    const syncStickyState = () => onStickyChange(result.id, hasStickyState(item));
    item.addEventListener("toggle", syncStickyState, true);

    return () => {
      item.removeEventListener("toggle", syncStickyState, true);
    };
  }, [onStickyChange, result.id]);

  const syncStickyStateAfterBlur = () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }

    blurTimeoutRef.current = window.setTimeout(() => {
      blurTimeoutRef.current = null;
      const item = itemRef.current;
      if (item) {
        onStickyChange(result.id, hasStickyState(item));
      }
    }, 0);
  };

  React.useEffect(() => () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }
  }, []);

  return (
    <div
      ref={itemRef}
      className="multi-search__virtual-item"
      data-result-id={result.id}
      onFocusCapture={() => onStickyChange(result.id, true)}
      onBlurCapture={syncStickyStateAfterBlur}
    >
      <MultiSearchResultCard
        result={result}
        libraryMangas={libraryMangas}
        bookmarkedSourceKeys={bookmarkedSourceKeys}
        sourceProgressIndex={sourceProgressIndex}
        viewHistoryRecordsById={viewHistoryRecordsById}
        onOpenSource={onOpenSource}
        onOpenSourceInWorkspace={onOpenSourceInWorkspace}
        onOpenProgressReader={onOpenProgressReader}
        onSetSourcesRead={onSetSourcesRead}
      />
    </div>
  );
}

export default function MultiSearchVirtualizedResultsGrid({
  results,
  libraryMangas,
  bookmarkedSourceKeys,
  sourceProgressIndex,
  viewHistoryRecordsById,
  onOpenSource,
  onOpenSourceInWorkspace,
  onOpenProgressReader,
  onSetSourcesRead,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollTargetRef = React.useRef<ScrollTarget | null>(null);
  const exactHeightCacheRef = React.useRef(new Map<string, number>());
  const fallbackHeightCacheRef = React.useRef(new Map<string, number>());
  const pendingAnchorRef = React.useRef<ScrollAnchor | null>(null);
  const resultsRef = React.useRef(results);
  const containerWidthRef = React.useRef(0);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [heightVersion, setHeightVersion] = React.useState(0);
  const [viewportRange, setViewportRange] = React.useState<ViewportRange>({
    start: 0,
    end: 0,
    height: 0,
  });
  const [stickyResultIds, setStickyResultIds] = React.useState<Set<string>>(() => new Set());

  resultsRef.current = results;

  const columnCount = React.useMemo(
    () => getColumnCount(containerWidth),
    [containerWidth],
  );
  const estimatedRowHeight = React.useMemo(
    () => getEstimatedRowHeight(containerWidth, columnCount),
    [columnCount, containerWidth],
  );
  const getItemHeight = React.useCallback((resultId: string): VirtualItemHeight | undefined => {
    const exactHeight = exactHeightCacheRef.current.get(resultId);
    if (exactHeight !== undefined) {
      return {
        height: exactHeight,
        isExact: true,
      };
    }

    const fallbackHeight = fallbackHeightCacheRef.current.get(resultId);
    return fallbackHeight === undefined
      ? undefined
      : {
        height: fallbackHeight,
        isExact: false,
      };
  }, []);
  const rows = React.useMemo(
    () => buildVirtualRows(results, columnCount, estimatedRowHeight, getItemHeight),
    [columnCount, estimatedRowHeight, getItemHeight, heightVersion, results],
  );
  const totalHeight = React.useMemo(() => getRowsTotalHeight(rows), [rows]);

  const updateViewportRange = React.useCallback(() => {
    const container = containerRef.current;
    const target = scrollTargetRef.current;
    if (!container || !target) {
      return;
    }

    setViewportRange(getViewportRange(container, target));
  }, []);

  const captureScrollAnchor = React.useCallback(() => {
    const container = containerRef.current;
    const target = scrollTargetRef.current;
    if (!container || !target) {
      return;
    }

    const item = findFirstVisibleItem(container, target);
    const resultId = item?.dataset.resultId;
    if (!item || !resultId) {
      return;
    }

    const resultIndex = resultsRef.current.findIndex((result) => result.id === resultId);
    if (resultIndex === -1) {
      return;
    }

    pendingAnchorRef.current = {
      resultId,
      resultIndex,
      offset: item.getBoundingClientRect().top - getScrollTargetTop(target),
    };
  }, []);

  const updateItemHeight = React.useCallback((resultId: string, height: number) => {
    const previousHeight = exactHeightCacheRef.current.get(resultId);
    if (
      previousHeight !== undefined
      && Math.abs(previousHeight - height) < MEASUREMENT_PRECISION_PX
    ) {
      return;
    }

    captureScrollAnchor();
    exactHeightCacheRef.current.set(resultId, height);
    fallbackHeightCacheRef.current.set(resultId, height);
    setHeightVersion((currentVersion) => currentVersion + 1);
  }, [captureScrollAnchor]);

  const updateStickyState = React.useCallback((resultId: string, isSticky: boolean) => {
    setStickyResultIds((currentIds) => {
      const hasValue = currentIds.has(resultId);
      if (hasValue === isSticky) {
        return currentIds;
      }

      const nextIds = new Set(currentIds);
      if (isSticky) {
        nextIds.add(resultId);
      } else {
        nextIds.delete(resultId);
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
    let frameId: number | null = null;
    const scheduleViewportUpdate = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateViewportRange();
      });
    };

    updateViewportRange();
    scrollTarget.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
    window.addEventListener("resize", scheduleViewportUpdate, { passive: true });

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      scrollTarget.removeEventListener("scroll", scheduleViewportUpdate);
      window.removeEventListener("resize", scheduleViewportUpdate);
    };
  }, [updateViewportRange]);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (nextWidth <= 0 || containerWidthRef.current === nextWidth) {
        return;
      }

      captureScrollAnchor();
      containerWidthRef.current = nextWidth;
      exactHeightCacheRef.current.clear();
      setContainerWidth(nextWidth);
      setHeightVersion((currentVersion) => currentVersion + 1);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [captureScrollAnchor]);

  React.useEffect(() => {
    const resultIds = new Set(results.map((result) => result.id));
    let didPruneHeights = false;

    [exactHeightCacheRef.current, fallbackHeightCacheRef.current].forEach((cache) => {
      Array.from(cache.keys()).forEach((resultId) => {
        if (!resultIds.has(resultId)) {
          cache.delete(resultId);
          didPruneHeights = true;
        }
      });
    });

    setStickyResultIds((currentIds) => {
      const nextIds = new Set(Array.from(currentIds).filter((resultId) => resultIds.has(resultId)));
      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });

    if (didPruneHeights) {
      setHeightVersion((currentVersion) => currentVersion + 1);
    }
  }, [results]);

  React.useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current;
    const container = containerRef.current;
    const target = scrollTargetRef.current;
    if (!anchor || !container || !target) {
      return;
    }

    pendingAnchorRef.current = null;
    const nextResultIndex = results.findIndex((result) => result.id === anchor.resultId);
    const resultIndex = nextResultIndex === -1 ? anchor.resultIndex : nextResultIndex;
    const rowIndex = Math.floor(resultIndex / columnCount);
    const row = rows[rowIndex];
    if (!row) {
      return;
    }

    const currentRange = getViewportRange(container, target);
    scrollBy(target, row.top - anchor.offset - currentRange.start);
    updateViewportRange();
  }, [columnCount, results, rows, updateViewportRange]);

  const overscan = Math.max(
    MIN_OVERSCAN_PX,
    viewportRange.height * OVERSCAN_VIEWPORT_MULTIPLIER,
  );
  const visibleStart = viewportRange.start - overscan;
  const visibleEnd = viewportRange.end + overscan;
  const visibleRows = rows.filter((row) => {
    const isInRange = viewportRange.height === 0
      ? row.index < 6
      : row.top + row.height >= visibleStart && row.top <= visibleEnd;
    const hasStickyItem = row.results.some((result) => stickyResultIds.has(result.id));

    return isInRange || hasStickyItem;
  });

  return (
    <div
      ref={containerRef}
      className="multi-search__virtual-grid"
      style={{ height: totalHeight }}
    >
      {visibleRows.map((row) => (
        <div
          key={row.index}
          className="multi-search__virtual-row"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            top: row.top,
            zIndex: row.results.some((result) => stickyResultIds.has(result.id)) ? 2 : undefined,
          }}
        >
          {row.results.map((result) => (
            <MeasuredMultiSearchResultCard
              key={result.id}
              result={result}
              libraryMangas={libraryMangas}
              bookmarkedSourceKeys={bookmarkedSourceKeys}
              sourceProgressIndex={sourceProgressIndex}
              viewHistoryRecordsById={viewHistoryRecordsById}
              onOpenSource={onOpenSource}
              onOpenSourceInWorkspace={onOpenSourceInWorkspace}
              onOpenProgressReader={onOpenProgressReader}
              onSetSourcesRead={onSetSourcesRead}
              onHeightChange={updateItemHeight}
              onStickyChange={updateStickyState}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
