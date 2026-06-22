import {
  app,
  type BrowserWindow,
  type LoadURLOptions,
  type WebContentsView,
} from "electron";
import path from "path";
import { buildScraperFetchInit, sanitizeRequestConfig } from "./scrapers/shared";
import { SCRAPER_DOCUMENT_ACCEPT } from "./scrapers/documentFetch";
import type { OpenSelectorAssistantRequest } from "../../shared/selectorAssistant";

export const isOpenSelectorAssistantRequest = (value: unknown): value is OpenSelectorAssistantRequest => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<OpenSelectorAssistantRequest>;
  return Boolean(
    typeof candidate.formSessionId === "string"
    && candidate.formSessionId.trim()
    && typeof candidate.scraperName === "string"
    && typeof candidate.featureLabel === "string"
    && candidate.pageRequest
    && typeof candidate.pageRequest.baseUrl === "string"
    && typeof candidate.pageRequest.targetUrl === "string"
    && (!candidate.urlPattern || (
      typeof candidate.urlPattern.fieldName === "string"
      && typeof candidate.urlPattern.label === "string"
      && typeof candidate.urlPattern.value === "string"
    ))
    && Array.isArray(candidate.fields)
    && candidate.fields.every((field) => (
      field
      && typeof field.name === "string"
      && typeof field.label === "string"
      && (field.kind === "block" || field.kind === "value")
    )),
  );
};

export const createSelectorAssistantSessionId = (): string => (
  `selector-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
);

const stripExecutableHtml = (html: string, baseUrl: string): string => {
  const sanitized = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/((?:href|src)\s*=\s*["'])\s*javascript:[^"']*(["'])/gi, "$1#$2");
  const baseTag = `<base href="${baseUrl.replace(/"/g, "&quot;")}">`;

  if (/<head\b[^>]*>/i.test(sanitized)) {
    return sanitized.replace(/<head\b[^>]*>/i, (head) => `${head}${baseTag}`);
  }

  return `<!doctype html><html><head>${baseTag}</head><body>${sanitized}</body></html>`;
};

export const buildRuntimePreviewDataUrl = (html: string, baseUrl: string): string => (
  `data:text/html;charset=utf-8;base64,${Buffer.from(stripExecutableHtml(html, baseUrl), "utf8").toString("base64")}`
);

export const buildInteractiveLoadOptions = (
  request: OpenSelectorAssistantRequest["pageRequest"],
): LoadURLOptions => {
  const requestConfig = sanitizeRequestConfig(request.requestConfig);
  const fetchInit = buildScraperFetchInit(requestConfig, SCRAPER_DOCUMENT_ACCEPT);
  if (fetchInit.method !== "POST") {
    return {};
  }

  const headerLines = Object.entries(fetchInit.headers)
    .filter(([name]) => name.toLowerCase() !== "user-agent")
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");

  return {
    extraHeaders: headerLines,
    postData: [{
      type: "rawData",
      bytes: Buffer.from(fetchInit.body ?? "", "utf8"),
    }],
  };
};

export const isSelectorAssistantHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const configureSelectorPreviewNavigation = (
  view: WebContentsView,
  openUrl: (url: string) => void,
): void => {
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isSelectorAssistantHttpUrl(url)) {
      openUrl(url);
    }
    return { action: "deny" };
  });
};

export const attachSelectorPreviewSynchronization = ({
  runtimeView,
  interactiveView,
  isInitialized,
  getRuntimeUrl,
  loadRuntimeTarget,
  isUrlAllowed,
  requestUrlPermission,
}: {
  runtimeView: WebContentsView;
  interactiveView: WebContentsView;
  isInitialized: () => boolean;
  getRuntimeUrl: () => string | undefined;
  loadRuntimeTarget: (url: string) => Promise<void>;
  isUrlAllowed: (url: string) => boolean;
  requestUrlPermission: (url: string) => Promise<boolean>;
}): void => {
  runtimeView.webContents.on("will-navigate", (event, url) => {
    if (!isSelectorAssistantHttpUrl(url)) return;
    event.preventDefault();
    void requestUrlPermission(url).then((allowed) => {
      if (!allowed) return;
      return loadRuntimeTarget(url).then(() => interactiveView.webContents.loadURL(url));
    }).catch((error) => console.warn("Failed to follow runtime selector preview link", error));
  });

  const guardInteractiveNavigation = (event: Electron.Event, url: string): void => {
    if (!isSelectorAssistantHttpUrl(url) || isUrlAllowed(url)) return;
    event.preventDefault();
    void requestUrlPermission(url).then((allowed) => {
      if (allowed) void interactiveView.webContents.loadURL(url);
    });
  };
  interactiveView.webContents.on("will-navigate", guardInteractiveNavigation);
  interactiveView.webContents.on("will-redirect", guardInteractiveNavigation);

  interactiveView.webContents.on("did-navigate", (_event, url) => {
    if (isInitialized() && isSelectorAssistantHttpUrl(url) && url !== getRuntimeUrl()) {
      void loadRuntimeTarget(url)
        .catch((error) => console.warn("Failed to synchronize runtime selector preview", error));
    }
  });
};

export const loadSelectorAssistantHostWindow = async (
  window: BrowserWindow,
  sessionId: string,
): Promise<void> => {
  if (app.isPackaged) {
    const indexPath = path.join(app.getAppPath(), "dist", "renderer", "index.html");
    await window.loadFile(indexPath, { hash: `/selector-assistant?session=${encodeURIComponent(sessionId)}` });
    return;
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:3000";
  await window.loadURL(`${devServerUrl}/#/selector-assistant?session=${encodeURIComponent(sessionId)}`);
};
