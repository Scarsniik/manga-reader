import React from 'react';

type Props = {
  title: string;
  description: string;
  noteTitle: string;
  noteText: string;
  statusClassName: string;
  statusLabel: string;
  onBack: () => void;
};

export default function ScraperFeatureEditorHeader({
  title,
  description,
  noteTitle,
  noteText,
  statusClassName,
  statusLabel,
  onBack,
}: Props) {
  return (
    <>
      <div className="scraper-feature-editor__topbar">
        <button type="button" className="secondary" onClick={onBack}>
          Retour aux composants
        </button>
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
