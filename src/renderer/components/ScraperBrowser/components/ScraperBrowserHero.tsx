import React from 'react';
import { ScraperRecord } from '@/shared/scraper';
import { ScraperCapability } from '@/renderer/components/ScraperBrowser/types';

const FEATURE_STATUS_LABELS = {
  not_configured: 'Non configure',
  configured: 'Configure',
  validated: 'Valide',
} as const;

type Props = {
  scraper: ScraperRecord;
  capabilities: ScraperCapability[];
  onHome: () => void;
  onEdit: () => void;
};

export default function ScraperBrowserHero({
  scraper,
  capabilities,
  onHome,
  onEdit,
}: Props) {
  return (
    <div className="scraper-browser__hero">
      <div className="scraper-browser__intro">
        <span className="scraper-browser__eyebrow">Scrapper actif</span>
        <h2>
          <button
            type="button"
            className="scraper-browser__home"
            onClick={onHome}
            title="Revenir a la page d'accueil du scrapper"
          >
            {scraper.name}
          </button>
        </h2>
        <p>{scraper.description || 'Affichage temporaire pour executer la configuration du scrapper sans passer par la bibliotheque.'}</p>
      </div>

      <div className="scraper-browser__meta">
        <div className="scraper-browser__meta-actions">
          <button
            type="button"
            className="scraper-browser__edit"
            onClick={onEdit}
          >
            Modifier
          </button>
        </div>
        <span>{scraper.baseUrl}</span>
        <div className="scraper-browser__caps">
          {capabilities.map((capability) => (
            <span
              key={capability.label}
              className={[
                'scraper-browser__capability',
                capability.enabled ? 'is-enabled' : 'is-disabled',
              ].join(' ')}
              title={capability.feature ? FEATURE_STATUS_LABELS[capability.feature.status] : 'Non configure'}
            >
              {capability.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
