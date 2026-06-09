import type { ScraperBookmarkRecord } from "@/shared/scraper";
import type { VirtualItemHeight } from "@/renderer/components/MultiSearch/multiSearchVirtualization";

export type VirtualBookmarkRow = {
  index: number;
  top: number;
  height: number;
  bookmarks: ScraperBookmarkRecord[];
};

export const GRID_GAP = 14;
export const INITIAL_RENDER_ROW_COUNT = 6;

export const getBookmarkId = (bookmark: ScraperBookmarkRecord): string => (
  `${bookmark.scraperId}::${bookmark.sourceUrl}`
);

export const buildVirtualBookmarkRows = (
  bookmarks: ScraperBookmarkRecord[],
  columnCount: number,
  estimatedRowHeight: number,
  getItemHeight: (bookmarkId: string) => VirtualItemHeight | undefined,
): VirtualBookmarkRow[] => {
  const rows: VirtualBookmarkRow[] = [];
  let top = 0;

  for (let index = 0; index < bookmarks.length; index += columnCount) {
    const rowBookmarks = bookmarks.slice(index, index + columnCount);
    const itemHeights = rowBookmarks.map((bookmark) => getItemHeight(getBookmarkId(bookmark)));
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
      bookmarks: rowBookmarks,
    });

    top += rowHeight + GRID_GAP;
  }

  return rows;
};

export const getRowsTotalHeight = (rows: VirtualBookmarkRow[]): number => {
  const lastRow = rows[rows.length - 1];
  return lastRow ? lastRow.top + lastRow.height : 0;
};
