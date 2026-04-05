import React from 'react';

type Props = {
  runtimeMessage: string | null;
  runtimeError: string | null;
  downloadMessage: string | null;
  downloadError: string | null;
};

export default function ScraperBrowserMessages({
  runtimeMessage,
  runtimeError,
  downloadMessage,
  downloadError,
}: Props) {
  return (
    <>
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
