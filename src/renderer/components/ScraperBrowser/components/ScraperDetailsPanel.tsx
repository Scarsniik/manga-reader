import React from 'react';
import { ScraperBookmarkMetadataField } from '@/shared/scraper';
import { Manga } from '@/renderer/types';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import type { ScraperOpenReaderOptions } from '@/renderer/components/ScraperBrowser/types';
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
  hasAuthor: boolean;
  backLabel?: string | null;
  canResolveAuthorName: boolean;
  hasPages: boolean;
  usesChapters: boolean;
  displaysThumbnails?: boolean;
  openingReader: boolean;
  downloading: boolean;
  loadingMoreThumbnails: boolean;
  getLinkedMangaForSource: (chapter?: ScraperRuntimeChapterResult) => Manga | null;
  onBack?: () => void;
  onOpenAuthor: (value: string) => void;
  onOpenReader: (options?: ScraperOpenReaderOptions) => void;
  onLinkSourceToManga: (chapter?: ScraperRuntimeChapterResult) => void;
  onLoadMoreThumbnails: () => void;
  onDownload: (chapter?: ScraperRuntimeChapterResult) => void;
};

export default function ScraperDetailsPanel({
  scraperId,
  bookmarkExcludedFields,
  detailsResult,
  chapters,
  hasAuthor,
  backLabel = null,
  canResolveAuthorName,
  displaysThumbnails = true,
  hasPages,
  usesChapters,
  openingReader,
  downloading,
  loadingMoreThumbnails,
  getLinkedMangaForSource,
  onBack,
  onOpenAuthor,
  onOpenReader,
  onLinkSourceToManga,
  onLoadMoreThumbnails,
  onDownload,
}: Props) {
  if (!detailsResult) {
    return null;
  }

  const thumbnailUrls = detailsResult.thumbnails ?? [];
  const shouldDisplayThumbnails = !usesChapters
    && displaysThumbnails
    && Array.isArray(detailsResult.thumbnails);
  const canOpenThumbnailReader = hasPages && !usesChapters;
  const hasStandaloneActions = hasPages && !usesChapters;
  const canLoadMoreThumbnails = Boolean(detailsResult.thumbnailsNextPageUrl);
  const linkedStandaloneManga = getLinkedMangaForSource();
  const sourceUrl = detailsResult.finalUrl || detailsResult.requestedUrl;
  const downloadLabel = linkedStandaloneManga
    ? 'Retelecharger'
    : 'Telecharger';

  return (
    <>
      {backLabel && onBack ? (
        <div className="scraper-browser__details-return">
          <button
            type="button"
            className="scraper-browser__back-to-search"
            onClick={onBack}
          >
            {backLabel}
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
            </div>
          </div>
          {hasStandaloneActions || sourceUrl ? (
            <div className="scraper-browser__details-head-actions">
              {hasStandaloneActions ? (
                <>
                  <button
                    type="button"
                    className="scraper-browser__read"
                    onClick={() => onOpenReader()}
                    disabled={openingReader}
                  >
                    {openingReader ? 'Ouverture...' : 'Lecteur'}
                  </button>
                  <button
                    type="button"
                    className={[
                      'scraper-browser__download',
                      linkedStandaloneManga ? 'is-linked' : '',
                    ].join(' ').trim()}
                    onClick={() => onDownload()}
                    disabled={downloading}
                    title={linkedStandaloneManga ? `Deja lie a ${linkedStandaloneManga.title}. Le telechargement remplacera les images locales.` : undefined}
                  >
                    {downloading ? 'Telechargement...' : downloadLabel}
                  </button>
                </>
              ) : null}
              {sourceUrl ? (
                <>
                  <button
                    type="button"
                    className="scraper-browser__link-source"
                    onClick={() => onLinkSourceToManga()}
                    title={linkedStandaloneManga ? `Lie a ${linkedStandaloneManga.title}. Cliquer pour changer.` : undefined}
                  >
                    {linkedStandaloneManga ? 'Changer le lien' : 'Lier a un manga'}
                  </button>
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="scraper-browser__open-source"
                  >
                    Ouvrir dans le navigateur
                  </a>
                </>
              ) : null}
            </div>
          ) : null}

          {detailsResult.authors.length ? (
            <div className="scraper-card__chips">
              {detailsResult.authors.map((author, index) => {
                const authorUrl = detailsResult.authorUrls[index];
                const canOpenAuthor = hasAuthor && Boolean(authorUrl || (canResolveAuthorName && author));
                const authorTarget = authorUrl || author;

                if (!canOpenAuthor || !authorTarget) {
                  return (
                    <span key={`${author}-${index}`} className="scraper-card__chip is-author">{author}</span>
                  );
                }

                return (
                  <button
                    key={`${author}-${index}`}
                    type="button"
                    className="scraper-card__chip is-author is-clickable"
                    onClick={() => onOpenAuthor(authorTarget)}
                    title={`Ouvrir la page auteur pour ${author}`}
                  >
                    {author}
                  </button>
                );
              })}
            </div>
          ) : null}

          {detailsResult.tags.length ? (
            <div className="scraper-card__chips">
              {detailsResult.tags.map((tag) => (
                <span key={tag} className="scraper-card__chip is-tag">{tag}</span>
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
                  const linkedChapterManga = getLinkedMangaForSource(chapter);
                  const chapterDownloadLabel = linkedChapterManga
                    ? 'Retelecharger'
                    : 'Telecharger';

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
                            onClick={() => onOpenReader({ chapter })}
                            disabled={openingReader}
                          >
                            {openingReader ? 'Ouverture...' : 'Lecteur'}
                          </button>
                          <button
                            type="button"
                            className={[
                              'scraper-browser__download',
                              linkedChapterManga ? 'is-linked' : '',
                            ].join(' ').trim()}
                            onClick={() => onDownload(chapter)}
                            disabled={downloading}
                            title={linkedChapterManga ? `Deja lie a ${linkedChapterManga.title}. Le telechargement remplacera les images locales.` : undefined}
                          >
                            {downloading ? 'Telechargement...' : chapterDownloadLabel}
                          </button>
                          <button
                            type="button"
                            className="scraper-browser__link-source"
                            onClick={() => onLinkSourceToManga(chapter)}
                            title={linkedChapterManga ? `Lie a ${linkedChapterManga.title}. Cliquer pour changer.` : undefined}
                          >
                            {linkedChapterManga ? 'Changer' : 'Lier'}
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

          {shouldDisplayThumbnails ? (
            <div className="scraper-browser__thumbnails">
              <div className="scraper-browser__thumbnails-head">
                <strong>Pages</strong>
                <span>{thumbnailUrls.length}</span>
              </div>
              <div className="scraper-browser__thumbnails-list">
                {thumbnailUrls.length ? (
                  thumbnailUrls.map((thumbnailUrl, index) => {
                    const page = index + 1;
                    const image = (
                      <img
                        src={thumbnailUrl}
                        alt={`${detailsResult.title || 'Manga'} - Page ${page}`}
                        className="scraper-browser__thumbnail"
                      />
                    );

                    if (!canOpenThumbnailReader) {
                      return (
                        <div key={`${thumbnailUrl}-${index}`} className="scraper-browser__thumbnail-frame">
                          {image}
                        </div>
                      );
                    }

                    return (
                      <button
                        key={`${thumbnailUrl}-${index}`}
                        type="button"
                        className="scraper-browser__thumbnail-button"
                        onClick={() => onOpenReader({ page })}
                        disabled={openingReader}
                        aria-label={`Ouvrir le lecteur a la page ${page}`}
                        title={`Ouvrir le lecteur a la page ${page}`}
                      >
                        {image}
                      </button>
                    );
                  })
                ) : (
                  <span>Aucune page extraite pour cette fiche.</span>
                )}
              </div>
              {canLoadMoreThumbnails ? (
                <button
                  type="button"
                  className="scraper-browser__thumbnails-more"
                  onClick={onLoadMoreThumbnails}
                  disabled={loadingMoreThumbnails}
                >
                  {loadingMoreThumbnails ? 'Chargement...' : 'Voir plus'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
    </>
  );
}
