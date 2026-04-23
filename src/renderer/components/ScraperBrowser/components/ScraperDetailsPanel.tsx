import React from 'react';
import { ScraperBookmarkMetadataField } from '@/shared/scraper';
import { Manga } from '@/renderer/types';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import type { ScraperOpenReaderOptions } from '@/renderer/components/ScraperBrowser/types';
import {
  formatScraperPageCountForDisplay,
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
  addingToLibrary: boolean;
  loadingMoreThumbnails: boolean;
  getLinkedMangaForSource: (chapter?: ScraperRuntimeChapterResult) => Manga | null;
  getLinkedLocalMangaForSource: (chapter?: ScraperRuntimeChapterResult) => Manga | null;
  onBack?: () => void;
  onOpenAuthor: (value: string) => void;
  onOpenAuthorInWorkspace?: (value: string, title: string) => void;
  onOpenReader: (options?: ScraperOpenReaderOptions) => void;
  onAddToLibrary: (chapter?: ScraperRuntimeChapterResult) => void;
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
  addingToLibrary,
  loadingMoreThumbnails,
  getLinkedMangaForSource,
  getLinkedLocalMangaForSource,
  onBack,
  onOpenAuthor,
  onOpenAuthorInWorkspace,
  onOpenReader,
  onAddToLibrary,
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
  const totalPageCount = Number.parseInt(String(detailsResult.pageCount ?? '').match(/\d+/)?.[0] ?? '', 10);
  const canLoadMoreFromPages = canOpenThumbnailReader
    && Number.isFinite(totalPageCount)
    && totalPageCount > thumbnailUrls.length;
  const canLoadMoreThumbnails = Boolean(detailsResult.thumbnailsNextPageUrl) || canLoadMoreFromPages;
  const loadMoreThumbnailsLabel = detailsResult.thumbnailsNextPageUrl
    ? 'Voir plus'
    : 'Afficher toutes les pages';
  const linkedStandaloneManga = getLinkedMangaForSource();
  const linkedStandaloneLocalManga = getLinkedLocalMangaForSource();
  const sourceUrl = detailsResult.finalUrl || detailsResult.requestedUrl;
  const pageCountLabel = formatScraperPageCountForDisplay(detailsResult.pageCount);
  const downloadLabel = linkedStandaloneLocalManga
    ? 'Retelecharger'
    : 'Telecharger';
  const addToLibraryLabel = linkedStandaloneManga
    ? 'Mettre a jour la bibliotheque'
    : 'Ajouter a la bibliotheque';

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
              {pageCountLabel ? (
                <span className="scraper-browser__status-pill">{pageCountLabel}</span>
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
                pageCount={detailsResult.pageCount}
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
                      linkedStandaloneLocalManga ? 'is-linked' : '',
                    ].join(' ').trim()}
                    onClick={() => onDownload()}
                    disabled={downloading}
                    title={linkedStandaloneLocalManga ? `Deja telecharge sous ${linkedStandaloneLocalManga.title}. Le telechargement remplacera les images locales.` : undefined}
                  >
                    {downloading ? 'Telechargement...' : downloadLabel}
                  </button>
                  <button
                    type="button"
                    className="scraper-browser__add-library"
                    onClick={() => onAddToLibrary()}
                    disabled={addingToLibrary}
                    title={linkedStandaloneManga ? `Deja present en bibliotheque sous ${linkedStandaloneManga.title}. Cliquer pour mettre a jour la fiche.` : undefined}
                  >
                    {addingToLibrary ? 'Ajout...' : addToLibraryLabel}
                  </button>
                </>
              ) : null}
              {sourceUrl ? (
                <>
                  <button
                    type="button"
                    className="scraper-browser__link-source"
                    onClick={() => onLinkSourceToManga()}
                    title={linkedStandaloneLocalManga ? `Lie a ${linkedStandaloneLocalManga.title}. Cliquer pour changer.` : undefined}
                  >
                    {linkedStandaloneLocalManga ? 'Changer le lien' : 'Lier a un manga'}
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
                    onMouseDown={onOpenAuthorInWorkspace ? (event) => {
                      if (event.button !== 1) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                    } : undefined}
                    onAuxClick={onOpenAuthorInWorkspace ? (event) => {
                      if (event.button !== 1) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      onOpenAuthorInWorkspace(authorTarget, author);
                    } : undefined}
                    title={`Ouvrir la page auteur pour ${author}`}
                    data-prevent-middle-click-autoscroll={onOpenAuthorInWorkspace ? 'true' : undefined}
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
                  const linkedChapterLocalManga = getLinkedLocalMangaForSource(chapter);
                  const chapterDownloadLabel = linkedChapterLocalManga
                    ? 'Retelecharger'
                    : 'Telecharger';
                  const chapterAddToLibraryLabel = linkedChapterManga
                    ? 'Mettre a jour'
                    : 'Ajouter';

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
                              linkedChapterLocalManga ? 'is-linked' : '',
                            ].join(' ').trim()}
                            onClick={() => onDownload(chapter)}
                            disabled={downloading}
                            title={linkedChapterLocalManga ? `Deja telecharge sous ${linkedChapterLocalManga.title}. Le telechargement remplacera les images locales.` : undefined}
                          >
                            {downloading ? 'Telechargement...' : chapterDownloadLabel}
                          </button>
                          <button
                            type="button"
                            className="scraper-browser__add-library"
                            onClick={() => onAddToLibrary(chapter)}
                            disabled={addingToLibrary}
                            title={linkedChapterManga ? `Deja present en bibliotheque sous ${linkedChapterManga.title}. Cliquer pour mettre a jour la fiche.` : undefined}
                          >
                            {addingToLibrary ? 'Ajout...' : chapterAddToLibraryLabel}
                          </button>
                          <button
                            type="button"
                            className="scraper-browser__link-source"
                            onClick={() => onLinkSourceToManga(chapter)}
                            title={linkedChapterLocalManga ? `Lie a ${linkedChapterLocalManga.title}. Cliquer pour changer.` : undefined}
                          >
                            {linkedChapterLocalManga ? 'Changer' : 'Lier'}
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
                  {loadingMoreThumbnails ? 'Chargement...' : loadMoreThumbnailsLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
    </>
  );
}
