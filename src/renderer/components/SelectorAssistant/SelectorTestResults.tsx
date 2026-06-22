import React from "react";
import type {
  SelectorAssistantEvaluationResult,
  SelectorAssistantPreviewMode,
} from "@/shared/selectorAssistant";

type Props = {
  results: Partial<Record<SelectorAssistantPreviewMode, SelectorAssistantEvaluationResult>>;
  onFocusRejected: (mode: SelectorAssistantPreviewMode, path: string) => void;
};

const MODE_LABELS: Record<SelectorAssistantPreviewMode, string> = {
  runtime: "HTML du scraper",
  interactive: "Page interactive",
};

const truncate = (value: string, length = 130): string => (
  value.length > length ? `${value.slice(0, length - 1)}…` : value
);

export default function SelectorTestResults({ results, onFocusRejected }: Props) {
  const availableResults = (Object.entries(results) as Array<[
    SelectorAssistantPreviewMode,
    SelectorAssistantEvaluationResult,
  ]>).filter(([, result]) => Boolean(result));

  if (!availableResults.length) {
    return null;
  }

  return (
    <div className="selector-assistant-results">
      {availableResults.map(([mode, result]) => (
        <section key={mode} className={`selector-assistant-result${result.ok ? "" : " has-error"}`}>
          <div className="selector-assistant-result__heading">
            <strong>{MODE_LABELS[mode]}</strong>
            <span>{result.matchedCount} element(s)</span>
          </div>

          {result.error ? <p className="selector-assistant-result__error">{result.error}</p> : null}

          {result.ok ? (
            <div className="selector-assistant-result__metrics">
              <span>{result.coveredPositiveCount}/{result.positiveCount} positifs couverts</span>
              <span className={result.negativeMatchCount ? "is-warning" : ""}>
                {result.negativeMatchCount} negatif(s) trouve(s)
              </span>
              <span className={result.rejectedElements.length ? "is-warning" : ""}>
                {result.rejectedElements.length} valeur(s) refusee(s)
              </span>
            </div>
          ) : null}

          {result.values.length ? (
            <details>
              <summary>Valeurs retournees ({result.values.length})</summary>
              <ol className="selector-assistant-values">
                {result.values.slice(0, 100).map((value, index) => (
                  <li key={`${value}-${index}`}><code>{truncate(value)}</code></li>
                ))}
              </ol>
            </details>
          ) : null}

          {result.rejectedElements.length ? (
            <div className="selector-assistant-rejected-values">
              <strong>Elements ou valeurs refuses</strong>
              {result.rejectedElements.map((element, index) => (
                <button
                  key={`${element.path}-${index}`}
                  type="button"
                  onClick={() => onFocusRejected(mode, element.path)}
                >
                  <span>{element.label}</span>
                  <small>{element.rejectedReason}</small>
                  {element.value ? <code>{truncate(element.value)}</code> : null}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
