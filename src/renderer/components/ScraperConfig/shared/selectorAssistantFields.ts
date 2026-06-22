import type { Field } from "@/renderer/components/utils/Form/types";
import {
  getScraperFieldSelectorValue,
  type ScraperFieldSelector,
} from "@/shared/scraper";
import type {
  SelectorAssistantField,
  SelectorAssistantValueMode,
} from "@/shared/selectorAssistant";

type Options = {
  fields: Field[];
  valueFieldNames: readonly string[];
  values: Record<string, unknown>;
  scopeByFieldName?: Record<string, string | undefined>;
  valueModeByFieldName?: Record<string, SelectorAssistantValueMode | undefined>;
};

const getSelectorValue = (value: unknown): string => (
  typeof value === "string" ? value : getScraperFieldSelectorValue(value as ScraperFieldSelector | undefined)
);

export const buildSelectorAssistantFields = ({
  fields,
  valueFieldNames,
  values,
  scopeByFieldName = {},
  valueModeByFieldName = {},
}: Options): SelectorAssistantField[] => {
  const valueFieldNameSet = new Set(valueFieldNames);
  return fields.map((field) => ({
    name: field.name,
    label: field.label || field.name,
    kind: valueFieldNameSet.has(field.name) ? "value" : "block",
    currentSelector: getSelectorValue(values[field.name]),
    scopeFieldName: scopeByFieldName[field.name],
    valueMode: valueModeByFieldName[field.name] ?? "text",
  }));
};

export const LANGUAGE_ASSISTANT_FIELDS: Field[] = [
  {
    name: "languageSelector",
    label: "Selecteur de langue",
    type: "text",
  },
  {
    name: "processedLanguageSelector",
    label: "Selecteur de langue processed",
    type: "text",
  },
];
