import React from 'react';
import { ScraperBookmarkMetadataField } from '@/shared/scraper';
import LanguageFlags from '@/renderer/components/LanguageFlags/LanguageFlags';
import { Manga } from '@/renderer/types';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
import ScraperPotentialMangaMatches from '@/renderer/components/ScraperBrowser/components/ScraperPotentialMangaMatches';
import ScraperRuntimeThumbnailImage, {
  isScraperRuntimeCssSpriteThumbnail,
} from '@/renderer/components/ScraperRuntimeThumbnail/ScraperRuntimeThumbnailImage';
import type { ScraperOpenReaderOptions } from '@/renderer/components/ScraperBrowser/types';
import type {
  ScraperPotentialMangaMatch,
  ScraperPotentialSeriesProgress,
  ScraperPotentialSeriesReadingWarning,
} from '@/renderer/components/ScraperBrowser/utils/potentialMangaMatchTypes';
import usePotentialMangaMatchBookmarkGuard from '@/renderer/components/ScraperBrowser/hooks/usePotentialMangaMatchBookmarkGuard';
import { MagnifyingGlassIcon } from '@/renderer/components/icons';
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
type DetailsContentTab = 'thumbnails' | 'chapters';
type ThumbnailFrameStyle = React.CSSProperties & {
  '--scraper-thumbnail-width'?: string;
  '--scraper-thumbnail-height'?: string;
};

const buildThumbnailFrameStyle = (thumbnail: ScraperRuntimeThumbnail): ThumbnailFrameStyle | undefined => {
  if (!isScraperRuntimeCssSpriteThumbnail(thumbnail)) {
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

type Props = {
  scraperId: string;
  expensiveChecksEnabled?: boolean;
  bookmarkExcludedFields: ScraperBookmarkMetadataField[];
  detailsResult: ScraperRuntimeDetailsResult | null;
  tagBlacklistEntries?: ScraperTagBlacklistEntry[];
  tagFavoriteSources?: ScraperTagFavoriteSourceTarget[];
  chapters: ScraperRuntimeChapterResult[];
  hasAuthor: boolean;
  hasTag: boolean;
  hasSource: boolean;
  backLabel?: string | null;
  canResolveAuthorName: boolean;
  canResolveTagName: boolean;
  canResolveSourceName: boolean;
  hasPages: boolean;
  usesChapters: boolean;
  displaysThumbnails?: boolean;
  openingReader: boolean;
  downloading: boolean;
  addingToLibrary: boolean;
  loadingMoreThumbnails: boolean;
  potentialReadingMatches: ScraperPotentialMangaMatch[];
  potentialBookmarkMatches: ScraperPotentialMangaMatch[];
  potentialReadingListMatches: ScraperPotentialMangaMatch[];
  potentialSeriesProgress?: ScraperPotentialSeriesProgress | null;
  potentialSeriesReadingWarning?: ScraperPotentialSeriesReadingWarning | null;
  loadingPotentialMatches?: boolean;
  multiSearchTitle?: string;
  getLinkedMangaForSource: (chapter?: ScraperRuntimeChapterResult) => Manga | null;
  getLinkedLocalMangaForSource: (chapter?: ScraperRuntimeChapterResult) => Manga | null;
  onBack?: () => void;
  onOpenAuthor: (value: string, title: string) => void;
  onOpenAuthorInWorkspace?: (value: string, title: string) => void;
  onOpenTag: (value: string, title: string) => void;
  onOpenTagInWorkspace?: (value: string, title: string) => void;
  onOpenSource: (value: string, title: string) => void;
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
  onOpenAuthorCorrespondenceSearch?: () => void;
};

export default function ScraperDetailsPanel({
  scraperId,
  expensiveChecksEnabled = true,
  bookmarkExcludedFields,
  detailsResult,
  tagBlacklistEntries = [],
  tagFavoriteSources = [],
  chapters,
  hasAuthor,
  hasTag,
  hasSource,
  backLabel = null,
  canResolveAuthorName,
  canResolveTagName,
  canResolveSourceName,
  displaysThumbnails = true,
  hasPages,
  usesChapters,
  openingReader,
  downloading,
  addingToLibrary,
  loadingMoreThumbnails,
  potentialReadingMatches,
  potentialBookmarkMatches,
  potentialReadingListMatches,
  potentialSeriesProgress = null,
  potentialSeriesReadingWarning = null,
  loadingPotentialMatches = false,
  multiSearchTitle = '',
  getLinkedMangaForSource,
  getLinkedLocalMangaForSource,
  onBack,
  onOpenAuthor,
  onOpenAuthorInWorkspace,
  onOpenTag,
  onOpenTagInWorkspace,
  onOpenSource,
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
  onOpenAuthorCorrespondenceSearch,
}: Props) {
  const [contentTabSelection, setContentTabSelection] = React.useState<{
    detailsKey: string;
    tab: DetailsContentTab;
  }>({
    detailsKey: '',
    tab: 'thumbnails',
  });
  const { handleBeforeToggle: handleBookmarkBeforeToggle } = usePotentialMangaMatchBookmarkGuard({
    readingMatches: potentialReadingMatches,
    bookmarkMatches: potentialBookmarkMatches,
    readingListMatches: potentialReadingListMatches,
    seriesReadingWarning: potentialSeriesReadingWarning,
  });

  if (!detailsResult) {
    return null;
  }

  const thumbnails = detailsResult.thumbnails ?? [];
  const shouldDisplayThumbnails = displaysThumbnails
    && Array.isArray(detailsResult.thumbnails);
  const canOpenThumbnailReader = hasPages && !usesChapters;
  const hasStandaloneActions = hasPages && !usesChapters;
  const hasPrimaryReaderAction = hasPages && (!usesChapters || chapters.length > 0);
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
  const hasChapterSection = chapters.length > 0 || (usesChapters && hasPages);
  const hasThumbnailSection = shouldDisplayThumbnails
    && (thumbnails.length > 0 || canLoadMoreThumbnails);
  const hasContentTabs = hasChapterSection && hasThumbnailSection;
  const activeContentTab = contentTabSelection.detailsKey === sourceUrl
    ? contentTabSelection.tab
    : 'thumbnails';
  const showChapters = hasChapterSection && (!hasContentTabs || activeContentTab === 'chapters');
  const showThumbnails = shouldDisplayThumbnails
    && (!hasContentTabs || activeContentTab === 'thumbnails');
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
                subscriptionsEnabled={expensiveChecksEnabled}
                scraperId={scraperId}
                sourceUrl={detailsResult.finalUrl || detailsResult.requestedUrl}
                title={detailsResult.title || detailsResult.finalUrl || detailsResult.requestedUrl}
                cover={detailsResult.cover}
                description={detailsResult.description}
                authors={detailsResult.authors}
                authorUrls={detailsResult.authorUrls}
                tags={detailsResult.tags}
                sourceNames={detailsResult.sources}
                sourceUrls={detailsResult.sourceUrls}
                mangaStatus={detailsResult.mangaStatus}
                pageCount={detailsResult.pageCount}
                languageCodes={languageCodes}
                excludedFields={bookmarkExcludedFields}
                onBeforeToggle={handleBookmarkBeforeToggle}
              />
            </div>
          </div>
          {hasPrimaryReaderAction || sourceUrl ? (
            <div className="scraper-browser__details-head-actions">
              {hasPrimaryReaderAction ? (
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
                  title={usesChapters
                    ? 'Reprendre le dernier chapitre lu ou commencer au premier chapitre'
                    : undefined}
                  data-prevent-middle-click-autoscroll="true"
                >
                  {openingReader ? 'Ouverture...' : 'Lecteur'}
                </button>
              ) : null}
              {hasStandaloneActions ? (
                <>
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
                  {onOpenAuthorCorrespondenceSearch ? (
                    <button
                      type="button"
                      className="scraper-browser__author-multi-search"
                      onClick={onOpenAuthorCorrespondenceSearch}
                      title="Retrouver l’auteur de ce manga et ses pages sur les autres sources"
                    >
                      <MagnifyingGlassIcon aria-hidden="true" focusable="false" />
                      <span>Rechercher l’auteur</span>
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
            readingListMatches={potentialReadingListMatches}
            seriesProgress={potentialSeriesProgress}
            seriesReadingWarning={potentialSeriesReadingWarning}
            fallbackCover={detailsResult.cover}
            fallbackCoverReferer={sourceUrl}
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

          {detailsResult.sources.length ? (
            <div className="scraper-card__chips">
              {detailsResult.sources.map((sourceName, index) => {
                const sourcePageUrl = detailsResult.sourceUrls[index];
                const canOpenSource = hasSource && Boolean(
                  sourcePageUrl || (canResolveSourceName && sourceName),
                );
                const sourceTarget = sourcePageUrl || sourceName;

                if (!canOpenSource || !sourceTarget) {
                  return (
                    <span key={`${sourceName}-${index}`} className="scraper-card__chip is-source">
                      Source : {sourceName}
                    </span>
                  );
                }

                return (
                  <button
                    key={`${sourceName}-${index}`}
                    type="button"
                    className="scraper-card__chip is-source is-clickable"
                    onClick={() => onOpenSource(sourceTarget, sourceName)}
                    title={`Ouvrir la page source pour ${sourceName}`}
                  >
                    Source : {sourceName}
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

          {hasContentTabs ? (
            <div className="scraper-browser__details-content-tabs" role="tablist" aria-label="Contenu de la fiche">
              <button
                type="button"
                role="tab"
                aria-selected={activeContentTab === 'thumbnails'}
                className={activeContentTab === 'thumbnails' ? 'is-active' : ''}
                onClick={() => setContentTabSelection({ detailsKey: sourceUrl, tab: 'thumbnails' })}
              >
                Vignettes
                <span>{thumbnails.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeContentTab === 'chapters'}
                className={activeContentTab === 'chapters' ? 'is-active' : ''}
                onClick={() => setContentTabSelection({ detailsKey: sourceUrl, tab: 'chapters' })}
              >
                Chapitres
                <span>{chapters.length}</span>
              </button>
            </div>
          ) : null}

          {showChapters && chapters.length ? (
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
                        chapter.image ? 'is-with-image' : '',
                      ].join(' ').trim()}
                    >
                      {chapter.image ? (
                        <div className="scraper-browser__chapter-media">
                          <img src={chapter.image} alt={chapter.label} />
                        </div>
                      ) : null}

                      <div className="scraper-browser__chapter-body">
                        <strong>{chapter.label}</strong>
                        <span>{formatScraperValueForDisplay(chapter.url)}</span>

                        {hasChapterActions ? (
                          <div className="scraper-browser__chapter-actions">
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
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showChapters && usesChapters && hasPages && !chapters.length ? (
            <div className="scraper-browser__chapters-empty">
              Aucun chapitre n&apos;a ete extrait pour cette fiche. Configure et valide le composant
              `Chapitres` pour ouvrir le lecteur depuis un chapitre.
            </div>
          ) : null}

          {showThumbnails ? (
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
                    const image = (
                      <ScraperRuntimeThumbnailImage
                        thumbnail={thumbnail}
                        alt={alt}
                        className="scraper-browser__thumbnail"
                        spriteClassName="scraper-browser__thumbnail-sprite"
                      />
                    );
                    const thumbnailKey = `${getScraperRuntimeThumbnailKey(thumbnail)}-${index}`;
                    const thumbnailClassName = [
                      isScraperRuntimeCssSpriteThumbnail(thumbnail) ? 'is-sprite' : '',
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
