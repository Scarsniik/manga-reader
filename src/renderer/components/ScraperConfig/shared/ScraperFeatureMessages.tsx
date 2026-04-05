import React from 'react';

type Props = {
  validationUiError?: string | null;
  saveMessage?: string | null;
  saveError?: string | null;
};

export default function ScraperFeatureMessages({
  validationUiError,
  saveMessage,
  saveError,
}: Props) {
  return (
    <>
      {validationUiError ? (
        <div className="scraper-validation-result__message is-error">{validationUiError}</div>
      ) : null}

      {saveMessage ? (
        <div className="scraper-validation-result__message is-success">{saveMessage}</div>
      ) : null}

      {saveError ? (
        <div className="scraper-validation-result__message is-error">{saveError}</div>
      ) : null}
    </>
  );
}
