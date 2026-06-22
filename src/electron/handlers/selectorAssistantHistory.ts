import type { SelectorAssistantWindowSession } from "./selectorAssistantSession";
import {
  isSelectorAssistantHttpUrl,
} from "./selectorAssistantWindow.utils";
import {
  requestSelectorAssistantUrlPermission,
} from "./selectorAssistantNavigation";
import { resolveScraperUrl } from "../scraper";
import type {
  SelectorAssistantNavigationCommand,
  SelectorAssistantNavigationState,
} from "../../shared/selectorAssistant";

const getInitialUrl = (session: SelectorAssistantWindowSession): string => resolveScraperUrl(
  session.request.pageRequest.baseUrl,
  session.request.pageRequest.targetUrl,
);

export const getSelectorAssistantNavigationState = (
  session: SelectorAssistantWindowSession,
): SelectorAssistantNavigationState => {
  const webContents = session.interactiveView.webContents;
  const loadedUrl = webContents.getURL();
  return {
    currentUrl: isSelectorAssistantHttpUrl(loadedUrl) ? loadedUrl : session.runtimeUrl ?? getInitialUrl(session),
    canGoBack: webContents.navigationHistory.canGoBack(),
    canGoForward: webContents.navigationHistory.canGoForward(),
    loading: webContents.isLoading(),
  };
};

export const notifySelectorAssistantNavigationState = (
  session: SelectorAssistantWindowSession,
): void => {
  if (session.closed || session.window.isDestroyed()) return;
  session.window.webContents.send(
    "selector-assistant-navigation-state",
    getSelectorAssistantNavigationState(session),
  );
};

export const attachSelectorAssistantNavigationState = (
  session: SelectorAssistantWindowSession,
): void => {
  const webContents = session.interactiveView.webContents;
  webContents.on("did-navigate", () => notifySelectorAssistantNavigationState(session));
  webContents.on("did-navigate-in-page", () => notifySelectorAssistantNavigationState(session));
  webContents.on("did-start-loading", () => notifySelectorAssistantNavigationState(session));
  webContents.on("did-stop-loading", () => notifySelectorAssistantNavigationState(session));
};

const resolveNavigationUrl = (session: SelectorAssistantWindowSession, rawUrl: string): string | null => {
  const value = rawUrl.trim();
  if (!value) return null;
  const baseUrl = getSelectorAssistantNavigationState(session).currentUrl || getInitialUrl(session);
  const candidate = /^[\w-]+(?:\.[\w-]+)+(?:[/:?#]|$)/i.test(value) ? `https://${value}` : value;
  try {
    const resolved = new URL(candidate, baseUrl).toString();
    return isSelectorAssistantHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
};

export const executeSelectorAssistantNavigation = async (
  session: SelectorAssistantWindowSession,
  command: SelectorAssistantNavigationCommand,
): Promise<boolean> => {
  const webContents = session.interactiveView.webContents;
  if (command.type === "back") {
    if (!webContents.navigationHistory.canGoBack()) return false;
    webContents.navigationHistory.goBack();
    return true;
  }
  if (command.type === "forward") {
    if (!webContents.navigationHistory.canGoForward()) return false;
    webContents.navigationHistory.goForward();
    return true;
  }
  if (command.type === "reload") {
    webContents.reload();
    return true;
  }

  const targetUrl = resolveNavigationUrl(session, command.url);
  if (!targetUrl || !await requestSelectorAssistantUrlPermission(session, targetUrl)) return false;
  await webContents.loadURL(targetUrl);
  return true;
};
