import React, { useCallback, useMemo, useState } from 'react';
import Form from '@/renderer/components/utils/Form/Form';
import { Field } from '@/renderer/components/utils/Form/types';
import { languages } from '@/renderer/consts/languages';
import { ScraperGlobalConfig, ScraperRecord } from '@/shared/scraper';

declare global {
  interface Window {
    api: any;
  }
}

type Props = {
  scraper: ScraperRecord;
  onBack: () => void;
  onScraperChange: (scraper: ScraperRecord) => void;
};

const sanitizeTagIds = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(
      value
        .map((entry) => String(entry ?? '').trim())
        .filter((entry) => entry.length > 0),
    ))
    : []
);

const buildGlobalConfig = (values: Record<string, unknown>): ScraperGlobalConfig => ({
  defaultTagIds: sanitizeTagIds(values.defaultTagIds),
  defaultLanguage: String(values.defaultLanguage ?? '').trim().toLowerCase() || undefined,
  homeSearch: {
    enabled: Boolean(values.homeSearchEnabled),
    query: String(values.homeSearchQuery ?? '').trim(),
  },
});

export default function ScraperGlobalSettingsEditor({
  scraper,
  onBack,
  onScraperChange,
}: Props) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasSearch = useMemo(
    () => scraper.features.some((feature) => feature.kind === 'search' && feature.status !== 'not_configured'),
    [scraper.features],
  );
  const fields = useMemo<Field[]>(() => ([
    {
      name: 'defaultTagIds',
      label: 'Tags par defaut',
      type: 'tagsPicker',
      placeholder: 'Ajouter des tags automatiquement a chaque telechargement',
    },
    {
      name: 'defaultLanguage',
      label: 'Langue par defaut',
      type: 'select',
      options: languages.map((language) => ({
        label: language.frenchName,
        value: language.code,
      })),
    },
    {
      name: 'homeSearchEnabled',
      label: 'Jouer une recherche d\'accueil automatiquement',
      type: 'checkbox',
    },
    {
      name: 'homeSearchQuery',
      label: 'Recherche d\'accueil',
      type: 'text',
      placeholder: 'Optionnel. Laisse vide pour lancer une recherche globale.',
    },
  ]), []);

  const initialValues = useMemo(() => ({
    defaultTagIds: scraper.globalConfig.defaultTagIds,
    defaultLanguage: scraper.globalConfig.defaultLanguage ?? '',
    homeSearchEnabled: scraper.globalConfig.homeSearch.enabled,
    homeSearchQuery: scraper.globalConfig.homeSearch.query,
  }), [scraper.globalConfig]);

  const languageLabel = useMemo(() => {
    const code = scraper.globalConfig.defaultLanguage;
    if (!code) {
      return 'Aucune langue appliquee automatiquement';
    }

    return languages.find((language) => language.code === code)?.frenchName || code;
  }, [scraper.globalConfig.defaultLanguage]);

  const homeSearchLabel = useMemo(() => {
    if (!scraper.globalConfig.homeSearch.enabled) {
      return 'Aucune page d\'accueil automatique';
    }

    return scraper.globalConfig.homeSearch.query
      ? `Recherche lancee avec "${scraper.globalConfig.homeSearch.query}"`
      : 'Recherche globale lancee sans terme pre-rempli';
  }, [scraper.globalConfig.homeSearch.enabled, scraper.globalConfig.homeSearch.query]);

  const handleSubmit = useCallback(async (values: Record<string, unknown>) => {
    if (!window.api || typeof window.api.saveScraperGlobalConfig !== 'function') {
      setSaveError('Les reglages globaux du scrapper ne sont pas disponibles dans cette version.');
      return;
    }

    setSaveError(null);

    try {
      const updatedScraper = await window.api.saveScraperGlobalConfig({
        scraperId: scraper.id,
        globalConfig: buildGlobalConfig(values),
      });

      onScraperChange(updatedScraper as ScraperRecord);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Impossible d\'enregistrer les reglages globaux.');
    }
  }, [onScraperChange, scraper.id]);

  return (
    <section className="scraper-config-step">
      <div className="scraper-feature-editor__topbar">
        <button type="button" className="secondary" onClick={onBack}>
          Retour aux composants
        </button>
      </div>

      <div className="scraper-config-step__intro">
        <h3>Reglages globaux du scrapper</h3>
        <p>
          Ces options s&apos;appliquent a tout le scrapper: metadonnees par defaut sur les mangas
          telecharges et recherche d&apos;accueil a l&apos;ouverture quand rien n&apos;est a restaurer.
        </p>
      </div>

      <div className="scraper-config-note">
        <strong>Telechargement</strong>
        <span>
          Les tags et la langue definis ici seront ajoutes automatiquement aux nouveaux mangas
          importes depuis ce scrapper.
        </span>
      </div>

      <div className="scraper-config-note">
        <strong>Page d&apos;accueil</strong>
        <span>
          Quand la recherche d&apos;accueil est active, elle se lance a l&apos;arrivee sur la page du
          scrapper uniquement s&apos;il n&apos;y a pas d&apos;etat precedent a relancer.
        </span>
      </div>

      {!hasSearch ? (
        <div className="scraper-validation-result__message is-warning">
          Le composant `Recherche` n&apos;est pas encore configure. La recherche d&apos;accueil sera
          enregistree maintenant, puis jouee automatiquement une fois la recherche disponible.
        </div>
      ) : null}

      <Form
        fields={fields}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        submitLabel="Enregistrer les reglages globaux"
        globalError={saveError ?? undefined}
      />

      <div className="scraper-config-summary">
        <div className="scraper-config-summary__row">
          <span>Tags par defaut</span>
          <strong>
            {scraper.globalConfig.defaultTagIds.length
              ? `${scraper.globalConfig.defaultTagIds.length} tag(s) configure(s)`
              : 'Aucun tag automatique'}
          </strong>
        </div>
        <div className="scraper-config-summary__row">
          <span>Langue par defaut</span>
          <strong>{languageLabel}</strong>
        </div>
        <div className="scraper-config-summary__row scraper-config-summary__row--block">
          <span>Page d&apos;accueil</span>
          <strong>{homeSearchLabel}</strong>
        </div>
      </div>
    </section>
  );
}
