import React from "react";

const BASE_DIALOG_WIDTH = 980;
const MIN_WIDE_MAIN_CONTENT_WIDTH = 700;
const REVIEW_COLUMN_GAP = 10;
const THUMBNAIL_GAP = 8;
const THUMBNAIL_PANEL_CHROME_WIDTH = 49;

const getThumbnailPanelWidth = (thumbnailSize: number, maximumColumns: number): number => (
  (thumbnailSize * maximumColumns)
  + (THUMBNAIL_GAP * Math.max(0, maximumColumns - 1))
  + THUMBNAIL_PANEL_CHROME_WIDTH
);

export default function useQuickReviewLayout(
  thumbnailSize: number,
  maximumColumns: number,
  thumbnailsVisible: boolean,
) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = React.useState(false);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const modal = container.closest<HTMLElement>(".quick-review-modal");
    if (!thumbnailsVisible) {
      setWide(false);
      container.style.removeProperty("--quick-review-thumbnail-panel-width");
      modal?.style.setProperty("--quick-review-dialog-width", `${BASE_DIALOG_WIDTH}px`);
      return () => modal?.style.removeProperty("--quick-review-dialog-width");
    }
    const thumbnailPanelWidth = getThumbnailPanelWidth(thumbnailSize, maximumColumns);
    const minimumWideWidth = MIN_WIDE_MAIN_CONTENT_WIDTH + REVIEW_COLUMN_GAP + thumbnailPanelWidth;
    const dialogWidth = BASE_DIALOG_WIDTH + REVIEW_COLUMN_GAP + thumbnailPanelWidth;

    container.style.setProperty("--quick-review-thumbnail-panel-width", `${thumbnailPanelWidth}px`);
    modal?.style.setProperty("--quick-review-dialog-width", `${dialogWidth}px`);

    const updateLayout = (width: number) => setWide(width >= minimumWideWidth);
    updateLayout(container.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") {
      return () => modal?.style.removeProperty("--quick-review-dialog-width");
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === container);
      updateLayout(entry?.contentRect.width ?? container.getBoundingClientRect().width);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      modal?.style.removeProperty("--quick-review-dialog-width");
    };
  }, [maximumColumns, thumbnailSize, thumbnailsVisible]);

  return { containerRef, wide };
}
