import React from "react";

type Params = {
  canLoadMore: boolean;
  keyboardScrollSpeed: number;
  loadingMore: boolean;
  onLoadMore: () => Promise<void>;
  resetKey: string;
  vertical: boolean;
};

type QuickReviewThumbnailScroll = {
  scrollRef: React.RefObject<HTMLDivElement>;
  scrollThumbnails: (direction: -1 | 1) => void;
};

const END_DOUBLE_PRESS_DELAY_MS = 550;
const EDGE_TOLERANCE_PX = 2;
const MAX_ANIMATION_FRAME_DURATION_MS = 50;

const getScrollPosition = (container: HTMLDivElement, vertical: boolean): number => (
  vertical ? container.scrollTop : container.scrollLeft
);

const setScrollPosition = (
  container: HTMLDivElement,
  vertical: boolean,
  position: number,
) => {
  if (vertical) container.scrollTop = position;
  else container.scrollLeft = position;
};

const getMaximumScroll = (container: HTMLDivElement, vertical: boolean): number => Math.max(
  0,
  vertical
    ? container.scrollHeight - container.clientHeight
    : container.scrollWidth - container.clientWidth,
);

const getScrollStops = (
  container: HTMLDivElement,
  vertical: boolean,
  scrollPosition: number,
): number[] => {
  const containerRect = container.getBoundingClientRect();
  const positions = Array.from(container.children)
    .filter((child): child is HTMLElement => (
      child instanceof HTMLElement && child.offsetParent !== null
    ))
    .map((child) => {
      const childRect = child.getBoundingClientRect();
      return scrollPosition + (vertical
        ? childRect.top - containerRect.top
        : childRect.left - containerRect.left);
    })
    .sort((first, second) => first - second);

  return positions.filter((position, index) => (
    index === 0 || position - positions[index - 1] > EDGE_TOLERANCE_PX
  ));
};

export default function useQuickReviewThumbnailScroll({
  canLoadMore,
  keyboardScrollSpeed,
  loadingMore,
  onLoadMore,
  resetKey,
  vertical,
}: Params): QuickReviewThumbnailScroll {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const animationFrameTimeRef = React.useRef<number | null>(null);
  const targetRef = React.useRef<number | null>(null);
  const lastBlockedNextPressRef = React.useRef<number | null>(null);
  const latestParamsRef = React.useRef({
    canLoadMore,
    keyboardScrollSpeed,
    loadingMore,
    onLoadMore,
    vertical,
  });
  latestParamsRef.current = {
    canLoadMore,
    keyboardScrollSpeed,
    loadingMore,
    onLoadMore,
    vertical,
  };

  const cancelAnimation = React.useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = null;
    animationFrameTimeRef.current = null;
    targetRef.current = null;
  }, []);

  const animate = React.useCallback((now: number) => {
    const container = scrollRef.current;
    const target = targetRef.current;
    if (!container || target === null) {
      cancelAnimation();
      return;
    }

    const currentParams = latestParamsRef.current;
    const maximumScroll = getMaximumScroll(container, currentParams.vertical);
    const clampedTarget = Math.max(0, Math.min(maximumScroll, target));
    const currentPosition = getScrollPosition(container, currentParams.vertical);
    const remainingDistance = clampedTarget - currentPosition;
    if (Math.abs(remainingDistance) <= EDGE_TOLERANCE_PX) {
      setScrollPosition(container, currentParams.vertical, clampedTarget);
      animationFrameRef.current = null;
      animationFrameTimeRef.current = null;
      targetRef.current = null;
      return;
    }

    const previousFrameTime = animationFrameTimeRef.current ?? now;
    const frameDuration = Math.min(
      MAX_ANIMATION_FRAME_DURATION_MS,
      Math.max(0, now - previousFrameTime),
    );
    const frameDistance = (currentParams.keyboardScrollSpeed * frameDuration) / 1000;
    const nextPosition = currentPosition + (
      Math.sign(remainingDistance) * Math.min(Math.abs(remainingDistance), frameDistance)
    );
    setScrollPosition(container, currentParams.vertical, nextPosition);
    animationFrameTimeRef.current = now;
    animationFrameRef.current = window.requestAnimationFrame(animate);
  }, [cancelAnimation]);

  const scrollThumbnails = React.useCallback((direction: -1 | 1) => {
    const container = scrollRef.current;
    if (!container) return;

    const currentParams = latestParamsRef.current;
    const scrollPosition = getScrollPosition(container, currentParams.vertical);
    const queuedScrollPosition = targetRef.current ?? scrollPosition;
    const maximumScroll = getMaximumScroll(container, currentParams.vertical);
    const reachedEdge = direction > 0
      ? queuedScrollPosition >= maximumScroll - EDGE_TOLERANCE_PX
      : queuedScrollPosition <= EDGE_TOLERANCE_PX;

    if (reachedEdge) {
      if (direction > 0 && currentParams.canLoadMore && !currentParams.loadingMore) {
        const now = performance.now();
        const previousBlockedPress = lastBlockedNextPressRef.current;
        if (
          previousBlockedPress !== null
          && now - previousBlockedPress <= END_DOUBLE_PRESS_DELAY_MS
        ) {
          lastBlockedNextPressRef.current = null;
          void currentParams.onLoadMore();
        } else {
          lastBlockedNextPressRef.current = now;
        }
      } else {
        lastBlockedNextPressRef.current = null;
      }
      return;
    }

    lastBlockedNextPressRef.current = null;
    const scrollStops = getScrollStops(container, currentParams.vertical, scrollPosition);
    const targetStop = direction > 0
      ? scrollStops.find((position) => position > queuedScrollPosition + EDGE_TOLERANCE_PX)
        ?? maximumScroll
      : [...scrollStops].reverse().find(
        (position) => position < queuedScrollPosition - EDGE_TOLERANCE_PX,
      ) ?? 0;
    targetRef.current = Math.max(0, Math.min(maximumScroll, targetStop));

    // Keep the active frame loop alive when more inputs arrive. Restarting an eased animation
    // here made every consecutive key press visibly brake before moving again.
    if (animationFrameRef.current !== null) return;
    animationFrameTimeRef.current = performance.now();
    animationFrameRef.current = window.requestAnimationFrame(animate);
  }, [animate]);

  React.useLayoutEffect(() => {
    cancelAnimation();
    lastBlockedNextPressRef.current = null;
  }, [cancelAnimation, resetKey, vertical]);

  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container) return undefined;
    const stopKeyboardAnimation = () => cancelAnimation();
    container.addEventListener("wheel", stopKeyboardAnimation, { passive: true });
    container.addEventListener("pointerdown", stopKeyboardAnimation);
    return () => {
      container.removeEventListener("wheel", stopKeyboardAnimation);
      container.removeEventListener("pointerdown", stopKeyboardAnimation);
    };
  }, [cancelAnimation, resetKey, vertical]);

  React.useEffect(() => cancelAnimation, [cancelAnimation]);

  return { scrollRef, scrollThumbnails };
}
