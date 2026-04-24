import React from "react";

type OcrPanelLayout = {
    top: number;
    height: number;
};

type Scrollport = {
    element: HTMLElement | Window;
    top: number;
    height: number;
};

const VIEWPORT_MARGIN = 16;

const defaultLayout: OcrPanelLayout = {
    top: VIEWPORT_MARGIN,
    height: 0,
};

const getViewportHeight = () => (
    window.visualViewport?.height
    ?? window.innerHeight
    ?? document.documentElement.clientHeight
);

const getScrollContainer = (
    anchor: HTMLElement | null,
    panel: HTMLElement | null,
) => (
    panel?.closest(".app-shell__content")
    ?? anchor?.closest(".app-shell__content")
    ?? null
);

const getScrollport = (
    anchor: HTMLElement | null,
    panel: HTMLElement | null,
): Scrollport => {
    const scrollContainer = getScrollContainer(anchor, panel);

    if (scrollContainer instanceof HTMLElement) {
        const rect = scrollContainer.getBoundingClientRect();

        return {
            element: scrollContainer,
            top: rect.top,
            height: rect.height,
        };
    }

    return {
        element: window,
        top: 0,
        height: getViewportHeight(),
    };
};

const getPanelLayout = (
    anchor: HTMLElement | null,
    panel: HTMLElement | null,
): OcrPanelLayout => {
    if (!anchor) {
        return defaultLayout;
    }

    const scrollport = getScrollport(anchor, panel);
    const anchorBottom = Math.ceil(anchor.getBoundingClientRect().bottom);
    const parentRect = panel?.parentElement?.getBoundingClientRect() ?? null;
    const panelStyle = panel ? window.getComputedStyle(panel) : null;
    const panelMarginTop = panelStyle ? parseFloat(panelStyle.marginTop || "0") : 0;
    const panelMarginBottom = panelStyle ? parseFloat(panelStyle.marginBottom || "0") : 0;
    const topLimit = Math.ceil(anchorBottom - scrollport.top);
    const stickyTop = topLimit > VIEWPORT_MARGIN && topLimit < scrollport.height - VIEWPORT_MARGIN
        ? topLimit
        : VIEWPORT_MARGIN;
    const naturalPanelTop = parentRect
        ? Math.ceil(parentRect.top - scrollport.top + panelMarginTop)
        : stickyTop;
    const bottomLimit = parentRect
        ? Math.min(scrollport.height - VIEWPORT_MARGIN, Math.floor(parentRect.bottom - scrollport.top - panelMarginBottom))
        : scrollport.height - VIEWPORT_MARGIN;
    const heightTop = Math.max(stickyTop, naturalPanelTop);
    const height = Math.max(0, Math.floor(bottomLimit - heightTop));

    return {
        top: stickyTop,
        height,
    };
};

const isSameLayout = (left: OcrPanelLayout, right: OcrPanelLayout) => (
    left.top === right.top && left.height === right.height
);

export default function useReaderOcrPanelLayout(
    anchorRef: React.RefObject<HTMLElement | null>,
    panelRef: React.RefObject<HTMLElement | null>,
): React.CSSProperties {
    const [layout, setLayout] = React.useState<OcrPanelLayout>(defaultLayout);

    React.useLayoutEffect(() => {
        let animationFrame: number | null = null;
        const scrollport = getScrollport(anchorRef.current, panelRef.current);

        const updateLayout = () => {
            animationFrame = null;
            const nextLayout = getPanelLayout(anchorRef.current, panelRef.current);
            setLayout((currentLayout) => (
                isSameLayout(currentLayout, nextLayout) ? currentLayout : nextLayout
            ));
        };

        const requestLayoutUpdate = () => {
            if (animationFrame !== null) {
                return;
            }

            animationFrame = window.requestAnimationFrame(updateLayout);
        };

        requestLayoutUpdate();

        scrollport.element.addEventListener("scroll", requestLayoutUpdate, { passive: true });
        window.addEventListener("scroll", requestLayoutUpdate, { passive: true });
        window.addEventListener("resize", requestLayoutUpdate);
        window.visualViewport?.addEventListener("scroll", requestLayoutUpdate);
        window.visualViewport?.addEventListener("resize", requestLayoutUpdate);

        const resizeObserver = typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(requestLayoutUpdate);

        if (resizeObserver) {
            if (anchorRef.current) {
                resizeObserver.observe(anchorRef.current);
            }

            if (anchorRef.current?.parentElement) {
                resizeObserver.observe(anchorRef.current.parentElement);
            }

            if (panelRef.current) {
                resizeObserver.observe(panelRef.current);
            }

            if (scrollport.element instanceof HTMLElement) {
                resizeObserver.observe(scrollport.element);
            }
        }

        return () => {
            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
            }

            scrollport.element.removeEventListener("scroll", requestLayoutUpdate);
            window.removeEventListener("scroll", requestLayoutUpdate);
            window.removeEventListener("resize", requestLayoutUpdate);
            window.visualViewport?.removeEventListener("scroll", requestLayoutUpdate);
            window.visualViewport?.removeEventListener("resize", requestLayoutUpdate);
            resizeObserver?.disconnect();
        };
    }, [anchorRef, panelRef]);

    return React.useMemo(() => ({
        "--reader-ocr-panel-top": `${layout.top}px`,
        "--reader-ocr-panel-height": `${layout.height}px`,
    } as React.CSSProperties), [layout]);
}
