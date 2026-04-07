import React, { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeftIcon } from '@/renderer/components/icons';
import type { ScraperBookmarkRecord, ScraperRecord } from '@/shared/scraper';
import ScraperBookmarkCard from '@/renderer/components/ScraperBookmarks/ScraperBookmarkCard';
import { useScraperBookmarks } from '@/renderer/stores/scraperBookmarks';
import { writeScraperRouteState } from '@/renderer/utils/scraperBrowserNavigation';
import './style.scss';

type Props = {
  scrapers: ScraperRecord[];
  filterScraperId?: string | null;
};

type ScraperBookmarksLocationState = {
  bookmarksReturn?: {
    pathname: string;
    search?: string;
  };
} | null;

export default function ScraperBookmarksView({
  scrapers,
  filterScraperId = null,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as ScraperBookmarksLocationState;
  const { bookmarks, loading, loaded, error } = useScraperBookmarks({ scraperId: filterScraperId });

  const scrapersById = useMemo(
    () => new Map(scrapers.map((scraper) => [scraper.id, scraper])),
    [scrapers],
  );
  const filteredScraper = filterScraperId ? scrapersById.get(filterScraperId) ?? null : null;
  const bookmarksReturn = locationState?.bookmarksReturn ?? null;

  const handleBack = useCallback(() => {
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
        mangaQuery: '',
        mangaUrl: bookmark.sourceUrl,
      }),
    });
  }, [location.pathname, location.search, navigate, scrapersById]);

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
                onOpenBookmark={handleOpenBookmark}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
