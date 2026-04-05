import React from 'react';
import { ScraperBookmarkMetadataField } from '@/shared/scraper';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import {
  formatScraperValueForDisplay,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
} from '@/renderer/utils/scraperRuntime';

type Props = {
  scraperId: string;
  bookmarkExcludedFields: ScraperBookmarkMetadataField[];
  detailsResult: ScraperRuntimeDetailsResult | null;
  chapters: ScraperRuntimeChapterResult[];
  hasPages: boolean;
  usesChapters: boolean;
  canReturnToSearch: boolean;
  openingReader: boolean;
  downloading: boolean;
  onBackToSearch: () => void;
  onOpenReader: (chapter?: ScraperRuntimeChapterResult) => void;
  onDownload: (chapter?: ScraperRuntimeChapterResult) => void;
};

export default function ScraperDetailsPanel({
  scraperId,
  bookmarkExcludedFields,
  detailsResult,
  chapters,
  hasPages,
  usesChapters,
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
              <ScraperBookmarkButton
                scraperId={scraperId}
                sourceUrl={detailsResult.finalUrl || detailsResult.requestedUrl}
                title={detailsResult.title || detailsResult.finalUrl || detailsResult.requestedUrl}
                cover={detailsResult.cover}
                description={detailsResult.description}
                authors={detailsResult.authors}
                tags={detailsResult.tags}
                mangaStatus={detailsResult.mangaStatus}
                excludedFields={bookmarkExcludedFields}
              />
              {hasPages && !usesChapters ? (
                <button
                  type="button"
                  className="scraper-browser__read"
                  onClick={onOpenReader}
                  disabled={openingReader}
                >
                  {openingReader ? 'Ouverture...' : 'Lecteur'}
                </button>
              ) : null}
              {hasPages && !usesChapters ? (
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

          {chapters.length ? (
            <div className="scraper-browser__chapters">
              <div className="scraper-browser__chapters-head">
                <strong>Chapitres</strong>
                <span>{chapters.length}</span>
              </div>

              <div className="scraper-browser__chapters-list">
                {chapters.map((chapter) => {
                  const hasChapterActions = hasPages && usesChapters;

                  return (
                    <article
                      key={`${chapter.url}-${chapter.label}`}
                      className={[
                        'scraper-browser__chapter-card',
                        hasChapterActions ? 'is-with-actions' : '',
                      ].join(' ').trim()}
                    >
                      <div className="scraper-browser__chapter-media">
                        {chapter.image ? (
                          <img src={chapter.image} alt={chapter.label} />
                        ) : (
                          <div className="scraper-browser__chapter-placeholder">Chapitre</div>
                        )}
                      </div>

                      <div className="scraper-browser__chapter-body">
                        <strong>{chapter.label}</strong>
                        <span>{formatScraperValueForDisplay(chapter.url)}</span>
                      </div>

                      {hasChapterActions ? (
                        <div className="scraper-browser__chapter-actions scraper-browser__chapter-actions--side">
                          <button
                            type="button"
                            className="scraper-browser__read"
                            onClick={() => onOpenReader(chapter)}
                            disabled={openingReader}
                          >
                            {openingReader ? 'Ouverture...' : 'Lecteur'}
                          </button>
                          <button
                            type="button"
                            className="scraper-browser__download"
                            onClick={() => onDownload(chapter)}
                            disabled={downloading}
                          >
                            {downloading ? 'Telechargement...' : 'Telecharger'}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {usesChapters && hasPages && !chapters.length ? (
            <div className="scraper-browser__chapters-empty">
              Aucun chapitre n&apos;a ete extrait pour cette fiche. Configure et valide le composant
              `Chapitres` pour ouvrir le lecteur depuis un chapitre.
            </div>
          ) : null}
        </div>
      </article>
    </>
  );
}
