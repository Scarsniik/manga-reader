import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ScraperConfigWizard from '@/renderer/components/ScraperConfig/ScraperConfigWizard';
import '@/renderer/components/ScraperConfig/style.scss';
import { ScraperRecord } from '@/shared/scraper';

declare global {
  interface Window {
    api: any;
  }
}

type ViewState =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; scraperId: string };

const FEATURE_STATUS_LABELS = {
  not_configured: 'Non configure',
  configured: 'Configure non valide',
  validated: 'Valide',
} as const;

const FEATURE_STATUS_CLASSNAMES = {
  not_configured: 'is-not-configured',
  configured: 'is-configured',
  validated: 'is-validated',
} as const;

type Props = {
  initialView?: ViewState;
};

export default function ScrapersModalContent({ initialView = { kind: 'list' } }: Props) {
  const [view, setView] = useState<ViewState>(initialView);
  const [scrapers, setScrapers] = useState<ScraperRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadScrapers = useCallback(async () => {
    if (!window.api || typeof window.api.getScrapers !== 'function') {
      setError('La liste des scrappers n\'est pas disponible dans cette version.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await window.api.getScrapers();
      setScrapers(Array.isArray(data) ? data as ScraperRecord[] : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les scrappers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScrapers();
  }, [loadScrapers]);

  const sortedScrapers = useMemo(
    () => [...scrapers].sort((a, b) => (
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )),
    [scrapers],
  );

  const activeScraper = useMemo(() => (
    view.kind === 'edit'
      ? scrapers.find((scraper) => scraper.id === view.scraperId) || null
      : null
  ), [scrapers, view]);

  const handleScraperChange = useCallback((updatedScraper: ScraperRecord) => {
    setScrapers((previous) => {
      const exists = previous.some((scraper) => scraper.id === updatedScraper.id);
      if (exists) {
        return previous.map((scraper) => (
          scraper.id === updatedScraper.id ? updatedScraper : scraper
        ));
      }
      return [...previous, updatedScraper];
    });
  }, []);

  const handleDelete = useCallback(async (scraper: ScraperRecord) => {
    const confirmed = window.confirm(`Supprimer le scrapper "${scraper.name}" ?`);
    if (!confirmed) {
      return;
    }

    if (!window.api || typeof window.api.deleteScraper !== 'function') {
      setError('La suppression des scrappers n\'est pas disponible dans cette version.');
      return;
    }

    setDeletingId(scraper.id);
    setError(null);
    try {
      const nextScrapers = await window.api.deleteScraper(scraper.id);
      setScrapers(Array.isArray(nextScrapers) ? nextScrapers as ScraperRecord[] : []);
      setView({ kind: 'list' });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Impossible de supprimer le scrapper.');
    } finally {
      setDeletingId(null);
    }
  }, []);

  if (view.kind === 'create') {
    return (
      <div className="scrapers-library">
        <div className="scrapers-library__toolbar">
          <button type="button" className="secondary" onClick={() => setView({ kind: 'list' })}>
            Retour a la liste
          </button>
        </div>

        <ScraperConfigWizard
          key="create-scraper"
          onScraperChange={handleScraperChange}
        />
      </div>
    );
  }

  if (view.kind === 'edit' && activeScraper) {
    return (
      <div className="scrapers-library">
        <div className="scrapers-library__toolbar">
          <button type="button" className="secondary" onClick={() => setView({ kind: 'list' })}>
            Retour a la liste
          </button>
        </div>

        <ScraperConfigWizard
          key={activeScraper.id}
          initialScraper={activeScraper}
          onScraperChange={handleScraperChange}
        />
      </div>
    );
  }

  return (
    <section className="scrapers-library">
      <div className="scrapers-library__header">
        <div>
          <h3>Mes scrappers</h3>
          <p>
            Ouvre un scrapper existant pour modifier ses composants, ou cree-en un nouveau.
          </p>
        </div>

        <button type="button" className="primary" onClick={() => setView({ kind: 'create' })}>
          Nouveau scrapper
        </button>
      </div>

      {error ? (
        <div className="scraper-validation-result__message is-error">{error}</div>
      ) : null}

      {loading ? (
        <div className="scraper-config-placeholder">Chargement des scrappers...</div>
      ) : null}

      {!loading && sortedScrapers.length === 0 ? (
        <div className="scraper-config-placeholder">
          Aucun scrapper enregistre pour le moment.
        </div>
      ) : null}

      {!loading && sortedScrapers.length > 0 ? (
        <div className="scrapers-library__list">
          {sortedScrapers.map((scraper) => (
            <div
              key={scraper.id}
              className="scrapers-library__card"
              role="button"
              tabIndex={0}
              onClick={() => setView({ kind: 'edit', scraperId: scraper.id })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setView({ kind: 'edit', scraperId: scraper.id });
                }
              }}
            >
              <div className="scrapers-library__card-header">
                <div>
                  <strong>{scraper.name}</strong>
                  <span>{scraper.baseUrl}</span>
                </div>

                <button
                  type="button"
                  className="secondary scrapers-library__delete-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDelete(scraper);
                  }}
                  disabled={deletingId === scraper.id}
                  aria-label={`Supprimer ${scraper.name}`}
                  title={deletingId === scraper.id ? 'Suppression...' : 'Supprimer'}
                >
                  {deletingId === scraper.id ? '...' : '×'}
                </button>
              </div>

              {scraper.description ? (
                <p className="scrapers-library__card-description">{scraper.description}</p>
              ) : null}

              <div className="scrapers-library__feature-list">
                {scraper.features.map((feature) => (
                  <span
                    key={feature.kind}
                    className={[
                      'scraper-feature-pill',
                      FEATURE_STATUS_CLASSNAMES[feature.status],
                    ].join(' ')}
                  >
                    {feature.label} · {FEATURE_STATUS_LABELS[feature.status]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
