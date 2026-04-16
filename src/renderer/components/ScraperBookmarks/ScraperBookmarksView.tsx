import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, DownloadArrowIcon } from '@/renderer/components/icons';
import { ScraperBrowserLocationState } from '@/renderer/components/ScraperBrowser/types';
import type { ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import type { ScraperBookmarkRecord, ScraperRecord } from '@/shared/scraper';
import ScraperBookmarkCard from '@/renderer/components/ScraperBookmarks/ScraperBookmarkCard';
import { useScraperBookmarks } from '@/renderer/stores/scraperBookmarks';
import type { Manga } from '@/renderer/types';
import { findMangaLinkedToSource } from '@/renderer/utils/mangaSource';
import { writeScraperRouteState } from '@/renderer/utils/scraperBrowserNavigation';
import {
  buildScraperDownloadQueuedMessage,
  canQueueStandaloneScraperDownload,
  queueStandaloneScraperCardDownload,
} from '@/renderer/utils/scraperDownload';
import {
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperPagesFeatureConfig,
  isScraperFeatureConfigured,
} from '@/renderer/utils/scraperRuntime';
import './style.scss';

type Props = {
  scrapers: ScraperRecord[];
  filterScraperId?: string | null;
};

type ScraperBookmarksLocationState = ScraperBrowserLocationState & {
  bookmarksReturn?: {
    pathname: string;
    search?: string;
  };
} | null;

const getStandaloneDownloadConfig = (scraper: ScraperRecord | null | undefined) => {
  if (!scraper) {
    return null;
  }

  const detailsConfig = getScraperDetailsFeatureConfig(getScraperFeature(scraper, 'details'));
  const pagesConfig = getScraperPagesFeatureConfig(getScraperFeature(scraper, 'pages'));
  const detailsFeature = getScraperFeature(scraper, 'details');
  const pagesFeature = getScraperFeature(scraper, 'pages');
  if (!isScraperFeatureConfigured(detailsFeature) || !isScraperFeatureConfigured(pagesFeature)) {
    return null;
  }

  if (!canQueueStandaloneScraperDownload(detailsConfig, pagesConfig)) {
    return null;
  }

  return {
    detailsConfig,
    pagesConfig,
  };
};

export default function ScraperBookmarksView({
  scrapers,
  filterScraperId = null,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as ScraperBookmarksLocationState;
  const { bookmarks, loading, loaded, error } = useScraperBookmarks({ scraperId: filterScraperId });
  const [libraryMangas, setLibraryMangas] = useState<Manga[]>([]);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingSourceUrl, setDownloadingSourceUrl] = useState<string | null>(null);

  const scrapersById = useMemo(
    () => new Map(scrapers.map((scraper) => [scraper.id, scraper])),
    [scrapers],
  );
  const filteredScraper = filterScraperId ? scrapersById.get(filterScraperId) ?? null : null;
  const bookmarksReturn = locationState?.bookmarksReturn ?? null;

  const loadLibraryMangas = useCallback(async () => {
    if (!window.api || typeof window.api.getMangas !== 'function') {
      setLibraryMangas([]);
      return;
    }

    try {
      const data = await window.api.getMangas();
      setLibraryMangas(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load library mangas for bookmark download state', err);
      setLibraryMangas([]);
    }
  }, []);

  useEffect(() => {
    void loadLibraryMangas();

    const onMangasUpdated = () => {
      void loadLibraryMangas();
    };

    window.addEventListener('mangas-updated', onMangasUpdated as EventListener);
    return () => window.removeEventListener('mangas-updated', onMangasUpdated as EventListener);
  }, [loadLibraryMangas]);

  const handleBack = useCallback(() => {
    const historyIndex = window.history.state && typeof window.history.state.idx === 'number'
      ? window.history.state.idx
      : null;
    if (historyIndex !== null && historyIndex > 0) {
      navigate(-1);
      return;
    }

    if (!bookmarksReturn) {
      return;
    }

    navigate(
      {
        pathname: bookmarksReturn.pathname,
        search: bookmarksReturn.search ?? '',
      },
      { replace: true },
    );
  }, [bookmarksReturn, navigate]);

  const handleShowAllBookmarks = useCallback(() => {
    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId: 'bookmarks',
        mode: 'search',
        searchActive: false,
        searchQuery: '',
        searchPage: 1,
        authorActive: false,
        authorQuery: '',
        authorPage: 1,
        mangaQuery: '',
        bookmarksFilterScraperId: null,
      }),
    }, {
      replace: true,
      state: locationState,
    });
  }, [location.pathname, location.search, locationState, navigate]);

  const handleOpenBookmark = useCallback((bookmark: ScraperBookmarkRecord) => {
    const scraper = scrapersById.get(bookmark.scraperId);
    if (!scraper) {
      return;
    }

    navigate({
      pathname: location.pathname,
      search: writeScraperRouteState(location.search, {
        scraperId: scraper.id,
        mode: 'manga',
        searchActive: false,
        searchQuery: '',
        searchPage: 1,
        authorActive: false,
        authorQuery: '',
        authorPage: 1,
        mangaQuery: '',
        mangaUrl: bookmark.sourceUrl,
      }),
    }, {
      state: {
        ...(locationState ?? {}),
        scraperBrowserHistorySource: {
          kind: 'bookmarks',
        },
      },
    });
  }, [location.pathname, location.search, locationState, navigate, scrapersById]);

  const getLinkedMangaForBookmark = useCallback((bookmark: ScraperBookmarkRecord): Manga | null => (
    findMangaLinkedToSource(libraryMangas, {
      scraperId: bookmark.scraperId,
      sourceUrl: bookmark.sourceUrl,
    })
  ), [libraryMangas]);

  const handleDownloadBookmark = useCallback(async (
    bookmark: ScraperBookmarkRecord,
    scraper: ScraperRecord,
  ) => {
    if (downloadingSourceUrl) {
      return;
    }

    const downloadConfig = getStandaloneDownloadConfig(scraper);
    if (!downloadConfig) {
      setDownloadError('Le telechargement direct depuis une card requiert `Fiche` et `Pages` sans liaison chapitre.');
      return;
    }

    const linkedManga = getLinkedMangaForBookmark(bookmark);

    setDownloadingSourceUrl(bookmark.sourceUrl);
    setDownloadMessage(null);
    setDownloadError(null);

    try {
      const downloadResult = await queueStandaloneScraperCardDownload({
        scraper,
        detailsConfig: downloadConfig.detailsConfig,
        pagesConfig: downloadConfig.pagesConfig,
        sourceUrl: bookmark.sourceUrl,
        fallbackTitle: bookmark.title,
        libraryMangas,
        replaceMangaId: linkedManga?.id ?? null,
      });

      setDownloadMessage(buildScraperDownloadQueuedMessage({
        queueResult: downloadResult.queueResult,
        isReplacement: Boolean(downloadResult.replaceMangaId),
      }));
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Le telechargement du manga a echoue.');
    } finally {
      setDownloadingSourceUrl(null);
    }
  }, [
    downloadingSourceUrl,
    getLinkedMangaForBookmark,
    libraryMangas,
  ]);

  const renderBookmarkDownloadAction = useCallback((
    bookmark: ScraperBookmarkRecord,
    scraper: ScraperRecord | null,
  ): ScraperCardAction | null => {
    if (!scraper || !getStandaloneDownloadConfig(scraper)) {
      return null;
    }

    const linkedManga = getLinkedMangaForBookmark(bookmark);
    const isDownloading = downloadingSourceUrl === bookmark.sourceUrl;
    const label = isDownloading
      ? 'Telechargement...'
      : linkedManga
        ? 'Retelecharger'
        : 'Telecharger';

    return {
      id: `download-${bookmark.scraperId}-${bookmark.sourceUrl}`,
      type: 'icon-secondary',
      label,
      ariaLabel: `${label} ${bookmark.title}`,
      icon: <DownloadArrowIcon aria-hidden="true" focusable="false" />,
      className: [
        'is-download',
        linkedManga ? 'is-linked' : '',
      ].join(' ').trim(),
      onClick: () => {
        void handleDownloadBookmark(bookmark, scraper);
      },
      disabled: Boolean(downloadingSourceUrl),
    };
  }, [
    downloadingSourceUrl,
    getLinkedMangaForBookmark,
    handleDownloadBookmark,
  ]);

  return (
    <section className="scraper-bookmarks-view scraper-browser__panel">
      <div className="scraper-bookmarks-view__header">
        <div>
          <span className="scraper-browser__eyebrow">Bookmarks scraper</span>
          <div className="scraper-bookmarks-view__title-row">
            {bookmarksReturn ? (
              <button
                type="button"
                className="scraper-bookmarks-view__back"
                onClick={handleBack}
                aria-label="Retour"
                title="Retour"
              >
                <ChevronLeftIcon aria-hidden="true" focusable="false" />
              </button>
            ) : null}
            <h2>
              {filteredScraper
                ? `Bookmarks de ${filteredScraper.name}`
                : filterScraperId
                  ? `Bookmarks du scrapper ${filterScraperId}`
                  : 'Tous les bookmarks'}
            </h2>
          </div>
          <p>
            {filterScraperId
              ? 'Cette vue regroupe les mangas sauvegardes pour ce scrapper uniquement.'
              : 'Cette vue regroupe tous les bookmarks sauvegardes, quel que soit leur scrapper.'}
          </p>
        </div>

        {filterScraperId ? (
          <button
            type="button"
            className="scraper-bookmarks-view__clear"
            onClick={handleShowAllBookmarks}
          >
            Voir tous les scrappers
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="scraper-browser__message is-error">{error}</div>
      ) : null}

      {downloadMessage ? (
        <div className="scraper-browser__message is-success">{downloadMessage}</div>
      ) : null}

      {downloadError ? (
        <div className="scraper-browser__message is-error">{downloadError}</div>
      ) : null}

      {!loaded && loading ? (
        <div className="scraper-browser__message">Chargement des bookmarks...</div>
      ) : bookmarks.length === 0 ? (
        <div className="scraper-browser__message is-warning">
          {filterScraperId
            ? 'Aucun bookmark n\'a encore ete enregistre pour ce scrapper.'
            : 'Aucun bookmark scraper n\'a encore ete enregistre.'}
        </div>
      ) : (
        <div className="scraper-browser__results-grid">
          {bookmarks.map((bookmark) => {
            const scraper = scrapersById.get(bookmark.scraperId) ?? null;

            return (
              <ScraperBookmarkCard
                key={`${bookmark.scraperId}-${bookmark.sourceUrl}`}
                bookmark={bookmark}
                scraper={scraper}
                downloadAction={renderBookmarkDownloadAction(bookmark, scraper)}
                onOpenBookmark={handleOpenBookmark}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
