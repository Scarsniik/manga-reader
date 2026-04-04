import React, { useCallback, useMemo, useState } from 'react';
import ScraperIdentityStep from './ScraperIdentityStep';
import ScraperValidationStep from './ScraperValidationStep';
import ScraperFeatureSelectionStep from './ScraperFeatureSelectionStep';
import {
  ScraperAccessValidationResult,
  ScraperIdentityDraft,
  ScraperRecord,
} from '@/shared/scraper';
import './style.scss';

declare global {
  interface Window {
    api: any;
  }
}

type WizardStep = 'identity' | 'validation' | 'features';

const DEFAULT_DRAFT: ScraperIdentityDraft = {
  kind: 'site',
  name: 'Momoniji',
  baseUrl: 'https://momoniji.com',
  description: 'Site de reference pour les premiers tests de scraping, avec recherche, fiches manga et pages accessibles.',
};

const steps: Array<{ id: WizardStep; label: string }> = [
  { id: 'identity', label: 'Source' },
  { id: 'validation', label: 'Validation' },
  { id: 'features', label: 'Composants' },
];

type Props = {
  initialScraper?: ScraperRecord | null;
  onScraperChange?: (scraper: ScraperRecord) => void;
};

const buildDraftFromScraper = (scraper: ScraperRecord | null | undefined): ScraperIdentityDraft => {
  if (!scraper) {
    return DEFAULT_DRAFT;
  }

  return {
    kind: scraper.kind,
    name: scraper.name,
    baseUrl: scraper.baseUrl,
    description: scraper.description || '',
  };
};

export default function ScraperConfigWizard({ initialScraper = null, onScraperChange }: Props) {
  const [step, setStep] = useState<WizardStep>(initialScraper ? 'features' : 'identity');
  const [draft, setDraft] = useState<ScraperIdentityDraft>(buildDraftFromScraper(initialScraper));
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<ScraperAccessValidationResult | null>(
    initialScraper?.validation || null,
  );
  const [savedScraper, setSavedScraper] = useState<ScraperRecord | null>(initialScraper);
  const [saveError, setSaveError] = useState<string | null>(null);

  const currentStepIndex = useMemo(
    () => steps.findIndex((candidate) => candidate.id === step),
    [step],
  );

  const handleIdentitySubmit = useCallback((nextDraft: ScraperIdentityDraft) => {
    setDraft(nextDraft);
    setValidationResult(null);
    setSaveError(null);
    setStep('validation');
  }, []);

  const handleValidate = useCallback(async () => {
    if (!window.api || typeof window.api.validateScraperAccess !== 'function') {
      setValidationResult({
        ok: false,
        kind: draft.kind,
        normalizedUrl: draft.baseUrl,
        checkedAt: new Date().toISOString(),
        error: 'La validation de source n\'est pas disponible dans cette version de l\'application.',
      });
      return;
    }

    setValidating(true);
    setSaveError(null);
    try {
      const result = await window.api.validateScraperAccess({
        kind: draft.kind,
        baseUrl: draft.baseUrl,
      });
      setValidationResult(result as ScraperAccessValidationResult);
    } catch (error) {
      setValidationResult({
        ok: false,
        kind: draft.kind,
        normalizedUrl: draft.baseUrl,
        checkedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Echec de la validation.',
      });
    } finally {
      setValidating(false);
    }
  }, [draft.baseUrl, draft.kind]);

  const handleSaveAndContinue = useCallback(async () => {
    if (!validationResult?.ok) return;

    if (!window.api || typeof window.api.saveScraperDraft !== 'function') {
      setSaveError('L\'enregistrement de scraper n\'est pas disponible dans cette version de l\'application.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const saved = await window.api.saveScraperDraft({
        id: savedScraper?.id || initialScraper?.id,
        identity: draft,
        validation: validationResult,
      });

      setSavedScraper(saved as ScraperRecord);
      onScraperChange?.(saved as ScraperRecord);
      setStep('features');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Echec de l\'enregistrement du scraper.');
    } finally {
      setSaving(false);
    }
  }, [draft, initialScraper?.id, onScraperChange, savedScraper?.id, validationResult]);

  return (
    <div className="scraper-config-wizard">
      <div className="scraper-config-wizard__header">
        <div>
          <h2>Ajouter un scraper</h2>
          <p>
            Premiere iteration du flux de configuration. On pose la source, on la valide,
            puis on ouvre les premiers composants du scraper.
          </p>
        </div>

        <ol className="scraper-config-stepper" aria-label="Etapes de configuration">
          {steps.map((candidate, index) => {
            const isActive = candidate.id === step;
            const isDone = index < currentStepIndex;
            return (
              <li
                key={candidate.id}
                className={[
                  'scraper-config-stepper__item',
                  isActive ? 'is-active' : '',
                  isDone ? 'is-done' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="scraper-config-stepper__index">{index + 1}</span>
                <span className="scraper-config-stepper__label">{candidate.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="scraper-config-wizard__body">
        {step === 'identity' ? (
          <ScraperIdentityStep draft={draft} onSubmit={handleIdentitySubmit} />
        ) : null}

        {step === 'validation' ? (
          <ScraperValidationStep
            draft={draft}
            validating={validating}
            saving={saving}
            validationResult={validationResult}
            saveError={saveError}
            onBack={() => setStep('identity')}
            onValidate={handleValidate}
            onSaveAndContinue={handleSaveAndContinue}
          />
        ) : null}

        {step === 'features' && savedScraper ? (
          <ScraperFeatureSelectionStep
            scraper={savedScraper}
            onEditSource={() => setStep('identity')}
            onScraperChange={(nextScraper) => {
              setSavedScraper(nextScraper);
              onScraperChange?.(nextScraper);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
