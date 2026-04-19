import React, { useMemo, useState } from 'react';
import {
  ScraperFeatureDefinition,
  ScraperFeatureKind,
} from '@/shared/scraper';
import ScraperAuthorFeatureEditor from '@/renderer/components/ScraperConfig/ScraperAuthorFeatureEditor';
import ScraperChaptersFeatureEditor from '@/renderer/components/ScraperConfig/ScraperChaptersFeatureEditor';
import ScraperDetailsFeatureEditor from '@/renderer/components/ScraperConfig/ScraperDetailsFeatureEditor';
import ScraperGlobalSettingsEditor from '@/renderer/components/ScraperConfig/ScraperGlobalSettingsEditor';
import ScraperPagesFeatureEditor from '@/renderer/components/ScraperConfig/ScraperPagesFeatureEditor';
import ScraperSearchFeatureEditor from '@/renderer/components/ScraperConfig/ScraperSearchFeatureEditor';
import ScraperFeaturePlaceholderEditor from '@/renderer/components/ScraperConfig/ScraperFeaturePlaceholderEditor';
import { useScraperConfig } from '@/renderer/components/ScraperConfig/shared/ScraperConfigContext';
import { FEATURE_STATUS_META } from '@/renderer/components/ScraperConfig/shared/scraperFeatureEditor.utils';

type Props = {
  onEditSource?: () => void;
};

export default function ScraperFeatureSelectionStep({
  onEditSource,
}: Props) {
  const { scraper } = useScraperConfig();
  const [activeFeatureKind, setActiveFeatureKind] = useState<ScraperFeatureKind | 'global' | null>(null);

  const configuredFeatures = useMemo(
    () => scraper.features.filter((feature) => feature.status !== 'not_configured'),
    [scraper.features],
  );

  const availableFeatures = useMemo(
    () => scraper.features.filter((feature) => feature.status === 'not_configured'),
    [scraper.features],
  );

  const activeFeature = useMemo(
    () => scraper.features.find((feature) => feature.kind === activeFeatureKind) || null,
    [activeFeatureKind, scraper.features],
  );
  const globalSettingsStatus = useMemo(() => {
    const {
      defaultTagIds,
      defaultLanguage,
      homeSearch,
      bookmark,
    } = scraper.globalConfig;

    if (defaultTagIds.length || defaultLanguage || homeSearch.enabled || bookmark.excludedFields.length) {
      return { label: 'Configure', className: 'is-configured' };
    }

    return { label: 'Non configure', className: 'is-not-configured' };
  }, [scraper.globalConfig]);

  if (activeFeatureKind === 'global') {
    return (
      <ScraperGlobalSettingsEditor
        onBack={() => setActiveFeatureKind(null)}
      />
    );
  }

  if (activeFeature) {
    if (activeFeature.kind === 'search') {
      return (
        <ScraperSearchFeatureEditor
          feature={activeFeature}
          onBack={() => setActiveFeatureKind(null)}
        />
      );
    }

    if (activeFeature.kind === 'details') {
      return (
        <ScraperDetailsFeatureEditor
          feature={activeFeature}
          onBack={() => setActiveFeatureKind(null)}
        />
      );
    }

    if (activeFeature.kind === 'author') {
      return (
        <ScraperAuthorFeatureEditor
          feature={activeFeature}
          onBack={() => setActiveFeatureKind(null)}
        />
      );
    }

    if (activeFeature.kind === 'chapters') {
      return (
        <ScraperChaptersFeatureEditor
          feature={activeFeature}
          onBack={() => setActiveFeatureKind(null)}
        />
      );
    }

    if (activeFeature.kind === 'pages') {
      return (
        <ScraperPagesFeatureEditor
          feature={activeFeature}
          onBack={() => setActiveFeatureKind(null)}
        />
      );
    }

    return (
      <ScraperFeaturePlaceholderEditor
        feature={activeFeature}
        onBack={() => setActiveFeatureKind(null)}
      />
    );
  }

  const renderFeatureCard = (feature: ScraperFeatureDefinition) => {
    const statusMeta = FEATURE_STATUS_META[feature.status];

    return (
      <button
        key={feature.kind}
        type="button"
        className={['scraper-feature-card', statusMeta.className].join(' ')}
        onClick={() => setActiveFeatureKind(feature.kind)}
      >
        <span className="scraper-feature-card__title">{feature.label}</span>
        <span className={`scraper-feature-card__status ${statusMeta.className}`}>
          {statusMeta.label}
        </span>
        <span className="scraper-feature-card__description">{feature.description}</span>
      </button>
    );
  };

  return (
    <section className="scraper-config-step">
      {onEditSource ? (
        <div className="scraper-feature-editor__topbar">
          <button type="button" className="secondary" onClick={onEditSource}>
            Modifier la source
          </button>
        </div>
      ) : null}

      <div className="scraper-config-step__intro">
        <h3>Choisir les composants du scraper</h3>
        <p>
          Commence par les reglages globaux si tu veux preconfigurer les telechargements ou la
          page d&apos;accueil, puis configure les composants executables du scrapper.
        </p>
      </div>

      <div className="scraper-feature-section">
        <div className="scraper-feature-section__header">
          <h4>Reglages globaux</h4>
          <span>1</span>
        </div>

        <div className="scraper-feature-grid">
          <button
            type="button"
            className={['scraper-feature-card', globalSettingsStatus.className].join(' ')}
            onClick={() => setActiveFeatureKind('global')}
          >
            <span className="scraper-feature-card__title">Reglages globaux</span>
            <span className={`scraper-feature-card__status ${globalSettingsStatus.className}`}>
              {globalSettingsStatus.label}
            </span>
            <span className="scraper-feature-card__description">
              Tags par defaut, langue par defaut, regles de bookmark et recherche d&apos;accueil du scrapper.
            </span>
          </button>
        </div>
      </div>

      <div className="scraper-feature-section">
        <div className="scraper-feature-section__header">
          <h4>Composants a configurer</h4>
          <span>{availableFeatures.length}</span>
        </div>

        <div className="scraper-feature-grid">
          {availableFeatures.map(renderFeatureCard)}
        </div>
      </div>

      <div className="scraper-feature-section">
        <div className="scraper-feature-section__header">
          <h4>Composants deja configures</h4>
          <span>{configuredFeatures.length}</span>
        </div>

        {configuredFeatures.length > 0 ? (
          <div className="scraper-feature-grid">
            {configuredFeatures.map(renderFeatureCard)}
          </div>
        ) : (
          <div className="scraper-config-placeholder">
            Aucun composant n&apos;est encore configure dans cette V1.
          </div>
        )}
      </div>
    </section>
  );
}
