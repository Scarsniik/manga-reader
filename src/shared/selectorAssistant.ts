import type {
  FetchScraperDocumentRequest,
  FetchScraperDocumentResult,
  ScraperFeatureKind,
} from "./scraper";

export type SelectorAssistantPreviewMode = "runtime" | "interactive";
export type SelectorAssistantSelectionMode = "navigate" | "positive" | "negative";
export type SelectorAssistantFieldKind = "block" | "value";
export type SelectorAssistantValueMode = "text" | "url";

export type SelectorAssistantField = {
  name: string;
  label: string;
  kind: SelectorAssistantFieldKind;
  currentSelector?: string;
  scopeFieldName?: string;
  valueMode?: SelectorAssistantValueMode;
};

export type OpenSelectorAssistantRequest = {
  formSessionId: string;
  scraperName: string;
  featureKind: ScraperFeatureKind;
  featureLabel: string;
  pageRequest: FetchScraperDocumentRequest;
  fields: SelectorAssistantField[];
  urlPattern?: {
    fieldName: string;
    label: string;
    value: string;
  };
};

export type SelectorAssistantSessionSnapshot = {
  id: string;
  formSessionId: string;
  scraperName: string;
  featureKind: ScraperFeatureKind;
  featureLabel: string;
  fields: SelectorAssistantField[];
  pageRequest: FetchScraperDocumentRequest;
  urlPattern?: OpenSelectorAssistantRequest["urlPattern"];
  runtimeDocument?: FetchScraperDocumentResult;
  activeMode: SelectorAssistantPreviewMode;
};

export type SelectorAssistantElementNode = {
  tagName: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
};

export type SelectorAssistantValueCandidate = {
  key: string;
  label: string;
  value: string;
  attribute?: string;
};

export type SelectorAssistantElement = {
  path: string;
  tagName: string;
  label: string;
  text: string;
  html: string;
  nodes: SelectorAssistantElementNode[];
  valueCandidates: SelectorAssistantValueCandidate[];
};

export type SelectorAssistantPageEvent = {
  type: "element-selected" | "page-loaded";
  mode: SelectorAssistantPreviewMode;
  selectionRole?: "positive" | "negative";
  element?: SelectorAssistantElement;
  url?: string;
};

export type SelectorAssistantPageCommand =
  | {
      type: "set-selection-mode";
      mode: SelectorAssistantSelectionMode;
      scopeSelector?: string;
    }
  | {
      type: "highlight-selector";
      selector: string;
      rejectedPaths?: string[];
    }
  | { type: "focus-element"; path: string }
  | { type: "clear-highlights" };

export type SelectorAssistantEvaluationRequest = {
  mode: SelectorAssistantPreviewMode;
  selector: string;
  scopeSelector?: string;
  valueMode: SelectorAssistantValueMode;
  valueRequired?: boolean;
  attribute?: string;
  positiveSamples: Array<{ path: string; expectedValue?: string }>;
  negativePaths: string[];
  highlight?: boolean;
};

export type SelectorAssistantEvaluatedElement = {
  path: string;
  label: string;
  value: string;
  rejectedReason?: string;
};

export type SelectorAssistantEvaluationResult = {
  ok: boolean;
  error?: string;
  matchedCount: number;
  positiveCount: number;
  coveredPositiveCount: number;
  negativeMatchCount: number;
  values: string[];
  elements: SelectorAssistantEvaluatedElement[];
  rejectedElements: SelectorAssistantEvaluatedElement[];
};

export type SelectorAssistantAppliedValue = {
  formSessionId: string;
  fieldName: string;
  selector: string;
};

export type SelectorAssistantNavigationRequest = {
  requestId: string;
  hostname: string;
  currentHostnames: string[];
};

export type SelectorAssistantNavigationResponse = {
  requestId: string;
  allowed: boolean;
  denyFutureRedirects: boolean;
};

export type SelectorAssistantNavigationState = {
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
};

export type SelectorAssistantNavigationCommand =
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "navigate"; url: string };
