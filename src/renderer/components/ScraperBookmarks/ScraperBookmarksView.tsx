import React, { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ScraperBookmarkRecord, ScraperRecord } from '@/shared/scraper';
import ScraperBookmarkButton from '@/renderer/components/ScraperBookmarkButton/ScraperBookmarkButton';
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
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.75 5.75 8.5 12l6.25 6.25" />
                </svg>
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
            const canOpenBookmark = Boolean(scraper);

            return (
              <article
                key={`${bookmark.scraperId}-${bookmark.sourceUrl}`}
                className={[
                  'scraper-browser__result-card',
                  'scraper-bookmarks-view__card',
                  canOpenBookmark ? 'is-actionable' : '',
                ].join(' ').trim()}
                onClick={canOpenBookmark ? () => handleOpenBookmark(bookmark) : undefined}
                onKeyDown={canOpenBookmark ? (event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                  }

                  event.preventDefault();
                  handleOpenBookmark(bookmark);
                } : undefined}
                role={canOpenBookmark ? 'button' : undefined}
                tabIndex={canOpenBookmark ? 0 : undefined}
                aria-label={canOpenBookmark ? `Ouvrir la fiche ${bookmark.title}` : undefined}
              >
                <div className="scraper-browser__result-media">
                  {bookmark.cover ? (
                    <img src={bookmark.cover} alt={bookmark.title} />
                  ) : (
                    <div className="scraper-browser__result-placeholder">Pas d&apos;image</div>
                  )}
                </div>

                <div className="scraper-browser__result-body">
                  <span className="scraper-bookmarks-view__scraper-label">
                    {scraper?.name || `Scrapper indisponible (${bookmark.scraperId})`}
                  </span>
                  <h4>{bookmark.title}</h4>
                  {bookmark.description || bookmark.summary ? (
                    <p className="scraper-browser__result-summary">
                      {bookmark.description || bookmark.summary}
                    </p>
                  ) : null}

                  {bookmark.authors.length ? (
                    <div className="scraper-browser__chips">
                      {bookmark.authors.map((author) => (
                        <span key={author} className="scraper-browser__chip is-author">{author}</span>
                      ))}
                    </div>
                  ) : null}

                  {bookmark.tags.length ? (
                    <div className="scraper-browser__chips">
                      {bookmark.tags.map((tag) => (
                        <span key={tag} className="scraper-browser__chip is-tag">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="scraper-browser__result-actions">
                  <ScraperBookmarkButton
                    scraperId={bookmark.scraperId}
                    sourceUrl={bookmark.sourceUrl}
                    title={bookmark.title}
                    cover={bookmark.cover}
                    summary={bookmark.summary}
                    description={bookmark.description}
                    authors={bookmark.authors}
                    tags={bookmark.tags}
                    mangaStatus={bookmark.mangaStatus}
                    size="sm"
                  />

                  {canOpenBookmark ? (
                    <button
                      type="button"
                      className="scraper-browser__result-action-button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleOpenBookmark(bookmark);
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      Ouvrir la fiche
                    </button>
                  ) : (
                    <span className="scraper-browser__result-action-hint is-muted">
                      Scrapper indisponible
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
