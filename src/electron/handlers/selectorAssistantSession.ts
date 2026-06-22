import type { BrowserWindow, WebContentsView } from "electron";
import type { SelectorAssistantNavigationSession } from "./selectorAssistantNavigation";
import type {
  OpenSelectorAssistantRequest,
  SelectorAssistantPreviewMode,
  SelectorAssistantSessionSnapshot,
} from "../../shared/selectorAssistant";

export type SelectorAssistantWindowSession = SelectorAssistantNavigationSession & {
  id: string;
  ownerWebContentsId: number;
  hostWebContentsId: number;
  runtimeWebContentsId: number;
  interactiveWebContentsId: number;
  request: OpenSelectorAssistantRequest;
  window: BrowserWindow;
  runtimeView: WebContentsView;
  interactiveView: WebContentsView;
  activeMode: SelectorAssistantPreviewMode;
  runtimeDocument?: SelectorAssistantSessionSnapshot["runtimeDocument"];
  runtimeUrl?: string;
  documentsInitialized: boolean;
  closed: boolean;
};
