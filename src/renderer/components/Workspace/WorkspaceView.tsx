import React, { useCallback, useEffect, useState } from "react";
import WorkspaceTargetPanel from "@/renderer/components/Workspace/WorkspaceTargetPanel";
import { clearWorkspaceBrowserTabCache } from "@/renderer/components/Workspace/workspaceBrowserTabCache";
import type { WorkspaceTab, WorkspaceTarget } from "@/renderer/types/workspace";
import "@/renderer/components/Workspace/style.scss";

type WorkspaceApi = {
  closeWindow?: () => Promise<void>;
  onWorkspaceOpenTarget?: (
    callback: (target: WorkspaceTarget, options?: WorkspaceOpenTargetOptions) => void,
  ) => () => void;
};

type WorkspaceOpenTargetOptions = {
  activate?: boolean;
};

type ReplaceTabTargetOptions = {
  returnTarget?: WorkspaceTarget;
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

  if (target.kind === "manga-manager.view") {
    return "Vue";
  }

  if (target.kind === "reader") {
    return "Lecteur";
  }

  if (target.kind === "scraper.details") {
    return "Fiche scraper";
  }

  if (target.kind === "scraper.author") {
    return "Page auteur";
  }

  if (target.kind === "scraper.tag") {
    return "Page tag";
  }

  return "Onglet";
};

const createWorkspaceTab = (target: WorkspaceTarget, isNew: boolean): WorkspaceTab => {
  tabSequence += 1;
  return {
    id: `workspace-tab-${Date.now()}-${tabSequence}`,
    isNew,
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

  const activateTab = useCallback((tabId: string) => {
    updateTabs(storedTabs.map((tab) => (
      tab.id === tabId ? { ...tab, isNew: false } : tab
    )));
    updateActiveTabId(tabId);
  }, [updateActiveTabId, updateTabs]);

  const openTarget = useCallback((target: WorkspaceTarget, options?: WorkspaceOpenTargetOptions) => {
    const shouldActivate = options?.activate !== false || storedActiveTabId === null;
    const nextTab = createWorkspaceTab(target, !shouldActivate);
    updateTabs([...storedTabs, nextTab]);
    if (shouldActivate) {
      updateActiveTabId(nextTab.id);
    }
  }, [updateActiveTabId, updateTabs]);

  const replaceTabTarget = useCallback((
    tabId: string,
    target: WorkspaceTarget,
    options?: ReplaceTabTargetOptions,
  ) => {
    const currentTab = storedTabs.find((tab) => tab.id === tabId);
    if (!currentTab) {
      return;
    }

    updateTabs(storedTabs.map((tab) => (
      tab.id === tabId
        ? {
          ...tab,
          isNew: false,
          returnTarget: options?.returnTarget,
          target,
          title: getTargetTitle(target),
        }
        : tab
    )));
    updateActiveTabId(tabId);
  }, [updateActiveTabId, updateTabs]);

  useEffect(() => {
    const api = getWorkspaceApi();
    return api.onWorkspaceOpenTarget?.(openTarget);
  }, [openTarget]);

  const handleCloseTab = useCallback((tabId: string) => {
    const closingIndex = storedTabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) {
      return;
    }

    clearWorkspaceBrowserTabCache(tabId);
    let nextTabs = storedTabs.filter((tab) => tab.id !== tabId);

    if (nextTabs.length === 0) {
      updateTabs(nextTabs);
      updateActiveTabId(null);
      void getWorkspaceApi().closeWindow?.().catch(() => undefined);
      return;
    }

    if (storedActiveTabId !== tabId) {
      updateTabs(nextTabs);
      return;
    }

    const nextActiveTab = nextTabs[Math.min(closingIndex, nextTabs.length - 1)] || null;
    if (nextActiveTab) {
      nextTabs = nextTabs.map((tab) => (
        tab.id === nextActiveTab.id ? { ...tab, isNew: false } : tab
      ));
    }
    updateTabs(nextTabs);
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
                className={[
                  "workspace-tab",
                  isActive ? "is-active" : "",
                  tab.isNew && !isActive ? "is-new" : "",
                ].filter(Boolean).join(" ")}
                role="tab"
                aria-selected={isActive}
                title={tab.isNew && !isActive ? `${tab.title} - Nouvel onglet` : tab.title}
                data-prevent-middle-click-autoscroll="true"
                onMouseDown={preventMiddleClickDefault}
                onAuxClick={(event) => handleTabAuxClick(event, tab.id)}
              >
                <button
                  type="button"
                  className="workspace-tab__button"
                  onClick={() => activateTab(tab.id)}
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
        {tabs.length > 0 ? (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={["workspace-tab-panel", isActive ? "is-active" : ""].filter(Boolean).join(" ")}
                role="tabpanel"
                hidden={!isActive}
              >
                <WorkspaceTargetPanel
                  returnTarget={tab.returnTarget}
                  tabId={tab.id}
                  target={tab.target}
                  onTitleChange={handleTitleChange}
                  onReplaceTarget={replaceTabTarget}
                />
              </div>
            );
          })
        ) : (
          <div className="workspace-placeholder">
            Ouvre un element avec le clic molette pour l'ajouter ici.
          </div>
        )}
      </div>
    </section>
  );
}
