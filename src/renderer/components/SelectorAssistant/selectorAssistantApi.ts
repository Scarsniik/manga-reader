import type {
  SelectorAssistantAppliedValue,
  SelectorAssistantEvaluationRequest,
  SelectorAssistantEvaluationResult,
  SelectorAssistantNavigationCommand,
  SelectorAssistantNavigationRequest,
  SelectorAssistantNavigationResponse,
  SelectorAssistantNavigationState,
  SelectorAssistantPageCommand,
  SelectorAssistantPageEvent,
  SelectorAssistantPreviewMode,
  SelectorAssistantSessionSnapshot,
} from "@/shared/selectorAssistant";

export type SelectorAssistantApi = {
  getSelectorAssistantSession: () => Promise<SelectorAssistantSessionSnapshot | null>;
  setSelectorAssistantBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<boolean>;
  setSelectorAssistantMode: (mode: SelectorAssistantPreviewMode) => Promise<boolean>;
  sendSelectorAssistantPageCommand: (mode: SelectorAssistantPreviewMode, command: SelectorAssistantPageCommand) => Promise<boolean>;
  evaluateSelectorAssistant: (request: SelectorAssistantEvaluationRequest) => Promise<SelectorAssistantEvaluationResult>;
  applySelectorAssistantValue: (value: SelectorAssistantAppliedValue) => Promise<boolean>;
  respondSelectorAssistantNavigation: (response: SelectorAssistantNavigationResponse) => Promise<boolean>;
  getSelectorAssistantNavigationState: () => Promise<SelectorAssistantNavigationState | null>;
  navigateSelectorAssistant: (command: SelectorAssistantNavigationCommand) => Promise<boolean>;
  onSelectorAssistantSessionUpdated: (callback: (snapshot: SelectorAssistantSessionSnapshot) => void) => () => void;
  onSelectorAssistantPageEvent: (callback: (event: SelectorAssistantPageEvent) => void) => () => void;
  onSelectorAssistantNavigationRequest: (callback: (request: SelectorAssistantNavigationRequest) => void) => () => void;
  onSelectorAssistantNavigationState: (callback: (state: SelectorAssistantNavigationState) => void) => () => void;
};

export const getSelectorAssistantApi = (): SelectorAssistantApi => (window.api ?? {}) as SelectorAssistantApi;
