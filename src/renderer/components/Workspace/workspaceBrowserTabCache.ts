import type { ScraperBrowserInitialState } from "@/renderer/components/ScraperBrowser/types";
import type { ScraperRecord } from "@/shared/scraper";

export type WorkspaceBrowserTabCacheEntry = {
  targetKey: string;
  scraper: ScraperRecord;
  initialState: ScraperBrowserInitialState;
  resolvedTitle: string;
};

const workspaceBrowserTabCache = new Map<string, WorkspaceBrowserTabCacheEntry>();

export const readWorkspaceBrowserTabCache = (
  tabId: string,
  targetKey: string,
): WorkspaceBrowserTabCacheEntry | null => {
  const cachedEntry = workspaceBrowserTabCache.get(tabId);
  if (!cachedEntry || cachedEntry.targetKey !== targetKey) {
    return null;
  }

  return cachedEntry;
};

export const writeWorkspaceBrowserTabCache = (
  tabId: string,
  entry: WorkspaceBrowserTabCacheEntry,
): void => {
  workspaceBrowserTabCache.set(tabId, entry);
};

export const clearWorkspaceBrowserTabCache = (tabId: string): void => {
  workspaceBrowserTabCache.delete(tabId);
};
