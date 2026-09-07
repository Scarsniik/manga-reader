import React, {
  type AriaRole,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "@/renderer/components/AdaptiveDropdown/style.scss";

export type AdaptiveDropdownPlacement = "down" | "up";

type DropdownControls = {
  close: () => void;
  contentId: string;
  isOpen: boolean;
  placement: AdaptiveDropdownPlacement;
  setTriggerRef: (element: HTMLElement | null) => void;
  toggle: () => void;
};

type Props = {
  children: ReactNode | ((controls: DropdownControls) => ReactNode);
  className?: string;
  contentClassName?: string;
  contentRole?: AriaRole;
  gap?: number;
  horizontalBoundarySelector?: string;
  matchTriggerWidth?: boolean;
  maxHeight?: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  preferredPlacement?: AdaptiveDropdownPlacement;
  portal?: boolean;
  portalZIndex?: number;
  renderTrigger: (controls: DropdownControls) => ReactNode;
  style?: CSSProperties;
  viewportPadding?: number;
};

type DropdownLayout = {
  availableHeight: number | null;
  availableWidth: number | null;
  horizontalShift: number;
  placement: AdaptiveDropdownPlacement;
  portalBottom: number | null;
  portalLeft: number | null;
  portalTop: number | null;
  triggerWidth: number | null;
};

const DEFAULT_VIEWPORT_PADDING = 8;

const joinClassNames = (...classNames: Array<string | undefined>): string => (
  classNames.filter(Boolean).join(" ")
);

export default function AdaptiveDropdown({
  children,
  className,
  contentClassName,
  contentRole,
  gap = 0,
  horizontalBoundarySelector,
  matchTriggerWidth = false,
  maxHeight,
  onOpenChange,
  open,
  preferredPlacement = "down",
  portal = false,
  portalZIndex = 9000,
  renderTrigger,
  style,
  viewportPadding = DEFAULT_VIEWPORT_PADDING,
}: Props) {
  const contentId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [layout, setLayout] = useState<DropdownLayout>({
    availableHeight: null,
    availableWidth: null,
    horizontalShift: 0,
    placement: preferredPlacement,
    portalBottom: null,
    portalLeft: null,
    portalTop: null,
    triggerWidth: null,
  });

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const toggle = useCallback(() => onOpenChange(!open), [onOpenChange, open]);
  const setTriggerRef = useCallback((element: HTMLElement | null) => {
    triggerRef.current = element;
  }, []);

  const updateLayout = useCallback(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!open || !root || !content) {
      return;
    }

    const rootRect = (triggerRef.current ?? root).getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const horizontalBoundary = horizontalBoundarySelector
      ? root.closest(horizontalBoundarySelector)
      : null;
    const horizontalBoundaryRect = horizontalBoundary?.getBoundingClientRect();
    const horizontalLeft = Math.max(
      viewportPadding,
      horizontalBoundaryRect?.left ?? viewportPadding,
    );
    const horizontalRight = Math.min(
      window.innerWidth - viewportPadding,
      horizontalBoundaryRect?.right ?? window.innerWidth - viewportPadding,
    );
    const availableWidth = Math.max(0, Math.floor(horizontalRight - horizontalLeft));
    const triggerWidth = Math.min(Math.floor(rootRect.width), availableWidth);
    const availableDown = Math.max(
      0,
      window.innerHeight - rootRect.bottom - gap - viewportPadding,
    );
    const availableUp = Math.max(0, rootRect.top - gap - viewportPadding);
    const desiredHeight = Math.min(
      Math.max(content.scrollHeight, contentRect.height),
      maxHeight ?? Number.POSITIVE_INFINITY,
    );
    const preferredAvailable = preferredPlacement === "down" ? availableDown : availableUp;
    const placement = desiredHeight <= preferredAvailable
      ? preferredPlacement
      : preferredPlacement === "down" ? "up" : "down";
    const availableHeight = Math.floor(placement === "down" ? availableDown : availableUp);

    const unshiftedLeft = portal
      ? rootRect.left
      : contentRect.left - layout.horizontalShift;
    const unshiftedRight = unshiftedLeft + Math.min(contentRect.width, availableWidth);
    let horizontalShift = 0;
    if (unshiftedLeft < horizontalLeft) {
      horizontalShift = horizontalLeft - unshiftedLeft;
    } else if (unshiftedRight > horizontalRight) {
      horizontalShift = horizontalRight - unshiftedRight;
    }

    setLayout((current) => (
      current.placement === placement
      && current.availableHeight === availableHeight
      && current.availableWidth === availableWidth
      && current.horizontalShift === horizontalShift
      && current.portalBottom === (
        portal && placement === "up" ? window.innerHeight - rootRect.top + gap : null
      )
      && current.portalLeft === (portal ? rootRect.left + horizontalShift : null)
      && current.portalTop === (portal && placement === "down" ? rootRect.bottom + gap : null)
      && current.triggerWidth === triggerWidth
        ? current
        : {
          availableHeight,
          availableWidth,
          horizontalShift,
          placement,
          portalBottom: portal && placement === "up"
            ? window.innerHeight - rootRect.top + gap
            : null,
          portalLeft: portal ? rootRect.left + horizontalShift : null,
          portalTop: portal && placement === "down" ? rootRect.bottom + gap : null,
          triggerWidth,
        }
    ));
  }, [
    gap,
    horizontalBoundarySelector,
    layout.horizontalShift,
    maxHeight,
    open,
    portal,
    preferredPlacement,
    viewportPadding,
  ]);

  const scheduleLayoutUpdate = useCallback(() => {
    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      updateLayout();
    });
  }, [updateLayout]);

  useLayoutEffect(() => {
    if (!open) {
      setLayout({
        availableHeight: null,
        availableWidth: null,
        horizontalShift: 0,
        placement: preferredPlacement,
        portalBottom: null,
        portalLeft: null,
        portalTop: null,
        triggerWidth: null,
      });
      return undefined;
    }

    updateLayout();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleLayoutUpdate);
    if (rootRef.current) {
      resizeObserver?.observe(rootRef.current);
    }
    if (contentRef.current) {
      resizeObserver?.observe(contentRef.current);
    }
    const horizontalBoundary = horizontalBoundarySelector
      ? rootRef.current?.closest(horizontalBoundarySelector)
      : null;
    if (horizontalBoundary) {
      resizeObserver?.observe(horizontalBoundary);
    }

    window.addEventListener("resize", scheduleLayoutUpdate);
    window.addEventListener("scroll", scheduleLayoutUpdate, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleLayoutUpdate);
      window.removeEventListener("scroll", scheduleLayoutUpdate, true);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    horizontalBoundarySelector,
    open,
    preferredPlacement,
    scheduleLayoutUpdate,
    updateLayout,
  ]);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node
        && !rootRef.current?.contains(event.target)
        && !contentRef.current?.contains(event.target)
      ) {
        close();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      close();
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [close, open]);

  useLayoutEffect(() => {
    rootRef.current?.dispatchEvent(new Event("toggle", { bubbles: true }));
  }, [open]);

  const controls: DropdownControls = {
    close,
    contentId,
    isOpen: open,
    placement: layout.placement,
    setTriggerRef,
    toggle,
  };
  const availableMaxHeight = layout.availableHeight === null
    ? maxHeight
    : Math.min(maxHeight ?? Number.POSITIVE_INFINITY, layout.availableHeight);
  const contentStyle: CSSProperties = {
    bottom: portal
      ? layout.portalBottom === null ? "auto" : `${layout.portalBottom}px`
      : layout.placement === "up" ? `calc(100% + ${gap}px)` : "auto",
    left: portal
      ? layout.portalLeft === null ? "0" : `${layout.portalLeft}px`
      : undefined,
    maxWidth: layout.availableWidth === null
      ? `calc(100vw - ${viewportPadding * 2}px)`
      : `${layout.availableWidth}px`,
    maxHeight: availableMaxHeight === undefined ? undefined : `${availableMaxHeight}px`,
    overflowY: "auto",
    position: portal ? "fixed" : undefined,
    top: portal
      ? layout.portalTop === null ? "auto" : `${layout.portalTop}px`
      : layout.placement === "down" ? `calc(100% + ${gap}px)` : "auto",
    translate: !portal && layout.horizontalShift ? `${layout.horizontalShift}px 0` : undefined,
    visibility: portal && layout.portalLeft === null ? "hidden" : undefined,
    width: matchTriggerWidth && layout.triggerWidth !== null
      ? `${layout.triggerWidth}px`
      : undefined,
    zIndex: portal ? portalZIndex : undefined,
  };
  const content = open ? (
    <div
      ref={contentRef}
      id={contentId}
      className={joinClassNames("adaptive-dropdown__content", contentClassName)}
      data-placement={layout.placement}
      role={contentRole}
      style={contentStyle}
    >
      {typeof children === "function" ? children(controls) : children}
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={joinClassNames("adaptive-dropdown", className)}
      data-adaptive-dropdown-open={open ? "true" : undefined}
      data-placement={layout.placement}
      style={style}
    >
      {renderTrigger(controls)}
      {portal && content && typeof document !== "undefined"
        ? createPortal(content, document.body)
        : content}
    </div>
  );
}
