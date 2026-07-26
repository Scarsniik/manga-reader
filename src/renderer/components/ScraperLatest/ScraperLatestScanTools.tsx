import React from "react";

type Props = {
  loading: boolean;
  disabled: boolean;
  settingsLabel?: string;
  settingsActive: boolean;
  continueLabel?: string;
  continueDisabled: boolean;
  continueTitle: string;
  continueCount: number;
  onOpenSettings?: () => void;
  onContinue?: (count: number) => void;
  onContinueCountChange?: (count: number) => void;
};

export default function ScraperLatestScanTools({
  loading,
  disabled,
  settingsLabel,
  settingsActive,
  continueLabel,
  continueDisabled,
  continueTitle,
  continueCount,
  onOpenSettings,
  onContinue,
  onContinueCountChange,
}: Props) {
  const hasSettings = Boolean(settingsLabel && onOpenSettings);
  const hasContinuation = Boolean(continueLabel && onContinue);

  if (!hasSettings && !hasContinuation) {
    return null;
  }

  return (
    <div className="scraper-latest-scan-tools">
      <div className="scraper-latest-scan-tools__copy">
        <span>Réglages et reprise</span>
        <small>Ajuste cette session ou poursuis depuis la dernière page atteinte.</small>
      </div>
      <div className="scraper-latest-scan-tools__controls">
        {hasSettings && onOpenSettings ? (
          <button
            type="button"
            className={`scraper-latest-scan-tools__settings${settingsActive ? " is-active" : ""}`}
            onClick={onOpenSettings}
            disabled={loading}
          >
            <span className="scraper-latest-scan-tools__settings-dot" aria-hidden="true" />
            {settingsLabel}
          </button>
        ) : null}
        {hasContinuation && onContinue ? (
          <div className="scraper-latest-scan-tools__continuation">
            <label className="scraper-latest-scan-tools__count">
              <span>Passes</span>
              <input
                type="number"
                min={1}
                step={1}
                value={continueCount}
                onChange={(event) => {
                  onContinueCountChange?.(Number.parseInt(event.currentTarget.value, 10) || 1);
                }}
                disabled={loading || disabled}
                aria-label="Nombre de continuations"
              />
            </label>
            <span className="scraper-latest-scan-tools__tooltip" title={continueTitle}>
              <button
                type="button"
                className="scraper-latest-scan-tools__continue"
                onClick={() => onContinue(continueCount)}
                disabled={continueDisabled}
                title={continueTitle}
              >
                {loading ? "Chargement..." : continueLabel}
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
