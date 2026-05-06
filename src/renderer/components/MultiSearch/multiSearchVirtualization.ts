import type { MultiSearchMergedResult } from "@/renderer/components/MultiSearch/types";

export type VirtualRow = {
  index: number;
  top: number;
  height: number;
  results: MultiSearchMergedResult[];
};

export type ViewportRange = {
  start: number;
  end: number;
  height: number;
};

export type ScrollAnchor = {
  resultId: string;
  resultIndex: number;
  offset: number;
};

export type ScrollTarget = HTMLElement | Window;

export type VirtualItemHeight = {
  height: number;
  isExact: boolean;
};

const GRID_GAP = 14;
const MIN_COLUMN_WIDTH = 280;
const BASE_CARD_CHROME_HEIGHT = 250;

export const MIN_OVERSCAN_PX = 900;
export const OVERSCAN_VIEWPORT_MULTIPLIER = 2;
export const MEASUREMENT_PRECISION_PX = 1;

const isWindowScrollTarget = (target: ScrollTarget): target is Window => (
  target === window
);

export const getScrollableParent = (element: HTMLElement): ScrollTarget => {
  let parent = element.parentElement;

  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    const canScroll = overflowY === "auto" || overflowY === "scroll";

    if (canScroll) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return window;
};

export const getScrollTargetTop = (target: ScrollTarget): number => (
  isWindowScrollTarget(target) ? 0 : target.getBoundingClientRect().top
);

const getScrollTargetHeight = (target: ScrollTarget): number => (
  isWindowScrollTarget(target)
    ? window.innerHeight || document.documentElement.clientHeight
    : target.clientHeight
);

export const getViewportRange = (
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

export const scrollBy = (target: ScrollTarget, delta: number) => {
  if (Math.abs(delta) < MEASUREMENT_PRECISION_PX) {
    return;
  }

  if (isWindowScrollTarget(target)) {
    target.scrollBy(0, delta);
    return;
  }

  target.scrollTop += delta;
};

export const getColumnCount = (containerWidth: number): number => {
  if (containerWidth <= 0) {
    return 1;
  }

  return Math.max(
    1,
    Math.floor((containerWidth + GRID_GAP) / (MIN_COLUMN_WIDTH + GRID_GAP)),
  );
};

export const getEstimatedRowHeight = (
  containerWidth: number,
  columnCount: number,
): number => {
  const resolvedWidth = containerWidth > 0 ? containerWidth : MIN_COLUMN_WIDTH;
  const columnWidth = Math.max(
    MIN_COLUMN_WIDTH,
    (resolvedWidth - GRID_GAP * (columnCount - 1)) / columnCount,
  );

  return Math.round(columnWidth * 4 / 3 + BASE_CARD_CHROME_HEIGHT);
};

export const buildVirtualRows = (
  results: MultiSearchMergedResult[],
  columnCount: number,
  estimatedRowHeight: number,
  getItemHeight: (resultId: string) => VirtualItemHeight | undefined,
): VirtualRow[] => {
  const rows: VirtualRow[] = [];
  let top = 0;

  for (let index = 0; index < results.length; index += columnCount) {
    const rowResults = results.slice(index, index + columnCount);
    const itemHeights = rowResults.map((result) => getItemHeight(result.id));
    const measuredHeight = itemHeights.reduce((height, itemHeight) => (
      Math.max(height, itemHeight?.height ?? 0)
    ), 0);
    const hasMissingExactHeight = itemHeights.some((itemHeight) => !itemHeight?.isExact);
    const rowHeight = hasMissingExactHeight
      ? Math.max(estimatedRowHeight, measuredHeight)
      : measuredHeight || estimatedRowHeight;

    rows.push({
      index: rows.length,
      top,
      height: rowHeight,
      results: rowResults,
    });

    top += rowHeight + GRID_GAP;
  }

  return rows;
};

export const getRowsTotalHeight = (rows: VirtualRow[]): number => {
  const lastRow = rows[rows.length - 1];
  return lastRow ? lastRow.top + lastRow.height : 0;
};

export const findFirstVisibleItem = (
  container: HTMLElement,
  target: ScrollTarget,
): HTMLElement | null => {
  const viewportTop = getScrollTargetTop(target);
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(".multi-search__virtual-item[data-result-id]"),
  );

  return candidates
    .filter((candidate) => candidate.getBoundingClientRect().bottom >= viewportTop)
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0] ?? null;
};

export const hasStickyState = (element: HTMLElement): boolean => (
  element.contains(document.activeElement)
  || Boolean(element.querySelector("details[open]"))
);
