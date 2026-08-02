import React from "react";
import ScraperPageAppendControl from "@/renderer/components/ScraperPageAppendControl/ScraperPageAppendControl";

type Props = {
  loading: boolean;
  disabled: boolean;
  settingsLabel?: string;
  settingsActive: boolean;
  showContinuation: boolean;
  continueDisabled: boolean;
  continueTitle: string;
  onOpenSettings?: () => void;
  onContinue?: (count: number) => void;
};

export default function ScraperLatestScanTools({
  loading,
  disabled,
  settingsLabel,
  settingsActive,
  showContinuation,
  continueDisabled,
  continueTitle,
  onOpenSettings,
  onContinue,
}: Props) {
  const hasSettings = Boolean(settingsLabel && onOpenSettings);
  const hasContinuation = Boolean(showContinuation && onContinue);

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
          <ScraperPageAppendControl
            loading={loading}
            disabled={disabled || continueDisabled}
            disabledTitle={continueTitle}
            onAppendPages={onContinue}
          />
        ) : null}
      </div>
    </div>
  );
}
