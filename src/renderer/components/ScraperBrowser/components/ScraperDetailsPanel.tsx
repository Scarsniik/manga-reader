import React from 'react';
import { formatScraperValueForDisplay, ScraperRuntimeDetailsResult } from '@/renderer/utils/scraperRuntime';

type Props = {
  detailsResult: ScraperRuntimeDetailsResult | null;
  hasPages: boolean;
  canReturnToSearch: boolean;
  openingReader: boolean;
  downloading: boolean;
  onBackToSearch: () => void;
  onOpenReader: () => void;
  onDownload: () => void;
};

export default function ScraperDetailsPanel({
  detailsResult,
  hasPages,
  canReturnToSearch,
  openingReader,
  downloading,
  onBackToSearch,
  onOpenReader,
  onDownload,
}: Props) {
  if (!detailsResult) {
    return null;
  }

  return (
    <>
      {canReturnToSearch ? (
        <div className="scraper-browser__details-return">
          <button
            type="button"
            className="scraper-browser__back-to-search"
            onClick={onBackToSearch}
          >
            Retour a la recherche
          </button>
        </div>
      ) : null}

      <article className="scraper-browser__details">
        <div className="scraper-browser__details-media">
          {detailsResult.cover ? (
            <img src={detailsResult.cover} alt={detailsResult.title || 'Couverture'} />
          ) : (
            <div className="scraper-browser__details-placeholder">Pas d&apos;image</div>
          )}
        </div>

        <div className="scraper-browser__details-body">
          <div className="scraper-browser__details-head">
            <h3>{detailsResult.title || 'Titre non detecte'}</h3>
            <div className="scraper-browser__details-actions">
              {detailsResult.mangaStatus ? (
                <span className="scraper-browser__status-pill">{detailsResult.mangaStatus}</span>
              ) : null}
              {hasPages ? (
                <button
                  type="button"
                  className="scraper-browser__read"
                  onClick={onOpenReader}
                  disabled={openingReader}
                >
                  {openingReader ? 'Ouverture...' : 'Lecteur'}
                </button>
              ) : null}
              {hasPages ? (
                <button
                  type="button"
                  className="scraper-browser__download"
                  onClick={onDownload}
                  disabled={downloading}
                >
                  {downloading ? 'Telechargement...' : 'Telecharger'}
                </button>
              ) : null}
            </div>
          </div>

          {detailsResult.authors.length ? (
            <div className="scraper-browser__chips">
              {detailsResult.authors.map((author) => (
                <span key={author} className="scraper-browser__chip is-author">{author}</span>
              ))}
            </div>
          ) : null}

          {detailsResult.tags.length ? (
            <div className="scraper-browser__chips">
              {detailsResult.tags.map((tag) => (
                <span key={tag} className="scraper-browser__chip is-tag">{tag}</span>
              ))}
            </div>
          ) : null}

          <p className="scraper-browser__description">
            {detailsResult.description || 'Aucune description extraite pour cette fiche.'}
          </p>

          <div className="scraper-browser__links">
            <div>
              <span>URL demandee</span>
              <strong>{formatScraperValueForDisplay(detailsResult.requestedUrl)}</strong>
            </div>
            {detailsResult.finalUrl && detailsResult.finalUrl !== detailsResult.requestedUrl ? (
              <div>
                <span>URL finale</span>
                <strong>{formatScraperValueForDisplay(detailsResult.finalUrl)}</strong>
              </div>
            ) : null}
          </div>

          {Object.keys(detailsResult.derivedValues).length ? (
            <div className="scraper-browser__derived">
              <span className="scraper-browser__derived-title">Variables derivees</span>
              <div className="scraper-browser__derived-list">
                {Object.entries(detailsResult.derivedValues).map(([key, value]) => (
                  <div key={key} className="scraper-browser__derived-item">
                    <code>{`{{${key}}}`}</code>
                    <strong>{formatScraperValueForDisplay(value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </article>
    </>
  );
}
