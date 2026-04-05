import React from 'react';
import { ScraperFeatureValidationResult } from '@/shared/scraper';

export type ScraperValidationPresentation = {
  summary: string;
  details: string[];
  warning?: string;
};

type Props = {
  validationResult: ScraperFeatureValidationResult | null;
  presentation: ScraperValidationPresentation | null;
};

export default function ScraperValidationSummary({
  validationResult,
  presentation,
}: Props) {
  if (!validationResult) {
    return null;
  }

  return (
    <div className={`scraper-validation-result ${validationResult.ok ? 'is-success' : 'is-error'}`}>
      <div className="scraper-validation-result__title">
        <strong>{validationResult.ok ? 'Validation reussie' : 'Validation echouee'}</strong>
      </div>

      <div className="scraper-validation-result__grid">
        <div>
          <span>Etat</span>
          <strong>{presentation?.summary}</strong>
        </div>
        <div>
          <span>Verifie le</span>
          <strong>{new Date(validationResult.checkedAt).toLocaleString()}</strong>
        </div>
      </div>

      {presentation?.details.length ? (
        <div className="scraper-validation-result__list">
          {presentation.details.map((detail) => (
            <div key={detail}>{detail}</div>
          ))}
        </div>
      ) : null}

      {presentation?.warning ? (
        <div className="scraper-validation-result__message is-warning">
          {presentation.warning}
        </div>
      ) : null}
    </div>
  );
}
