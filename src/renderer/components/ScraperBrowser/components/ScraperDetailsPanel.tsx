import React, { useCallback, useMemo } from 'react';
import { ScraperBookmarkMetadataField } from '@/shared/scraper';
import LanguageFlags from '@/renderer/components/LanguageFlags/LanguageFlags';
import { Manga } from '@/renderer/types';
import buildConfirmActionModal from '@/renderer/components/Modal/modales/ConfirmActionModal';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import ScraperPotentialMangaMatches from '@/renderer/components/ScraperBrowser/components/ScraperPotentialMangaMatches';
import type { ScraperOpenReaderOptions } from '@/renderer/components/ScraperBrowser/types';
import type { ScraperPotentialMangaMatch } from '@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes';
import { MagnifyingGlassIcon } from '@/renderer/components/icons';
import { useModal } from '@/renderer/hooks/useModal';
import {
  formatScraperPageCountForDisplay,
  formatScraperValueForDisplay,
  getScraperRuntimeThumbnailKey,
  ScraperRuntimeChapterResult,
  ScraperRuntimeDetailsResult,
  ScraperRuntimeThumbnail,
} from '@/renderer/utils/scraperRuntime';
import {
  findScraperTagBlacklistEntry,
  type ScraperTagBlacklistEntry,
} from '@/renderer/utils/scraperTagBlacklist';
import {
  findScraperTagFavoriteSource,
  type ScraperTagFavoriteSourceTarget,
} from '@/renderer/utils/scraperTagFavorites';

const MIDDLE_BUTTON = 1;
const POTENTIAL_MATCH_WARNING_DETAIL_LIMIT = 4;

const getPotentialWarningMatchLabel = (match: ScraperPotentialMangaMatch): string => (
  `${match.title} - ${match.sourceLabel} (${match.detailLabel})`
);

const buildPotentialMatchWarningDetails = (
  readingMatches: ScraperPotentialMangaMatch[],
  bookmarkMatches: ScraperPotentialMangaMatch[],
): React.ReactNode => {
  const matches = [
    ...readingMatches.map((match) => ({ label: getPotentialWarningMatchLabel(match), kind: "Lecture" })),
    ...bookmarkMatches.map((match) => ({ label: getPotentialWarningMatchLabel(match), kind: "Bookmark" })),
  ];
  const visibleMatches = matches.slice(0, POTENTIAL_MATCH_WARNING_DETAIL_LIMIT);
  const hiddenCount = Math.max(0, matches.length - visibleMatches.length);

  return (
    <>
      <ul>
        {visibleMatches.map((match) => (
          <li key={`${match.kind}:${match.label}`}>
            <strong>{match.kind}</strong>
            {" - "}
            {match.label}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <p>{hiddenCount} autre{hiddenCount > 1 ? "s" : ""} correspondance{hiddenCount > 1 ? "s" : ""}.</p>
      ) : null}
    </>
  );
};

type ThumbnailFrameStyle = React.CSSProperties & {
  '--scraper-thumbnail-width'?: string;
  '--scraper-thumbnail-height'?: string;
};

const buildCssUrl = (url: string): string => `url("${url.replace(/"/g, '\\"')}")`;

const isCssSpriteThumbnail = (
  thumbnail: ScraperRuntimeThumbnail,
): thumbnail is Extract<ScraperRuntimeThumbnail, { kind: 'css_sprite' }> => (
  typeof thumbnail !== 'string' && thumbnail.kind === 'css_sprite'
);

const getThumbnailUrl = (thumbnail: ScraperRuntimeThumbnail): string => (
  typeof thumbnail === 'string' ? thumbnail : thumbnail.url
);

const buildThumbnailFrameStyle = (thumbnail: ScraperRuntimeThumbnail): ThumbnailFrameStyle | undefined => {
  if (!isCssSpriteThumbnail(thumbnail)) {
    return undefined;
  }

  const style: ThumbnailFrameStyle = {};
  if (thumbnail.width && thumbnail.width > 0) {
    style['--scraper-thumbnail-width'] = `${thumbnail.width}px`;
  }

  if (thumbnail.height && thumbnail.height > 0) {
    style['--scraper-thumbnail-height'] = `${thumbnail.height}px`;
  }

  return Object.keys(style).length ? style : undefined;
};

const renderThumbnail = (
  thumbnail: ScraperRuntimeThumbnail,
  alt: string,
): React.ReactNode => {
  if (isCssSpriteThumbnail(thumbnail)) {
    return (
      <span
        role="img"
        aria-label={alt}
        className="scraper-browser__thumbnail scraper-browser__thumbnail-sprite"
        style={{
          backgroundImage: buildCssUrl(thumbnail.url),
          backgroundPosition: `${thumbnail.positionX ?? 0}px ${thumbnail.positionY ?? 0}px`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: thumbnail.backgroundSize,
        }}
      />
    );
  }

  return (
    <img
      src={getThumbnailUrl(thumbnail)}
      alt={alt}
      className="scraper-browser__thumbnail"
    />
  );
};

type Props = {
  scraperId: string;
  bookmarkExcludedFields: ScraperBookmarkMetadataField[];
  detailsResult: ScraperRuntimeDetailsResult | null;
  tagBlacklistEntries?: ScraperTagBlacklistEntry[];
  tagFavoriteSources?: ScraperTagFavoriteSourceTarget[];
  chapters: ScraperRuntimeChapterResult[];
  hasAuthor: boolean;
  hasTag: boolean;
  backLabel?: string | null;
  canResolveAuthorName: boolean;
  canResolveTagName: boolean;
  hasPages: boolean;
  usesChapters: boolean;
  displaysThumbnails?: boolean;
  openingReader: boolean;
  downloading: boolean;
  addingToLibrary: boolean;
  loadingMoreThumbnails: boolean;
  potentialReadingMatches: ScraperPotentialMangaMatch[];
  potentialBookmarkMatches: ScraperPotentialMangaMatch[];
  loadingPotentialMatches?: boolean;
  multiSearchTitle?: string;
  getLinkedMangaForSource: (chapter?: ScraperRuntimeChapterResult) => Manga | null;
  getLinkedLocalMangaForSource: (chapter?: ScraperRuntimeChapterResult) => Manga | null;
  onBack?: () => void;
  onOpenAuthor: (value: string, title: string) => void;
  onOpenAuthorInWorkspace?: (value: string, title: string) => void;
  onOpenTag: (value: string, title: string) => void;
  onOpenTagInWorkspace?: (value: string, title: string) => void;
  onOpenReader: (options?: ScraperOpenReaderOptions) => void;
  onAddToLibrary: (chapter?: ScraperRuntimeChapterResult) => void;
  onLinkSourceToManga: (chapter?: ScraperRuntimeChapterResult) => void;
  onLoadMoreThumbnails: () => void;
  onDownload: (chapter?: ScraperRuntimeChapterResult) => void;
  onOpenPotentialMatch: (match: ScraperPotentialMangaMatch) => void;
  onOpenPotentialMatchInWorkspace: (match: ScraperPotentialMangaMatch) => void;
  onOpenTitleMultiSearch?: () => void;
  onOpenTitleMultiSearchInWorkspace?: () => void;
  onOpenCorrespondenceSearch?: () => void;
};

export default function ScraperDetailsPanel({
  scraperId,
  bookmarkExcludedFields,
  detailsResult,
  tagBlacklistEntries = [],
  tagFavoriteSources = [],
  chapters,
  hasAuthor,
  hasTag,
  backLabel = null,
  canResolveAuthorName,
  canResolveTagName,
  displaysThumbnails = true,
  hasPages,
  usesChapters,
  openingReader,
  downloading,
  addingToLibrary,
  loadingMoreThumbnails,
  potentialReadingMatches,
  potentialBookmarkMatches,
  loadingPotentialMatches = false,
  multiSearchTitle = '',
  getLinkedMangaForSource,
  getLinkedLocalMangaForSource,
  onBack,
  onOpenAuthor,
  onOpenAuthorInWorkspace,
  onOpenTag,
  onOpenTagInWorkspace,
  onOpenReader,
  onAddToLibrary,
  onLinkSourceToManga,
  onLoadMoreThumbnails,
  onDownload,
  onOpenPotentialMatch,
  onOpenPotentialMatchInWorkspace,
  onOpenTitleMultiSearch,
  onOpenTitleMultiSearchInWorkspace,
  onOpenCorrespondenceSearch,
}: Props) {
  const { openModal } = useModal();
  const potentialActionMatchCount = potentialReadingMatches.length + potentialBookmarkMatches.length;
  const potentialActionWarningDetails = useMemo(() => (
    buildPotentialMatchWarningDetails(potentialReadingMatches, potentialBookmarkMatches)
  ), [potentialBookmarkMatches, potentialReadingMatches]);
  const confirmBookmarkWithPotentialMatches = useCallback((
    action: () => void,
  ) => {
    if (!potentialActionMatchCount) {
      action();
      return;
    }

    openModal(buildConfirmActionModal({
      title: "Correspondance potentielle",
      message: (
        <>
          Attention, cette fiche ressemble a un manga deja lu, en cours ou bookmarke.
          {" "}
          Verifie la correspondance avant de continuer.
        </>
      ),
      details: potentialActionWarningDetails,
      confirmLabel: "Bookmarker quand meme",
      onConfirm: action,
    }));
  }, [openModal, potentialActionMatchCount, potentialActionWarningDetails]);
  const handleBookmarkBeforeToggle = useCallback((
    nextIsBookmarked: boolean,
    proceed: () => void,
  ) => {
    if (!nextIsBookmarked) {
      proceed();
      return;
    }

    confirmBookmarkWithPotentialMatches(proceed);
  }, [confirmBookmarkWithPotentialMatches]);

  if (!detailsResult) {
    return null;
  }

  const thumbnails = detailsResult.thumbnails ?? [];
  const shouldDisplayThumbnails = !usesChapters
    && displaysThumbnails
    && Array.isArray(detailsResult.thumbnails);
  const canOpenThumbnailReader = hasPages && !usesChapters;
  const hasStandaloneActions = hasPages && !usesChapters;
  const totalPageCount = Number.parseInt(String(detailsResult.pageCount ?? '').match(/\d+/)?.[0] ?? '', 10);
  const canLoadMoreFromPages = canOpenThumbnailReader
    && Number.isFinite(totalPageCount)
    && totalPageCount > thumbnails.length;
  const canLoadMoreThumbnails = Boolean(detailsResult.thumbnailsNextPageUrl) || canLoadMoreFromPages;
  const loadMoreThumbnailsLabel = detailsResult.thumbnailsNextPageUrl
    ? 'Voir plus'
    : 'Afficher toutes les pages';
  const linkedStandaloneManga = getLinkedMangaForSource();
  const linkedStandaloneLocalManga = getLinkedLocalMangaForSource();
  const sourceUrl = detailsResult.finalUrl || detailsResult.requestedUrl;
  const pageCountLabel = formatScraperPageCountForDisplay(detailsResult.pageCount);
  const languageCodes = detailsResult.languageCodes ?? [];
  const downloadLabel = linkedStandaloneLocalManga
    ? 'Retelecharger'
    : 'Telecharger';
  const addToLibraryLabel = linkedStandaloneManga
    ? 'Mettre a jour la bibliotheque'
    : 'Ajouter a la bibliotheque';
  const handleOpenReaderAuxClick = (
    event: React.MouseEvent,
    options?: ScraperOpenReaderOptions,
  ) => {
    if (event.button !== MIDDLE_BUTTON) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onOpenReader({
      ...options,
      openInWorkspace: true,
    });
  };
  const handleOpenTitleMultiSearchAuxClick = (event: React.MouseEvent) => {
    if (event.button !== MIDDLE_BUTTON) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onOpenTitleMultiSearchInWorkspace?.();
  };

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
              {languageCodes.length ? (
                <span className="scraper-browser__status-pill">
                  Langue <LanguageFlags languageCodes={languageCodes} />
                </span>
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
                languageCodes={languageCodes}
                excludedFields={bookmarkExcludedFields}
                onBeforeToggle={handleBookmarkBeforeToggle}
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
                    onMouseDown={(event) => {
                      if (event.button === MIDDLE_BUTTON) {
                        event.preventDefault();
                      }
                    }}
                    onAuxClick={(event) => handleOpenReaderAuxClick(event)}
                    disabled={openingReader}
                    data-prevent-middle-click-autoscroll="true"
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
                  {onOpenTitleMultiSearch ? (
                    <button
                      type="button"
                      className="scraper-browser__author-multi-search"
                      onClick={onOpenTitleMultiSearch}
                      onMouseDown={(event) => {
                        if (event.button === MIDDLE_BUTTON) {
                          event.preventDefault();
                        }
                      }}
                      onAuxClick={handleOpenTitleMultiSearchAuxClick}
                      disabled={!multiSearchTitle}
                      title={multiSearchTitle
                        ? `Ouvrir une recherche multi-sources avec ${multiSearchTitle}. Clic molette : nouvel onglet workspace`
                        : 'Aucun titre exploitable'}
                      data-prevent-middle-click-autoscroll="true"
                    >
                      <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
                      <span>Recherche multi-source</span>
                    </button>
                  ) : null}
                  {onOpenCorrespondenceSearch ? (
                    <button
                      type="button"
                      className="scraper-browser__author-multi-search"
                      onClick={onOpenCorrespondenceSearch}
                      title="Rechercher automatiquement ce manga et ses autres chapitres"
                    >
                      <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
                      <span>Rechercher des correspondances</span>
                    </button>
                  ) : null}
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

          <ScraperPotentialMangaMatches
            readingMatches={potentialReadingMatches}
            bookmarkMatches={potentialBookmarkMatches}
            loading={loadingPotentialMatches}
            onOpenMatch={onOpenPotentialMatch}
            onOpenMatchInWorkspace={onOpenPotentialMatchInWorkspace}
          />

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
                    onClick={() => onOpenAuthor(authorTarget, author)}
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
              {detailsResult.tags.map((tag, index) => {
                const tagUrl = (detailsResult.tagUrls ?? [])[index];
                const canOpenTag = hasTag && Boolean(tagUrl || (canResolveTagName && tag));
                const tagTarget = tagUrl || tag;
                const isBlacklistedTag = Boolean(findScraperTagBlacklistEntry(
                  tagBlacklistEntries,
                  tag,
                  tagUrl,
                ));
                const isFavoriteTag = Boolean(findScraperTagFavoriteSource(
                  tagFavoriteSources,
                  tag,
                  tagUrl,
                ));
                const tagClassName = [
                  'scraper-card__chip',
                  'is-tag',
                  isFavoriteTag ? 'is-favorite-tag' : '',
                  isBlacklistedTag ? 'is-blacklisted-tag' : '',
                ].join(' ').trim();
                const tagTitle = isBlacklistedTag
                  ? 'Tag blackliste pour ce scraper'
                  : isFavoriteTag
                    ? 'Tag favori pour ce scraper'
                    : undefined;

                if (!canOpenTag || !tagTarget) {
                  return (
                    <span
                      key={`${tag}-${index}`}
                      className={tagClassName}
                      title={tagTitle}
                    >
                      {tag}
                    </span>
                  );
                }

                return (
                  <button
                    key={`${tag}-${index}`}
                    type="button"
                    className={`${tagClassName} is-clickable`}
                    onClick={() => onOpenTag(tagTarget, tag)}
                    onMouseDown={onOpenTagInWorkspace ? (event) => {
                      if (event.button !== 1) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                    } : undefined}
                    onAuxClick={onOpenTagInWorkspace ? (event) => {
                      if (event.button !== 1) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      onOpenTagInWorkspace(tagTarget, tag);
                    } : undefined}
                    title={isBlacklistedTag
                      ? `Tag blackliste pour ce scraper. Ouvrir la page tag pour ${tag}`
                      : isFavoriteTag
                        ? `Tag favori pour ce scraper. Ouvrir la page tag pour ${tag}`
                        : `Ouvrir la page tag pour ${tag}`}
                    data-prevent-middle-click-autoscroll={onOpenTagInWorkspace ? 'true' : undefined}
                  >
                    {tag}
                  </button>
                );
              })}
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
                            onMouseDown={(event) => {
                              if (event.button === MIDDLE_BUTTON) {
                                event.preventDefault();
                              }
                            }}
                            onAuxClick={(event) => handleOpenReaderAuxClick(event, { chapter })}
                            disabled={openingReader}
                            data-prevent-middle-click-autoscroll="true"
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
                <span>{thumbnails.length}</span>
              </div>
              <div className="scraper-browser__thumbnails-list">
                {thumbnails.length ? (
                  thumbnails.map((thumbnail, index) => {
                    const page = index + 1;
                    const alt = `${detailsResult.title || 'Manga'} - Page ${page}`;
                    const image = renderThumbnail(thumbnail, alt);
                    const thumbnailKey = `${getScraperRuntimeThumbnailKey(thumbnail)}-${index}`;
                    const thumbnailClassName = [
                      isCssSpriteThumbnail(thumbnail) ? 'is-sprite' : '',
                    ].join(' ').trim();
                    const frameStyle = buildThumbnailFrameStyle(thumbnail);

                    if (!canOpenThumbnailReader) {
                      return (
                        <div
                          key={thumbnailKey}
                          className={[
                            'scraper-browser__thumbnail-frame',
                            thumbnailClassName,
                          ].join(' ').trim()}
                          style={frameStyle}
                        >
                          {image}
                        </div>
                      );
                    }

                    return (
                      <button
                        key={thumbnailKey}
                        type="button"
                        className={[
                          'scraper-browser__thumbnail-button',
                          thumbnailClassName,
                        ].join(' ').trim()}
                        style={frameStyle}
                        onClick={() => onOpenReader({ page })}
                        onMouseDown={(event) => {
                          if (event.button === MIDDLE_BUTTON) {
                            event.preventDefault();
                          }
                        }}
                        onAuxClick={(event) => handleOpenReaderAuxClick(event, { page })}
                        disabled={openingReader}
                        data-prevent-middle-click-autoscroll="true"
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
