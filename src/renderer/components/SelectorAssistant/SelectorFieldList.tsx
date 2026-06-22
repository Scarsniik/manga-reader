import React from "react";
import type { SelectorAssistantField } from "@/shared/selectorAssistant";
import type { SelectorAssistantFieldDraft } from "@/renderer/components/SelectorAssistant/types";

type Props = {
  fields: SelectorAssistantField[];
  drafts: Record<string, SelectorAssistantFieldDraft>;
  activeFieldName: string;
  onSelect: (fieldName: string) => void;
};

const getFieldStatus = (draft: SelectorAssistantFieldDraft | undefined): {
  className: string;
  label: string;
} => {
  if (draft?.accepted) {
    return { className: "is-accepted", label: "Valide" };
  }
  if (draft?.results.runtime || draft?.results.interactive) {
    return { className: "is-tested", label: "Teste" };
  }
  if (draft?.selector) {
    return { className: "is-generated", label: "Genere" };
  }
  if (draft?.samples.length) {
    return { className: "has-samples", label: `${draft.samples.length} exemple(s)` };
  }
  return { className: "is-empty", label: "A faire" };
};

export default function SelectorFieldList({ fields, drafts, activeFieldName, onSelect }: Props) {
  return (
    <nav className="selector-assistant-fields" aria-label="Selecteurs du module">
      <div className="selector-assistant-fields__heading">
        <strong>Selecteurs</strong>
        <span>{fields.length} champ(s)</span>
      </div>
      <div className="selector-assistant-fields__list">
        {fields.map((field) => {
          const status = getFieldStatus(drafts[field.name]);
          const isActive = field.name === activeFieldName;
          return (
            <button
              key={field.name}
              type="button"
              className={`selector-assistant-field${isActive ? " is-active" : ""}`}
              aria-current={isActive ? "step" : undefined}
              onClick={() => onSelect(field.name)}
            >
              <span>{field.label}</span>
              <small className={status.className}>{status.label}</small>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
