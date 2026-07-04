import React from "react";
import type { ModalOptions } from "@/renderer/context/ModalContext";
import { useModal } from "@/renderer/hooks/useModal";

export type ScraperLatestSessionSettings = {
  scraperResultLimit: number;
  tagResultLimit: number;
  concurrency: number;
  deepPageLimit: number;
  quickConsecutiveSeenStopThreshold: number;
  languageRejectLimit: number;
};

type Props = {
  defaults: ScraperLatestSessionSettings;
  initialValues: ScraperLatestSessionSettings;
  hasOverride: boolean;
  onApply: (values: ScraperLatestSessionSettings) => void;
  onClear: () => void;
};

const normalizeResultLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
};

const normalizeNonNegativeLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
};

function ScraperLatestSessionSettingsModalContent({
  defaults,
  initialValues,
  hasOverride,
  onApply,
  onClear,
}: Props) {
  const { closeModal } = useModal();
  const [scraperResultLimit, setScraperResultLimit] = React.useState(initialValues.scraperResultLimit);
  const [tagResultLimit, setTagResultLimit] = React.useState(initialValues.tagResultLimit);
  const [concurrency, setConcurrency] = React.useState(initialValues.concurrency);
  const [deepPageLimit, setDeepPageLimit] = React.useState(initialValues.deepPageLimit);
  const [quickConsecutiveSeenStopThreshold, setQuickConsecutiveSeenStopThreshold] = React.useState(
    initialValues.quickConsecutiveSeenStopThreshold,
  );
  const [languageRejectLimit, setLanguageRejectLimit] = React.useState(initialValues.languageRejectLimit);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onApply({
      scraperResultLimit: normalizeResultLimit(scraperResultLimit),
      tagResultLimit: normalizeResultLimit(tagResultLimit),
      concurrency: normalizeResultLimit(concurrency),
      deepPageLimit: normalizeNonNegativeLimit(deepPageLimit),
      quickConsecutiveSeenStopThreshold: normalizeNonNegativeLimit(quickConsecutiveSeenStopThreshold),
      languageRejectLimit: normalizeNonNegativeLimit(languageRejectLimit),
    });
    closeModal();
  };

  const handleClear = () => {
    onClear();
    closeModal();
  };

  return (
    <form className="scraper-latest-session-settings-modal" onSubmit={handleSubmit}>
      <p>
        Ces valeurs remplacent les parametres globaux uniquement pour cette session de la vue
        Nouveautes.
      </p>

      <label className="scraper-latest-session-settings-modal__field">
        <span>Resultats par scrapper</span>
        <input
          type="number"
          min={1}
          step={1}
          value={scraperResultLimit}
          onChange={(event) => setScraperResultLimit(Number.parseInt(event.currentTarget.value, 10) || 1)}
        />
        <small>{`Parametre global : ${defaults.scraperResultLimit}`}</small>
      </label>

      <label className="scraper-latest-session-settings-modal__field">
        <span>Resultats par tag favori</span>
        <input
          type="number"
          min={1}
          step={1}
          value={tagResultLimit}
          onChange={(event) => setTagResultLimit(Number.parseInt(event.currentTarget.value, 10) || 1)}
        />
        <small>{`Parametre global : ${defaults.tagResultLimit}`}</small>
      </label>

      <label className="scraper-latest-session-settings-modal__field">
        <span>Scrapings simultanes</span>
        <input
          type="number"
          min={1}
          step={1}
          value={concurrency}
          onChange={(event) => setConcurrency(Number.parseInt(event.currentTarget.value, 10) || 1)}
        />
        <small>{`Parametre global : ${defaults.concurrency}`}</small>
      </label>

      <label className="scraper-latest-session-settings-modal__field">
        <span>Pages max du scan profond</span>
        <input
          type="number"
          min={0}
          step={1}
          value={deepPageLimit}
          onChange={(event) => setDeepPageLimit(Number.parseInt(event.currentTarget.value, 10) || 0)}
        />
        <small>{`Parametre global : ${defaults.deepPageLimit} (0 = infini)`}</small>
      </label>

      <label className="scraper-latest-session-settings-modal__field">
        <span>Cards vues tolerees en rapide</span>
        <input
          type="number"
          min={0}
          step={1}
          value={quickConsecutiveSeenStopThreshold}
          onChange={(event) => (
            setQuickConsecutiveSeenStopThreshold(Number.parseInt(event.currentTarget.value, 10) || 0)
          )}
        />
        <small>{`Parametre global : ${defaults.quickConsecutiveSeenStopThreshold}`}</small>
      </label>

      <label className="scraper-latest-session-settings-modal__field">
        <span>Refus langue avant arret</span>
        <input
          type="number"
          min={0}
          step={1}
          value={languageRejectLimit}
          onChange={(event) => setLanguageRejectLimit(Number.parseInt(event.currentTarget.value, 10) || 0)}
        />
        <small>{`Parametre global : ${defaults.languageRejectLimit} (0 = desactive)`}</small>
      </label>

      <div className="scraper-latest-session-settings-modal__actions">
        <button type="button" onClick={() => closeModal()}>
          Annuler
        </button>
        {hasOverride ? (
          <button type="button" onClick={handleClear}>
            Retirer l'override
          </button>
        ) : null}
        <button type="submit" className="primary">
          Appliquer
        </button>
      </div>
    </form>
  );
}

export default function buildScraperLatestSessionSettingsModal(props: Props): ModalOptions {
  return {
    title: "Parametres de session",
    content: <ScraperLatestSessionSettingsModalContent {...props} />,
    className: "scraper-latest-session-settings-modal-shell",
  };
}
