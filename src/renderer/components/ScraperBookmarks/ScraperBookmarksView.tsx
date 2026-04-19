import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, DownloadArrowIcon, OpenBookIcon } from '@/renderer/components/icons';
import { ScraperBrowserLocationState } from '@/renderer/components/ScraperBrowser/types';
import type { ScraperCardAction } from '@/renderer/components/ScraperCard/ScraperCard';
import {
  buildScraperViewHistoryCardId,
  type ScraperBookmarkRecord,
  type ScraperRecord,
} from '@/shared/scraper';
import ScraperBookmarkCard from '@/renderer/components/ScraperBookmarks/ScraperBookmarkCard';
import { useScraperBookmarks } from '@/renderer/stores/scraperBookmarks';
import {
  recordScraperCardsSeen,
  setScraperCardRead,
  useScraperViewHistory,
} from '@/renderer/stores/scraperViewHistory';
import type { Manga } from '@/renderer/types';
import { findMangaLinkedToSource } from '@/renderer/utils/mangaSource';
import { writeScraperRouteState } from '@/renderer/utils/scraperBrowserNavigation';
import {
  buildBookmarkViewHistoryIdentity,
  getScraperCardViewState,
  getScraperViewHistoryRecord,
} from '@/renderer/utils/scraperViewHistory';
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
import type { WorkspaceTarget } from '@/renderer/types/workspace';
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
  const {
    loaded: viewHistoryLoaded,
    recordsById: viewHistoryRecordsById,
  } = useScraperViewHistory({ scraperId: filterScraperId });
  const [libraryMangas, setLibraryMangas] = useState<Manga[]>([]);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [downloadingSourceUrl, setDownloadingSourceUrl] = useState<string | null>(null);
  const [newBookmarkIds, setNewBookmarkIds] = useState<Set<string>>(() => new Set());
  const viewHistoryRecordsByIdRef = useRef(viewHistoryRecordsById);

  const scrapersById = useMemo(
    () => new Map(scrapers.map((scraper) => [scraper.id, scraper])),
    [scrapers],
  );
  const filteredScraper = filterScraperId ? scrapersById.get(filterScraperId) ?? null : null;
  const bookmarksReturn = locationState?.bookmarksReturn ?? null;
  const bookmarksHistoryKey = useMemo(
    () => bookmarks
      .map((bookmark) => buildScraperViewHistoryCardId(buildBookmarkViewHistoryIdentity(bookmark)))
      .join('|'),
    [bookmarks],
  );

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

  useEffect(() => {
    viewHistoryRecordsByIdRef.current = viewHistoryRecordsById;
  }, [viewHistoryRecordsById]);

  useEffect(() => {
    if (!viewHistoryLoaded || !bookmarks.length) {
      setNewBookmarkIds(new Set());
      return;
    }

    const historySnapshot = viewHistoryRecordsByIdRef.current;
    setNewBookmarkIds(new Set(
      bookmarks
        .map((bookmark) => buildScraperViewHistoryCardId(buildBookmarkViewHistoryIdentity(bookmark)))
        .filter((id) => id && !historySnapshot.has(id)),
    ));
  }, [bookmarks, bookmarksHistoryKey, viewHistoryLoaded]);

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

  const handleOpenBookmarkInWorkspace = useCallback((bookmark: ScraperBookmarkRecord) => {
    const scraper = scrapersById.get(bookmark.scraperId);
    if (!scraper) {
      return;
    }

    if (!window.api || typeof window.api.openWorkspaceTarget !== 'function') {
      setDownloadError('L\'ouverture dans une fenetre workspace n\'est pas disponible dans cette version.');
      return;
    }

    const target: WorkspaceTarget = {
      kind: 'scraper.details',
      scraperId: scraper.id,
      sourceUrl: bookmark.sourceUrl,
      title: bookmark.title,
    };

    void window.api.openWorkspaceTarget(target)
      .then((opened: boolean) => {
        if (!opened) {
          setDownloadError('Impossible d\'ouvrir cette fiche dans le workspace.');
        }
      })
      .catch((error: unknown) => {
        setDownloadError(error instanceof Error ? error.message : 'Impossible d\'ouvrir cette fiche dans le workspace.');
      });
  }, [scrapersById]);

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

  const handleSetBookmarkRead = useCallback(async (
    bookmark: ScraperBookmarkRecord,
    read: boolean,
  ) => {
    setHistoryError(null);

    try {
      await setScraperCardRead({
        ...buildBookmarkViewHistoryIdentity(bookmark),
        read,
      });
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Impossible de mettre a jour l\'historique de lecture.');
    }
  }, []);

  const handleBookmarkViewed = useCallback((bookmark: ScraperBookmarkRecord) => {
    void recordScraperCardsSeen([
      buildBookmarkViewHistoryIdentity(bookmark),
    ]).catch((err) => {
      console.warn('Failed to record scraper bookmark view', err);
    });
  }, []);

  const getBookmarkViewState = useCallback((bookmark: ScraperBookmarkRecord) => {
    const identity = buildBookmarkViewHistoryIdentity(bookmark);
    const record = getScraperViewHistoryRecord(viewHistoryRecordsById, identity);
    const id = buildScraperViewHistoryCardId(identity);
    return getScraperCardViewState(record, Boolean(id && newBookmarkIds.has(id)));
  }, [newBookmarkIds, viewHistoryRecordsById]);

  const renderBookmarkReadAction = useCallback((bookmark: ScraperBookmarkRecord): ScraperCardAction => {
    const identity = buildBookmarkViewHistoryIdentity(bookmark);
    const record = getScraperViewHistoryRecord(viewHistoryRecordsById, identity);
    const isRead = Boolean(record?.readAt);
    const label = isRead ? 'Lu' : 'Marquer lu';

    return {
      id: `read-${identity.sourceUrl || identity.title}`,
      type: 'secondary',
      label,
      ariaLabel: `${isRead ? 'Marquer non lu' : 'Marquer lu'} ${bookmark.title}`,
      icon: <OpenBookIcon aria-hidden="true" focusable="false" />,
      className: [
        'is-read-toggle',
        isRead ? 'is-read' : '',
      ].join(' ').trim(),
      onClick: () => {
        void handleSetBookmarkRead(bookmark, !isRead);
      },
    };
  }, [handleSetBookmarkRead, viewHistoryRecordsById]);

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

      {historyError ? (
        <div className="scraper-browser__message is-error">{historyError}</div>
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
                viewState={getBookmarkViewState(bookmark)}
                readAction={renderBookmarkReadAction(bookmark)}
                downloadAction={renderBookmarkDownloadAction(bookmark, scraper)}
                onOpenBookmark={handleOpenBookmark}
                onOpenBookmarkInWorkspace={handleOpenBookmarkInWorkspace}
                onViewed={handleBookmarkViewed}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
