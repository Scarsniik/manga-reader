import type { BrowserWindow } from "electron";
import type {
  SelectorAssistantNavigationRequest,
  SelectorAssistantNavigationResponse,
} from "../../shared/selectorAssistant";

export type SelectorAssistantNavigationSession = {
  window: BrowserWindow;
  allowedHostnames: Set<string>;
  permissionRequests: Map<string, Promise<boolean>>;
  navigationResolvers: Map<string, (response: SelectorAssistantNavigationResponse) => void>;
  denyFutureRedirects: boolean;
  onPermissionPromptVisibilityChange?: (visible: boolean) => void;
};

export const getSelectorAssistantHostname = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

export const isSelectorAssistantUrlAllowed = (
  session: SelectorAssistantNavigationSession,
  url: string,
): boolean => {
  const hostname = getSelectorAssistantHostname(url);
  return Boolean(hostname && session.allowedHostnames.has(hostname));
};

const createNavigationRequestId = (): string => (
  `navigation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);

export const requestSelectorAssistantUrlPermission = (
  session: SelectorAssistantNavigationSession,
  url: string,
): Promise<boolean> => {
  if (session.window.isDestroyed()) return Promise.resolve(false);
  const hostname = getSelectorAssistantHostname(url);
  if (!hostname) return Promise.resolve(false);
  if (session.allowedHostnames.has(hostname)) return Promise.resolve(true);
  if (session.denyFutureRedirects) return Promise.resolve(false);

  const pendingRequest = session.permissionRequests.get(hostname);
  if (pendingRequest) return pendingRequest;

  const requestId = createNavigationRequestId();
  const request = new Promise<boolean>((resolve) => {
    session.navigationResolvers.set(requestId, (response) => {
      if (response.allowed) session.allowedHostnames.add(hostname);
      if (response.denyFutureRedirects) session.denyFutureRedirects = true;
      session.navigationResolvers.delete(requestId);
      resolve(response.allowed);
      if (session.navigationResolvers.size === 0) {
        session.onPermissionPromptVisibilityChange?.(false);
      }
    });
    session.onPermissionPromptVisibilityChange?.(true);
    session.window.webContents.send("selector-assistant-navigation-request", {
      requestId,
      hostname,
      currentHostnames: Array.from(session.allowedHostnames),
    } satisfies SelectorAssistantNavigationRequest);
  }).finally(() => {
    session.permissionRequests.delete(hostname);
  });

  session.permissionRequests.set(hostname, request);
  return request;
};

export const resolveSelectorAssistantNavigationRequest = (
  session: SelectorAssistantNavigationSession,
  response: SelectorAssistantNavigationResponse,
): boolean => {
  const resolve = session.navigationResolvers.get(response.requestId);
  if (!resolve) return false;
  resolve(response);
  return true;
};

export const cancelSelectorAssistantNavigationRequests = (
  session: SelectorAssistantNavigationSession,
): void => {
  Array.from(session.navigationResolvers.values()).forEach((resolve) => resolve({
    requestId: "closed",
    allowed: false,
    denyFutureRedirects: false,
  }));
  session.navigationResolvers.clear();
  session.onPermissionPromptVisibilityChange?.(false);
};
