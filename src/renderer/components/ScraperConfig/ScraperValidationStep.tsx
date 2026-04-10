import React from 'react';
import { ScraperAccessValidationResult, ScraperIdentityDraft } from '@/shared/scraper';
import { formatDisplayUrl } from '@/renderer/components/ScraperConfig/shared/validationDisplay';

type Props = {
  draft: ScraperIdentityDraft;
  validating: boolean;
  saving: boolean;
  validationResult: ScraperAccessValidationResult | null;
  saveError: string | null;
  onBack: () => void;
  onValidate: () => void;
  onSaveAndContinue: () => void;
};

const statusLabel = (result: ScraperAccessValidationResult): string => {
  if (result.ok && result.status) {
    return `Accessible (${result.status})`;
  }

  if (typeof result.status === 'number') {
    return `Echec (${result.status})`;
  }

  return 'Echec';
};

export default function ScraperValidationStep({
  draft,
  validating,
  saving,
  validationResult,
  saveError,
  onBack,
  onValidate,
  onSaveAndContinue,
}: Props) {
  return (
    <section className="scraper-config-step">
      <div className="scraper-config-step__intro">
        <h3>Valider l&apos;accessibilite</h3>
        <p>
          Cette etape envoie une requete simple vers la source pour verifier qu&apos;elle repond.
          On ne configure pas encore la recherche, les fiches ou les pages.
        </p>
      </div>

      <div className="scraper-config-summary">
        <div className="scraper-config-summary__row">
          <span>Type</span>
          <strong>{draft.kind === 'site' ? 'Site' : 'API'}</strong>
        </div>
        <div className="scraper-config-summary__row">
          <span>Nom</span>
          <strong>{draft.name}</strong>
        </div>
        <div className="scraper-config-summary__row">
          <span>Source</span>
          <strong>{draft.baseUrl}</strong>
        </div>
        {draft.description ? (
          <div className="scraper-config-summary__row scraper-config-summary__row--block">
            <span>Description</span>
            <strong>{draft.description}</strong>
          </div>
        ) : null}
      </div>

      <div className="scraper-config-step__actions">
        <button type="button" className="secondary" onClick={onBack} disabled={validating || saving}>
          Retour
        </button>
        <button type="button" className="primary" onClick={onValidate} disabled={validating || saving}>
          {validating ? 'Validation en cours...' : 'Tester la source'}
        </button>
        <button
          type="button"
          className="primary"
          onClick={onSaveAndContinue}
          disabled={!validationResult?.ok || validating || saving}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
        </button>
      </div>

      {validationResult ? (
        <div className={`scraper-validation-result ${validationResult.ok ? 'is-success' : 'is-error'}`}>
          <div className="scraper-validation-result__title">
            <strong>{statusLabel(validationResult)}</strong>
          </div>

          <div className="scraper-validation-result__grid">
            <div>
              <span>URL testee</span>
              <strong>{formatDisplayUrl(validationResult.normalizedUrl)}</strong>
            </div>
            {validationResult.finalUrl ? (
              <div>
                <span>URL finale</span>
                <strong>{formatDisplayUrl(validationResult.finalUrl)}</strong>
              </div>
            ) : null}
            {typeof validationResult.status === 'number' ? (
              <div>
                <span>Code HTTP</span>
                <strong>{validationResult.status}</strong>
              </div>
            ) : null}
            {validationResult.contentType ? (
              <div>
                <span>Type de contenu</span>
                <strong>{validationResult.contentType}</strong>
              </div>
            ) : null}
            <div>
              <span>Verifie le</span>
              <strong>{new Date(validationResult.checkedAt).toLocaleString()}</strong>
            </div>
          </div>

          {validationResult.warning ? (
            <div className="scraper-validation-result__message is-warning">
              {validationResult.warning}
            </div>
          ) : null}

          {validationResult.error ? (
            <div className="scraper-validation-result__message is-error">
              {validationResult.error}
            </div>
          ) : null}

          {validationResult.ok ? (
            <div className="scraper-validation-result__message is-success">
              La source est joignable. Les prochaines etapes pourront configurer la recherche,
              les fiches manga et les pages.
            </div>
          ) : null}

          {saveError ? (
            <div className="scraper-validation-result__message is-error">
              {saveError}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="scraper-config-placeholder">
          Lance le test pour verifier si l&apos;application peut joindre cette source par requete.
        </div>
      )}
    </section>
  );
}
