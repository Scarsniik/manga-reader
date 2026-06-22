import React, { type FormEvent } from "react";
import type {
  OpenSelectorAssistantRequest,
  SelectorAssistantNavigationState,
} from "@/shared/selectorAssistant";

type Props = {
  state: SelectorAssistantNavigationState;
  url: string;
  urlPattern?: OpenSelectorAssistantRequest["urlPattern"];
  patternValue: string;
  patternApplied: boolean;
  onUrlChange: (value: string) => void;
  onPatternChange: (value: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onOpenUrl: () => void;
  onApplyPattern: () => void;
};

export default function SelectorNavigationBar({
  state,
  url,
  urlPattern,
  patternValue,
  patternApplied,
  onUrlChange,
  onPatternChange,
  onBack,
  onForward,
  onReload,
  onOpenUrl,
  onApplyPattern,
}: Props) {
  const submitUrl = (event: FormEvent) => {
    event.preventDefault();
    onOpenUrl();
  };
  const submitPattern = (event: FormEvent) => {
    event.preventDefault();
    onApplyPattern();
  };

  return (
    <div className="selector-assistant-navigation">
      <form className="selector-assistant-navigation__row" onSubmit={submitUrl}>
        <div className="selector-assistant-navigation__buttons" aria-label="Navigation">
          <button type="button" title="Page precedente" disabled={!state.canGoBack} onClick={onBack}>←</button>
          <button type="button" title="Page suivante" disabled={!state.canGoForward} onClick={onForward}>→</button>
          <button type="button" title="Recharger la page" onClick={onReload} className={state.loading ? "is-loading" : ""}>↻</button>
        </div>
        <label className="selector-assistant-navigation__field">
          <span>URL affichee</span>
          <input
            type="text"
            value={url}
            spellCheck={false}
            placeholder="https://exemple.com/page"
            onChange={(event) => onUrlChange(event.currentTarget.value)}
          />
        </label>
        <button type="submit" className="selector-assistant-navigation__open" disabled={!url.trim()}>
          Ouvrir
        </button>
      </form>

      {urlPattern ? (
        <form className="selector-assistant-navigation__row is-pattern" onSubmit={submitPattern}>
          <span className="selector-assistant-navigation__pattern-icon" aria-hidden="true">&#123;…&#125;</span>
          <label className="selector-assistant-navigation__field">
            <span>{urlPattern.label}</span>
            <input
              type="text"
              value={patternValue}
              spellCheck={false}
              placeholder="Pattern utilise par le scraper"
              onChange={(event) => onPatternChange(event.currentTarget.value)}
            />
          </label>
          <button type="submit" className="selector-assistant-navigation__apply" disabled={!patternValue.trim()}>
            {patternApplied ? "Envoye ✓" : "Utiliser ce pattern"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
