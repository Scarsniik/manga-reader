import React from "react";
import type { SelectorAssistantElement } from "@/shared/selectorAssistant";
import type { SelectorAssistantSample } from "@/renderer/components/SelectorAssistant/types";

type PendingSample = {
  role: "positive" | "negative";
  element: SelectorAssistantElement;
};

type Props = {
  pending: PendingSample | null;
  requiresExpectedValue: boolean;
  expectedValue: string;
  samples: SelectorAssistantSample[];
  onExpectedValueChange: (value: string) => void;
  onConfirmPending: () => void;
  onRemoveSample: (sampleId: string) => void;
};

const truncate = (value: string, length = 100): string => (
  value.length > length ? `${value.slice(0, length - 1)}…` : value
);

export default function SelectorSamplesPanel({
  pending,
  requiresExpectedValue,
  expectedValue,
  samples,
  onExpectedValueChange,
  onConfirmPending,
  onRemoveSample,
}: Props) {
  const positives = samples.filter((sample) => sample.role === "positive");
  const negatives = samples.filter((sample) => sample.role === "negative");

  return (
    <section className="selector-assistant-card">
      <div className="selector-assistant-card__heading">
        <div>
          <span className="selector-assistant-step-number">1</span>
          <strong>Donner des exemples</strong>
        </div>
        <small>{positives.length} positif(s), {negatives.length} negatif(s)</small>
      </div>

      <p className="selector-assistant-help">
        Active un mode de selection puis clique dans la page. Reclique pour descendre dans l&apos;element ;
        utilise le clic droit pour remonter.
      </p>

      {pending ? (
        <div className={`selector-assistant-pending is-${pending.role}`}>
          <strong>{pending.role === "positive" ? "Element positif en cours" : "Element negatif en cours"}</strong>
          <span>{pending.element.label}</span>

          {pending.role === "positive" && requiresExpectedValue ? (
            <div className="selector-assistant-value-picker">
              <label htmlFor="selector-assistant-expected-value">Valeur attendue</label>
              <div className="selector-assistant-value-options">
                {pending.element.valueCandidates.slice(0, 8).map((candidate) => (
                  <button
                    key={candidate.key}
                    type="button"
                    className={expectedValue === candidate.value ? "is-selected" : ""}
                    onClick={() => onExpectedValueChange(candidate.value)}
                  >
                    <span>{candidate.label}</span>
                    <code>{truncate(candidate.value)}</code>
                  </button>
                ))}
              </div>
              <input
                id="selector-assistant-expected-value"
                type="text"
                value={expectedValue}
                placeholder="Ou saisis exactement la valeur attendue"
                onChange={(event) => onExpectedValueChange(event.currentTarget.value)}
              />
            </div>
          ) : null}

          <button
            type="button"
            className="primary selector-assistant-pending__confirm"
            disabled={pending.role === "positive" && requiresExpectedValue && !expectedValue.trim()}
            onClick={onConfirmPending}
          >
            Ajouter cet exemple
          </button>
        </div>
      ) : (
        <div className="selector-assistant-empty-state">
          Aucun element en attente. La page reste navigable tant que le mode Naviguer est actif.
        </div>
      )}

      {samples.length ? (
        <div className="selector-assistant-samples">
          {samples.map((sample) => (
            <div
              key={sample.id}
              className={`selector-assistant-sample is-${sample.role}${sample.rejectedReason ? " is-rejected" : ""}`}
            >
              <div>
                <strong>{sample.role === "positive" ? "Positif" : "Negatif"}</strong>
                <span>{sample.element.label}</span>
                {sample.expectedValue ? <code>{truncate(sample.expectedValue)}</code> : null}
                {sample.rejectedReason ? <small>{sample.rejectedReason}</small> : null}
              </div>
              <button type="button" aria-label="Retirer cet exemple" onClick={() => onRemoveSample(sample.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
