import {
  app,
  BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  WebContentsView,
} from "electron";
import path from "path";
import { resolveScraperUrl } from "../scraper";
import { attachWindowStateListeners } from "./windowControls";
import { evaluateSelectorInView } from "./selectorAssistantEvaluation";
import { applySelectorAssistantValueToOwner } from "./selectorAssistantApplication";
import {
  loadInitialSelectorAssistantDocuments,
  loadSelectorAssistantRuntimeTarget,
} from "./selectorAssistantDocuments";
import {
  cancelSelectorAssistantNavigationRequests,
  getSelectorAssistantHostname,
  isSelectorAssistantUrlAllowed,
  resolveSelectorAssistantNavigationRequest,
  requestSelectorAssistantUrlPermission,
} from "./selectorAssistantNavigation";
import {
  attachSelectorPreviewSynchronization,
  configureSelectorPreviewNavigation,
  createSelectorAssistantSessionId,
  isOpenSelectorAssistantRequest,
  loadSelectorAssistantHostWindow,
} from "./selectorAssistantWindow.utils";
import {
  attachSelectorAssistantNavigationState,
  executeSelectorAssistantNavigation,
  getSelectorAssistantNavigationState as getNavigationState,
} from "./selectorAssistantHistory";
import type { SelectorAssistantWindowSession } from "./selectorAssistantSession";
import type {
  OpenSelectorAssistantRequest,
  SelectorAssistantEvaluationRequest,
  SelectorAssistantEvaluationResult,
  SelectorAssistantNavigationCommand,
  SelectorAssistantNavigationState,
  SelectorAssistantNavigationResponse,
  SelectorAssistantPageCommand,
  SelectorAssistantPageEvent,
  SelectorAssistantPreviewMode,
  SelectorAssistantSessionSnapshot,
} from "../../shared/selectorAssistant";
const sessions = new Map<string, SelectorAssistantWindowSession>();
const sessionIdByHostWebContentsId = new Map<number, string>();
const pageContextByWebContentsId = new Map<number, { sessionId: string; mode: SelectorAssistantPreviewMode }>();
const getSessionSnapshot = (session: SelectorAssistantWindowSession): SelectorAssistantSessionSnapshot => ({
  id: session.id,
  formSessionId: session.request.formSessionId,
  scraperName: session.request.scraperName,
  featureKind: session.request.featureKind,
  featureLabel: session.request.featureLabel,
  fields: session.request.fields,
  pageRequest: session.request.pageRequest,
  urlPattern: session.request.urlPattern,
  runtimeDocument: session.runtimeDocument,
  activeMode: session.activeMode,
});
const notifySessionUpdated = (session: SelectorAssistantWindowSession): void => {
  if (!session.window.isDestroyed()) {
    session.window.webContents.send("selector-assistant-session-updated", getSessionSnapshot(session));
  }
};


const cleanupSession = (session: SelectorAssistantWindowSession): void => {
  session.closed = true;
  cancelSelectorAssistantNavigationRequests(session);
  sessions.delete(session.id);
  sessionIdByHostWebContentsId.delete(session.hostWebContentsId);
  pageContextByWebContentsId.delete(session.runtimeWebContentsId);
  pageContextByWebContentsId.delete(session.interactiveWebContentsId);
};

const createSelectorAssistantWindow = (
  request: OpenSelectorAssistantRequest,
  ownerWebContentsId: number,
): SelectorAssistantWindowSession => {
  const basePath = app.getAppPath();
  const sessionId = createSelectorAssistantSessionId();
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    frame: false,
    backgroundColor: "#121212",
    show: false,
    webPreferences: {
      preload: path.join(basePath, "dist", "electron", "preload.js"),
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
  });
  const previewPreferences = {
    preload: path.join(basePath, "dist", "electron", "selectorPagePreload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  };
  const runtimeView = new WebContentsView({ webPreferences: previewPreferences });
  const interactiveView = new WebContentsView({ webPreferences: previewPreferences });
  const session: SelectorAssistantWindowSession = {
    id: sessionId,
    ownerWebContentsId,
    hostWebContentsId: window.webContents.id,
    runtimeWebContentsId: runtimeView.webContents.id,
    interactiveWebContentsId: interactiveView.webContents.id,
    request,
    window,
    runtimeView,
    interactiveView,
    activeMode: "runtime",
    documentsInitialized: false,
    allowedHostnames: new Set([getSelectorAssistantHostname(resolveScraperUrl(
      request.pageRequest.baseUrl,
      request.pageRequest.targetUrl,
    ))].filter(Boolean)),
    permissionRequests: new Map(),
    navigationResolvers: new Map(),
    denyFutureRedirects: false,
    closed: false,
  };
  session.onPermissionPromptVisibilityChange = (visible) => {
    if (window.isDestroyed()) return;
    runtimeView.setVisible(!visible && session.activeMode === "runtime");
    interactiveView.setVisible(!visible && session.activeMode === "interactive");
  };

  sessions.set(sessionId, session);
  sessionIdByHostWebContentsId.set(window.webContents.id, sessionId);
  pageContextByWebContentsId.set(runtimeView.webContents.id, { sessionId, mode: "runtime" });
  pageContextByWebContentsId.set(interactiveView.webContents.id, { sessionId, mode: "interactive" });
  window.contentView.addChildView(runtimeView);
  window.contentView.addChildView(interactiveView);
  runtimeView.setVisible(true);
  interactiveView.setVisible(false);
  configureSelectorPreviewNavigation(runtimeView, (url) => {
    void requestSelectorAssistantUrlPermission(session, url).then((allowed) => {
      if (allowed) {
        return loadSelectorAssistantRuntimeTarget(session, url, () => notifySessionUpdated(session))
          .then(() => interactiveView.webContents.loadURL(url));
      }
    });
  });
  configureSelectorPreviewNavigation(interactiveView, (url) => {
    void requestSelectorAssistantUrlPermission(session, url).then((allowed) => {
      if (allowed) void interactiveView.webContents.loadURL(url);
    });
  });
  attachSelectorPreviewSynchronization({
    runtimeView,
    interactiveView,
    isInitialized: () => session.documentsInitialized,
    getRuntimeUrl: () => session.runtimeUrl,
    loadRuntimeTarget: (url) => (
      loadSelectorAssistantRuntimeTarget(session, url, () => notifySessionUpdated(session))
    ),
    isUrlAllowed: (url) => isSelectorAssistantUrlAllowed(session, url),
    requestUrlPermission: (url) => requestSelectorAssistantUrlPermission(session, url),
  });
  attachSelectorAssistantNavigationState(session);
  attachWindowStateListeners(window);

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => cleanupSession(session));
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const currentUrl = window.webContents.getURL();
    try {
      if (new URL(url).origin !== new URL(currentUrl).origin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  void loadSelectorAssistantHostWindow(window, sessionId).catch((error) => {
    console.error("Failed to load selector assistant window", error);
    window.close();
  });

  return session;
};

const findOwnedSession = (event: IpcMainInvokeEvent, formSessionId: string): SelectorAssistantWindowSession | undefined => (
  Array.from(sessions.values()).find((session) => (
    session.ownerWebContentsId === event.sender.id
    && session.request.formSessionId === formSessionId
  ))
);

export const openSelectorAssistant = async (
  event: IpcMainInvokeEvent,
  value: unknown,
): Promise<string | null> => {
  if (!isOpenSelectorAssistantRequest(value)) {
    return null;
  }

  const existing = findOwnedSession(event, value.formSessionId);
  if (existing && !existing.window.isDestroyed()) {
    existing.window.focus();
    return existing.id;
  }

  const session = createSelectorAssistantWindow(value, event.sender.id);
  event.sender.once("destroyed", () => {
    if (!session.window.isDestroyed()) {
      session.window.close();
    }
  });
  void loadInitialSelectorAssistantDocuments(event, session, () => notifySessionUpdated(session)).catch((error) => {
    console.error("Failed to initialize selector assistant documents", error);
    notifySessionUpdated(session);
  });
  return session.id;
};

export const closeSelectorAssistant = (
  event: IpcMainInvokeEvent,
  formSessionId: unknown,
): boolean => {
  if (typeof formSessionId !== "string") {
    return false;
  }

  const session = findOwnedSession(event, formSessionId);
  if (!session || session.window.isDestroyed()) {
    return false;
  }

  session.window.close();
  return true;
};

const getHostSession = (event: IpcMainInvokeEvent): SelectorAssistantWindowSession | undefined => {
  const sessionId = sessionIdByHostWebContentsId.get(event.sender.id);
  return sessionId ? sessions.get(sessionId) : undefined;
};

export const getSelectorAssistantSession = (
  event: IpcMainInvokeEvent,
): SelectorAssistantSessionSnapshot | null => {
  const session = getHostSession(event);
  return session ? getSessionSnapshot(session) : null;
};

export const getSelectorAssistantNavigationState = (
  event: IpcMainInvokeEvent,
): SelectorAssistantNavigationState | null => {
  const session = getHostSession(event);
  return session ? getNavigationState(session) : null;
};

export const navigateSelectorAssistant = async (
  event: IpcMainInvokeEvent,
  value: unknown,
): Promise<boolean> => {
  const session = getHostSession(event);
  if (!session || !value || typeof value !== "object") return false;
  const command = value as Partial<SelectorAssistantNavigationCommand>;
  if (!["back", "forward", "reload", "navigate"].includes(command.type ?? "")) return false;
  if (command.type === "navigate" && typeof command.url !== "string") return false;
  return executeSelectorAssistantNavigation(session, command as SelectorAssistantNavigationCommand);
};

export const setSelectorAssistantBounds = (
  event: IpcMainInvokeEvent,
  bounds: unknown,
): boolean => {
  const session = getHostSession(event);
  if (!session || !bounds || typeof bounds !== "object") {
    return false;
  }

  const raw = bounds as Record<string, unknown>;
  const nextBounds = {
    x: Math.max(0, Math.round(Number(raw.x) || 0)),
    y: Math.max(0, Math.round(Number(raw.y) || 0)),
    width: Math.max(0, Math.round(Number(raw.width) || 0)),
    height: Math.max(0, Math.round(Number(raw.height) || 0)),
  };
  session.runtimeView.setBounds(nextBounds);
  session.interactiveView.setBounds(nextBounds);
  return true;
};

export const setSelectorAssistantMode = (
  event: IpcMainInvokeEvent,
  mode: unknown,
): boolean => {
  const session = getHostSession(event);
  if (!session || (mode !== "runtime" && mode !== "interactive")) {
    return false;
  }

  session.activeMode = mode;
  session.runtimeView.setVisible(mode === "runtime");
  session.interactiveView.setVisible(mode === "interactive");
  notifySessionUpdated(session);
  return true;
};

export const resolveSelectorAssistantNavigation = (
  event: IpcMainInvokeEvent,
  value: unknown,
): boolean => {
  const session = getHostSession(event);
  if (!session || !value || typeof value !== "object") return false;
  const candidate = value as Partial<SelectorAssistantNavigationResponse>;
  if (typeof candidate.requestId !== "string") return false;
  return resolveSelectorAssistantNavigationRequest(session, {
    requestId: candidate.requestId,
    allowed: candidate.allowed === true,
    denyFutureRedirects: candidate.denyFutureRedirects === true,
  });
};

const getSessionView = (
  session: SelectorAssistantWindowSession,
  mode: SelectorAssistantPreviewMode,
): WebContentsView => mode === "runtime" ? session.runtimeView : session.interactiveView;

export const sendSelectorAssistantPageCommand = (
  event: IpcMainInvokeEvent,
  mode: unknown,
  command: unknown,
): boolean => {
  const session = getHostSession(event);
  if (!session || (mode !== "runtime" && mode !== "interactive") || !command || typeof command !== "object") {
    return false;
  }

  getSessionView(session, mode).webContents.send(
    "selector-assistant-page-command",
    command as SelectorAssistantPageCommand,
  );
  return true;
};

export const evaluateSelectorAssistant = async (
  event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SelectorAssistantEvaluationResult> => {
  const session = getHostSession(event);
  const request = value as SelectorAssistantEvaluationRequest;
  if (!session || !request || (request.mode !== "runtime" && request.mode !== "interactive")) {
    return {
      ok: false,
      error: "Session d'assistant introuvable.",
      matchedCount: 0,
      positiveCount: 0,
      coveredPositiveCount: 0,
      negativeMatchCount: 0,
      values: [],
      elements: [],
      rejectedElements: [],
    };
  }

  return evaluateSelectorInView(getSessionView(session, request.mode), request);
};

export const applySelectorAssistantValue = (
  event: IpcMainInvokeEvent,
  value: unknown,
): boolean => applySelectorAssistantValueToOwner(getHostSession(event), value);

export const forwardSelectorAssistantPageEvent = (
  event: IpcMainEvent,
  value: unknown,
): void => {
  const context = pageContextByWebContentsId.get(event.sender.id);
  if (!context || !value || typeof value !== "object") {
    return;
  }

  const session = sessions.get(context.sessionId);
  if (!session || session.window.isDestroyed()) {
    return;
  }

  session.window.webContents.send("selector-assistant-page-event", {
    ...(value as SelectorAssistantPageEvent),
    mode: context.mode,
  } satisfies SelectorAssistantPageEvent);
};
