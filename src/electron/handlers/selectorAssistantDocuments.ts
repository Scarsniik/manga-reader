import type { BrowserWindow, IpcMainInvokeEvent, WebContentsView } from "electron";
import { resolveScraperUrl } from "../scraper";
import { fetchScraperDocument } from "./scrapers/documents";
import {
  buildInteractiveLoadOptions,
  buildRuntimePreviewDataUrl,
} from "./selectorAssistantWindow.utils";
import {
  getSelectorAssistantHostname,
  isSelectorAssistantUrlAllowed,
  requestSelectorAssistantUrlPermission,
  type SelectorAssistantNavigationSession,
} from "./selectorAssistantNavigation";
import type {
  OpenSelectorAssistantRequest,
  SelectorAssistantSessionSnapshot,
} from "../../shared/selectorAssistant";

type SelectorAssistantDocumentSession = SelectorAssistantNavigationSession & {
  request: OpenSelectorAssistantRequest;
  runtimeView: WebContentsView;
  interactiveView: WebContentsView;
  runtimeDocument?: SelectorAssistantSessionSnapshot["runtimeDocument"];
  runtimeUrl?: string;
  documentsInitialized: boolean;
  closed: boolean;
  window: BrowserWindow;
};

const displayRuntimeDocument = async (
  session: SelectorAssistantDocumentSession,
  result: NonNullable<SelectorAssistantDocumentSession["runtimeDocument"]>,
  notifyUpdated: () => void,
): Promise<void> => {
  if (session.closed) return;
  session.runtimeDocument = result;
  if (result.ok && result.html) {
    const documentUrl = result.finalUrl || result.requestedUrl;
    const allowed = isSelectorAssistantUrlAllowed(session, documentUrl)
      || await requestSelectorAssistantUrlPermission(session, documentUrl);
    if (session.closed) return;
    if (!allowed) {
      session.runtimeDocument = {
        ...result,
        ok: false,
        error: `Redirection vers ${getSelectorAssistantHostname(documentUrl)} refusee.`,
      };
      notifyUpdated();
      return;
    }
    session.runtimeUrl = documentUrl;
    await session.runtimeView.webContents.loadURL(buildRuntimePreviewDataUrl(result.html, documentUrl));
  }
  notifyUpdated();
};

export const loadInitialSelectorAssistantDocuments = async (
  event: IpcMainInvokeEvent,
  session: SelectorAssistantDocumentSession,
  notifyUpdated: () => void,
): Promise<void> => {
  if (session.closed) return;
  const request = session.request.pageRequest;
  const liveUrl = resolveScraperUrl(request.baseUrl, request.targetUrl);
  void session.interactiveView.webContents.loadURL(liveUrl, buildInteractiveLoadOptions(request)).catch((error) => {
    console.warn("Failed to load interactive selector preview", error);
  });

  await displayRuntimeDocument(session, await fetchScraperDocument(event, request), notifyUpdated);
  if (session.closed) return;
  session.documentsInitialized = true;
};

export const loadSelectorAssistantRuntimeTarget = async (
  session: SelectorAssistantDocumentSession,
  targetUrl: string,
  notifyUpdated: () => void,
): Promise<void> => {
  const result = await fetchScraperDocument({} as IpcMainInvokeEvent, {
    baseUrl: targetUrl,
    targetUrl,
  });
  await displayRuntimeDocument(session, result, notifyUpdated);
};
