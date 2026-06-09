import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ScraperTagListItem } from "@/shared/scraper";

type Props = {
  tags: ScraperTagListItem[];
  renderTag: (tag: ScraperTagListItem) => React.ReactNode;
};

type ScrollTarget = HTMLElement | Window;

type ViewportRange = {
  start: number;
  end: number;
  height: number;
};

const GRID_GAP = 8;
const MIN_COLUMN_WIDTH = 168;
const ROW_HEIGHT = 36;
const MIN_OVERSCAN_PX = 700;
const OVERSCAN_VIEWPORT_MULTIPLIER = 1.5;

const isWindowScrollTarget = (target: ScrollTarget): target is Window => (
  target === window
);

const getScrollableParent = (element: HTMLElement): ScrollTarget => {
  let parent = element.parentElement;

  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return parent;
    }

    parent = parent.parentElement;
  }

  return window;
};

const getScrollTargetTop = (target: ScrollTarget): number => (
  isWindowScrollTarget(target) ? 0 : target.getBoundingClientRect().top
);

const getScrollTargetHeight = (target: ScrollTarget): number => (
  isWindowScrollTarget(target)
    ? window.innerHeight || document.documentElement.clientHeight
    : target.clientHeight
);

const getViewportRange = (
  container: HTMLElement,
  target: ScrollTarget,
): ViewportRange => {
  const containerRect = container.getBoundingClientRect();
  const targetTop = getScrollTargetTop(target);
  const height = getScrollTargetHeight(target);
  const start = targetTop - containerRect.top;

  return {
    start,
    end: start + height,
    height,
  };
};

const getColumnCount = (containerWidth: number): number => {
  if (containerWidth <= 0) {
    return 1;
  }

  return Math.max(
    1,
    Math.floor((containerWidth + GRID_GAP) / (MIN_COLUMN_WIDTH + GRID_GAP)),
  );
};

const getRowCount = (itemCount: number, columnCount: number): number => (
  Math.ceil(itemCount / Math.max(1, columnCount))
);

const getTotalHeight = (rowCount: number): number => (
  rowCount <= 0
    ? 0
    : rowCount * ROW_HEIGHT + (rowCount - 1) * GRID_GAP
);

export default function VirtualizedTagGrid({
  tags,
  renderTag,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollTargetRef = useRef<ScrollTarget | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewportRange, setViewportRange] = useState<ViewportRange>({
    start: 0,
    end: 0,
    height: 0,
  });
  const columnCount = useMemo(
    () => getColumnCount(containerWidth),
    [containerWidth],
  );
  const rowCount = useMemo(
    () => getRowCount(tags.length, columnCount),
    [columnCount, tags.length],
  );
  const totalHeight = useMemo(
    () => getTotalHeight(rowCount),
    [rowCount],
  );

  const updateViewportRange = useCallback(() => {
    const container = containerRef.current;
    const target = scrollTargetRef.current;
    if (!container || !target) {
      return;
    }

    setViewportRange(getViewportRange(container, target));
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const measure = () => {
      const nextWidth = Math.floor(container.getBoundingClientRect().width);
      setContainerWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
      updateViewportRange();
    };

    if (typeof ResizeObserver === "undefined") {
      measure();
      return undefined;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, [updateViewportRange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    scrollTargetRef.current = getScrollableParent(container);
    const target = scrollTargetRef.current;
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
    target.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
    window.addEventListener("resize", scheduleViewportUpdate, { passive: true });
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      target.removeEventListener("scroll", scheduleViewportUpdate);
      window.removeEventListener("resize", scheduleViewportUpdate);
    };
  }, [updateViewportRange]);

  useEffect(() => {
    updateViewportRange();
  }, [tags, updateViewportRange]);

  const overscan = Math.max(
    MIN_OVERSCAN_PX,
    viewportRange.height * OVERSCAN_VIEWPORT_MULTIPLIER,
  );
  const rowStride = ROW_HEIGHT + GRID_GAP;
  const visibleStart = viewportRange.start - overscan;
  const visibleEnd = viewportRange.end + overscan;
  const firstVisibleRow = viewportRange.height === 0
    ? 0
    : Math.max(0, Math.floor(visibleStart / rowStride));
  const lastVisibleRow = viewportRange.height === 0
    ? Math.min(rowCount - 1, 18)
    : Math.min(rowCount - 1, Math.ceil(visibleEnd / rowStride));
  const visibleRows = [];

  for (let rowIndex = firstVisibleRow; rowIndex <= lastVisibleRow; rowIndex += 1) {
    const startIndex = rowIndex * columnCount;
    const rowTags = tags.slice(startIndex, startIndex + columnCount);
    if (rowTags.length > 0) {
      visibleRows.push({
        index: rowIndex,
        tags: rowTags,
      });
    }
  }

  return (
    <div
      ref={containerRef}
      className="scraper-tag-list__virtual-grid"
      style={{ height: totalHeight }}
    >
      {visibleRows.map((row) => (
        <div
          key={row.index}
          className="scraper-tag-list__virtual-row"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
            top: row.index * rowStride,
          }}
        >
          {row.tags.map((tag) => renderTag(tag))}
        </div>
      ))}
    </div>
  );
}
