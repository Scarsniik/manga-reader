import React from 'react';

type Props = {
  title: string;
  description: React.ReactNode;
  noteTitle: string;
  noteText: React.ReactNode;
  statusClassName: string;
  statusLabel: string;
  showBackButton?: boolean;
  onBack: () => void;
};

export default function ScraperFeatureEditorHeader({
  title,
  description,
  noteTitle,
  noteText,
  statusClassName,
  statusLabel,
  showBackButton = true,
  onBack,
}: Props) {
  return (
    <>
      <div className={[
        'scraper-feature-editor__topbar',
        showBackButton ? '' : 'scraper-feature-editor__topbar--status-only',
      ].filter(Boolean).join(' ')}>
        {showBackButton ? (
          <button type="button" className="secondary" onClick={onBack}>
            Retour aux composants
          </button>
        ) : null}
        <span className={`scraper-feature-pill ${statusClassName}`}>
          {statusLabel}
        </span>
      </div>

      <div className="scraper-config-step__intro">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <div className="scraper-config-note">
        <strong>{noteTitle}</strong>
        <span>{noteText}</span>
      </div>
    </>
  );
}
