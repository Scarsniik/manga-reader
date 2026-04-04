import React from 'react';
import { ScraperFeatureDefinition } from '@/shared/scraper';

type Props = {
  feature: ScraperFeatureDefinition;
  onBack: () => void;
};

export default function ScraperFeaturePlaceholderEditor({ feature, onBack }: Props) {
  return (
    <section className="scraper-config-step">
      <div className="scraper-feature-editor__topbar">
        <button type="button" className="secondary" onClick={onBack}>
          Retour aux composants
        </button>
      </div>

      <div className="scraper-config-step__intro">
        <h3>Configurer {feature.label}</h3>
        <p>
          Ce composant est deja prepare pour la navigation du wizard, mais son formulaire
          metier n&apos;est pas encore branche dans cette iteration.
        </p>
      </div>

      <div className="scraper-config-placeholder">
        La configuration de <strong>{feature.label}</strong> arrivera dans une iteration suivante.
      </div>
    </section>
  );
}
