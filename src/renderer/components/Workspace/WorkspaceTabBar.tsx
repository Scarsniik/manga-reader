import React, { useCallback, useEffect, useRef, useState } from "react";
import ChevronLeftIcon from "@/renderer/components/icons/chevron-left.svg?react";
import type { WorkspaceTab } from "@/renderer/types/workspace";

type Props = {
  activeTabId: string | null;
  tabs: WorkspaceTab[];
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
};

type ScrollAvailability = {
  backward: boolean;
  forward: boolean;
};

const SCROLL_EDGE_TOLERANCE = 2;

const preventMiddleClickDefault = (event: React.MouseEvent<HTMLElement>) => {
  if (event.button === 1) {
    event.preventDefault();
  }
};

export default function WorkspaceTabBar({
  activeTabId,
  tabs,
  onActivateTab,
  onCloseTab,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollAvailability, setScrollAvailability] = useState<ScrollAvailability>({
    backward: false,
    forward: false,
  });

  const updateScrollAvailability = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const backward = scroller.scrollLeft > SCROLL_EDGE_TOLERANCE;
    const forward = scroller.scrollLeft + scroller.clientWidth
      < scroller.scrollWidth - SCROLL_EDGE_TOLERANCE;

    setScrollAvailability((current) => (
      current.backward === backward && current.forward === forward
        ? current
        : { backward, forward }
    ));
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return undefined;
    }

    updateScrollAvailability();
    const resizeObserver = new ResizeObserver(updateScrollAvailability);
    resizeObserver.observe(scroller);
    return () => resizeObserver.disconnect();
  }, [tabs, updateScrollAvailability]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return undefined;
    }

    const handleWheel = (event: WheelEvent) => {
      const hasHorizontalOverflow = scroller.scrollWidth > scroller.clientWidth;
      const isVerticalGesture = Math.abs(event.deltaY) > Math.abs(event.deltaX);
      if (!hasHorizontalOverflow || !isVerticalGesture) {
        return;
      }

      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    const activeTab = scrollerRef.current?.querySelector<HTMLElement>(
      `[data-workspace-tab-id="${activeTabId}"]`,
    );
    activeTab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs]);

  const scrollTabs = useCallback((direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    scroller.scrollBy({
      behavior: "smooth",
      left: direction * Math.max(180, scroller.clientWidth * 0.65),
    });
  }, []);

  const handleTabAuxClick = useCallback((
    event: React.MouseEvent<HTMLElement>,
    tabId: string,
  ) => {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onCloseTab(tabId);
  }, [onCloseTab]);

  return (
    <div className="workspace-tabs-shell">
      <button
        type="button"
        className={[
          "workspace-tabs__scroll-button",
          "is-backward",
          scrollAvailability.backward ? "is-visible" : "",
        ].filter(Boolean).join(" ")}
        onClick={() => scrollTabs(-1)}
        aria-label="Faire défiler les onglets vers la gauche"
        disabled={!scrollAvailability.backward}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </button>

      <div
        ref={scrollerRef}
        className="workspace-tabs"
        role="tablist"
        aria-label="Onglets workspace"
        onScroll={updateScrollAvailability}
      >
        {tabs.length > 0 ? (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={[
                  "workspace-tab",
                  isActive ? "is-active" : "",
                  tab.isNew && !isActive ? "is-new" : "",
                ].filter(Boolean).join(" ")}
                role="tab"
                aria-selected={isActive}
                title={tab.isNew && !isActive ? `${tab.title} - Nouvel onglet` : tab.title}
                data-prevent-middle-click-autoscroll="true"
                data-workspace-tab-id={tab.id}
                onMouseDown={preventMiddleClickDefault}
                onAuxClick={(event) => handleTabAuxClick(event, tab.id)}
              >
                <button
                  type="button"
                  className="workspace-tab__button"
                  onClick={() => onActivateTab(tab.id)}
                  disabled={isActive}
                  aria-disabled={isActive}
                  title={tab.isNew && !isActive ? `${tab.title} - Nouvel onglet` : tab.title}
                >
                  <span className="workspace-tab__title">{tab.title}</span>
                  {tab.isNew && !isActive ? (
                    <span className="workspace-tab__new-badge">Nouveau</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="workspace-tab__close"
                  onClick={() => onCloseTab(tab.id)}
                  aria-label={`Fermer ${tab.title}`}
                  title="Fermer"
                >
                  X
                </button>
              </div>
            );
          })
        ) : (
          <div className="workspace-tabs__empty">Aucun onglet ouvert</div>
        )}
      </div>

      <button
        type="button"
        className={[
          "workspace-tabs__scroll-button",
          "is-forward",
          scrollAvailability.forward ? "is-visible" : "",
        ].filter(Boolean).join(" ")}
        onClick={() => scrollTabs(1)}
        aria-label="Faire défiler les onglets vers la droite"
        disabled={!scrollAvailability.forward}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </button>
    </div>
  );
}
