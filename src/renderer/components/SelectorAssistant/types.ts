import type {
  SelectorAssistantElement,
  SelectorAssistantEvaluationResult,
  SelectorAssistantPreviewMode,
} from "@/shared/selectorAssistant";

export type SelectorAssistantSample = {
  id: string;
  role: "positive" | "negative";
  mode: SelectorAssistantPreviewMode;
  element: SelectorAssistantElement;
  expectedValue?: string;
  attribute?: string;
  rejectedReason?: string;
};

export type SelectorAssistantFieldDraft = {
  selector: string;
  attribute?: string;
  samples: SelectorAssistantSample[];
  accepted: boolean;
  generationWarning?: string;
  results: Partial<Record<SelectorAssistantPreviewMode, SelectorAssistantEvaluationResult>>;
};
