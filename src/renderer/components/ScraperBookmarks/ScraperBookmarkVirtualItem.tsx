import React from "react";
import type { ScraperBookmarkRecord } from "@/shared/scraper";
import { hasStickyState } from "@/renderer/components/MultiSearch/multiSearchVirtualization";
import { getBookmarkId } from "@/renderer/components/ScraperBookmarks/bookmarkVirtualization";

type Props = {
  bookmark: ScraperBookmarkRecord;
  renderBookmark: (bookmark: ScraperBookmarkRecord) => React.ReactNode;
  onHeightChange: (bookmarkId: string, height: number) => void;
  onStickyChange: (bookmarkId: string, isSticky: boolean) => void;
};

export default function ScraperBookmarkVirtualItem({
  bookmark,
  renderBookmark,
  onHeightChange,
  onStickyChange,
}: Props) {
  const itemRef = React.useRef<HTMLDivElement | null>(null);
  const blurTimeoutRef = React.useRef<number | null>(null);
  const bookmarkId = getBookmarkId(bookmark);

  React.useLayoutEffect(() => {
    const item = itemRef.current;
    if (!item) {
      return undefined;
    }

    let frameId: number | null = null;
    const measure = () => {
      frameId = null;
      onHeightChange(bookmarkId, Math.ceil(item.getBoundingClientRect().height));
    };
    const scheduleMeasure = () => {
      if (frameId === null) {
        frameId = window.requestAnimationFrame(measure);
      }
    };
    const clearFrame = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };

    if (typeof ResizeObserver === "undefined") {
      scheduleMeasure();
      return clearFrame;
    }

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(item);
    scheduleMeasure();

    return () => {
      observer.disconnect();
      clearFrame();
    };
  }, [bookmarkId, onHeightChange]);

  React.useEffect(() => {
    const item = itemRef.current;
    if (!item) {
      return undefined;
    }

    const syncStickyState = () => onStickyChange(bookmarkId, hasStickyState(item));
    item.addEventListener("toggle", syncStickyState, true);

    return () => {
      item.removeEventListener("toggle", syncStickyState, true);
    };
  }, [bookmarkId, onStickyChange]);

  const syncStickyStateAfterBlur = () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
    }

    blurTimeoutRef.current = window.setTimeout(() => {
      blurTimeoutRef.current = null;
      const item = itemRef.current;
      if (item) {
        onStickyChange(bookmarkId, hasStickyState(item));
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
      className="scraper-bookmarks-view__virtual-item"
      data-bookmark-id={bookmarkId}
      onFocusCapture={() => onStickyChange(bookmarkId, true)}
      onBlurCapture={syncStickyStateAfterBlur}
    >
      {renderBookmark(bookmark)}
    </div>
  );
}
