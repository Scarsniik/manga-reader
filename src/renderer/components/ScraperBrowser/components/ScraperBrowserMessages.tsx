import React from 'react';
import type { ScraperBrowserLoadingStatus } from '@/renderer/components/ScraperBrowser/types';

type Props = {
  loading: boolean;
  loadingStatus: ScraperBrowserLoadingStatus | null;
  runtimeMessage: string | null;
  runtimeError: string | null;
  downloadMessage: string | null;
  downloadError: string | null;
};

export default function ScraperBrowserMessages({
  loading,
  loadingStatus,
  runtimeMessage,
  runtimeError,
  downloadMessage,
  downloadError,
}: Props) {
  const completed = Math.max(0, loadingStatus?.completed ?? 0);
  const total = Math.max(0, loadingStatus?.total ?? 0);
  const hasProgress = total > 0;

  return (
    <>
      {loading ? (
        <div className="scraper-browser__message scraper-browser__loading" role="status" aria-live="polite">
          <span className="scraper-browser__loading-spinner" aria-hidden="true" />
          <div className="scraper-browser__loading-content">
            <strong>{loadingStatus?.title || "Chargement en cours"}</strong>
            <span>{loadingStatus?.detail || "Scaramanga prepare les donnees a afficher."}</span>
            {hasProgress ? (
              <div className="scraper-browser__loading-progress">
                <progress value={Math.min(completed, total)} max={total} />
                <span>{Math.min(completed, total)} / {total}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {runtimeMessage ? (
        <div className="scraper-browser__message is-info">{runtimeMessage}</div>
      ) : null}

      {runtimeError ? (
        <div className="scraper-browser__message is-error">{runtimeError}</div>
      ) : null}

      {downloadMessage ? (
        <div className="scraper-browser__message is-success">{downloadMessage}</div>
      ) : null}

      {downloadError ? (
        <div className="scraper-browser__message is-error">{downloadError}</div>
      ) : null}
    </>
  );
}
