import React, { useCallback, useEffect, useMemo, useState } from "react";
import WorkspaceTargetPanel from "@/renderer/components/Workspace/WorkspaceTargetPanel";
import { clearWorkspaceBrowserTabCache } from "@/renderer/components/Workspace/workspaceBrowserTabCache";
import type { WorkspaceTab, WorkspaceTarget } from "@/renderer/types/workspace";
import "@/renderer/components/Workspace/style.scss";

type WorkspaceApi = {
  closeWindow?: () => Promise<void>;
  onWorkspaceOpenTarget?: (callback: (target: WorkspaceTarget) => void) => () => void;
};

let storedTabs: WorkspaceTab[] = [];
let storedActiveTabId: string | null = null;
let tabSequence = 0;

const getWorkspaceApi = (): WorkspaceApi => (
  (window.api ?? {}) as WorkspaceApi
);

const getTargetTitle = (target: WorkspaceTarget): string => {
  if (target.title?.trim()) {
    return target.title.trim();
  }

  if (target.kind === "scraper.config") {
    return "Configuration scraper";
  }

  if (target.kind === "scraper.details") {
    return "Fiche scraper";
  }

  if (target.kind === "scraper.author") {
    return "Page auteur";
  }

  return "Onglet";
};

const createWorkspaceTab = (target: WorkspaceTarget): WorkspaceTab => {
  tabSequence += 1;
  return {
    id: `workspace-tab-${Date.now()}-${tabSequence}`,
    target,
    title: getTargetTitle(target),
  };
};

const preventMiddleClickDefault = (event: React.MouseEvent<HTMLElement>) => {
  if (event.button !== 1) {
    return;
  }

  event.preventDefault();
};

export default function WorkspaceView() {
  const [tabs, setTabsState] = useState<WorkspaceTab[]>(storedTabs);
  const [activeTabId, setActiveTabIdState] = useState<string | null>(storedActiveTabId);

  const updateTabs = useCallback((nextTabs: WorkspaceTab[]) => {
    storedTabs = nextTabs;
    setTabsState(nextTabs);
  }, []);

  const updateActiveTabId = useCallback((nextTabId: string | null) => {
    storedActiveTabId = nextTabId;
    setActiveTabIdState(nextTabId);
  }, []);

  const openTarget = useCallback((target: WorkspaceTarget) => {
    const nextTab = createWorkspaceTab(target);
    updateTabs([...storedTabs, nextTab]);
    updateActiveTabId(nextTab.id);
  }, [updateActiveTabId, updateTabs]);

  useEffect(() => {
    const api = getWorkspaceApi();
    return api.onWorkspaceOpenTarget?.(openTarget);
  }, [openTarget]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || null,
    [activeTabId, tabs],
  );

  const handleCloseTab = useCallback((tabId: string) => {
    const closingIndex = storedTabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) {
      return;
    }

    clearWorkspaceBrowserTabCache(tabId);
    const nextTabs = storedTabs.filter((tab) => tab.id !== tabId);
    updateTabs(nextTabs);

    if (nextTabs.length === 0) {
      updateActiveTabId(null);
      void getWorkspaceApi().closeWindow?.().catch(() => undefined);
      return;
    }

    if (storedActiveTabId !== tabId) {
      return;
    }

    const nextActiveTab = nextTabs[Math.min(closingIndex, nextTabs.length - 1)] || null;
    updateActiveTabId(nextActiveTab?.id ?? null);
  }, [updateActiveTabId, updateTabs]);

  const handleTitleChange = useCallback((tabId: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    const currentTab = storedTabs.find((tab) => tab.id === tabId);
    if (!currentTab || currentTab.title === trimmedTitle) {
      return;
    }

    const nextTabs = storedTabs.map((tab) => (
      tab.id === tabId ? { ...tab, title: trimmedTitle } : tab
    ));
    updateTabs(nextTabs);
  }, [updateTabs]);

  const handleActiveTabTitleChange = useCallback((title: string) => {
    if (!activeTabId) {
      return;
    }

    handleTitleChange(activeTabId, title);
  }, [activeTabId, handleTitleChange]);

  const handleTabAuxClick = useCallback((event: React.MouseEvent<HTMLElement>, tabId: string) => {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleCloseTab(tabId);
  }, [handleCloseTab]);

  return (
    <section className="workspace-view">
      <div className="workspace-tabs" role="tablist" aria-label="Onglets workspace">
        {tabs.length > 0 ? (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={["workspace-tab", isActive ? "is-active" : ""].filter(Boolean).join(" ")}
                role="tab"
                aria-selected={isActive}
                title={tab.title}
                data-prevent-middle-click-autoscroll="true"
                onMouseDown={preventMiddleClickDefault}
                onAuxClick={(event) => handleTabAuxClick(event, tab.id)}
              >
                <button
                  type="button"
                  className="workspace-tab__button"
                  onClick={() => updateActiveTabId(tab.id)}
                  disabled={isActive}
                  aria-disabled={isActive}
                  title={tab.title}
                >
                  {tab.title}
                </button>
                <button
                  type="button"
                  className="workspace-tab__close"
                  onClick={() => handleCloseTab(tab.id)}
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

      <div className="workspace-view__body">
        {activeTab ? (
          <WorkspaceTargetPanel
            key={activeTab.id}
            tabId={activeTab.id}
            target={activeTab.target}
            onTitleChange={handleActiveTabTitleChange}
          />
        ) : (
          <div className="workspace-placeholder">
            Ouvre un element avec le clic molette pour l'ajouter ici.
          </div>
        )}
      </div>
    </section>
  );
}
