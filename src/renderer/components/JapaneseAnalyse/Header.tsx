import React from 'react';
import './Header.scss';

type Props = {
  onClose?: () => void;
};

export default function Header({ onClose }: Props) {
  return (
    <div className="jp-analyse-header">
      <div className="jp-analyse-header__titles">
        <span className="jp-analyse-header__eyebrow">Lecture japonaise</span>
        <strong>Analyse du texte OCR</strong>
      </div>
      {onClose ? (
        <button onClick={onClose} aria-label="Fermer l'analyse" className="close-btn">Fermer</button>
      ) : null}
    </div>
  );
}
