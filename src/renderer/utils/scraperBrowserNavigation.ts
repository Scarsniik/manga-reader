export type ScraperRouteMode = 'search' | 'manga';

export type ScraperRouteState = {
  scraperId: string | null;
  mode: ScraperRouteMode;
  searchActive: boolean;
  searchQuery: string;
  searchPage: number;
  mangaQuery: string;
  mangaUrl?: string;
  bookmarksFilterScraperId?: string | null;
};

const SCRAPER_PARAM = 'scraper';
const SCRAPER_MODE_PARAM = 'scraperMode';
const SCRAPER_SEARCH_ACTIVE_PARAM = 'scraperSearchActive';
const SCRAPER_SEARCH_QUERY_PARAM = 'scraperSearchQuery';
const SCRAPER_SEARCH_PAGE_PARAM = 'scraperSearchPage';
const SCRAPER_MANGA_QUERY_PARAM = 'scraperMangaQuery';
const SCRAPER_MANGA_URL_PARAM = 'scraperMangaUrl';
const SCRAPER_BOOKMARK_FILTER_PARAM = 'scraperBookmarkFilter';

const normalizeSearch = (search: string): URLSearchParams => (
  new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
);

const normalizePage = (value: string | null): number => {
  if (!value) {
    return 1;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
};

export const parseScraperRouteState = (search: string): ScraperRouteState => {
  const params = normalizeSearch(search);
  const scraperId = params.get(SCRAPER_PARAM) || null;
  const mode = params.get(SCRAPER_MODE_PARAM) === 'manga' ? 'manga' : 'search';

  return {
    scraperId,
    mode,
    searchActive: params.get(SCRAPER_SEARCH_ACTIVE_PARAM) === '1',
    searchQuery: params.get(SCRAPER_SEARCH_QUERY_PARAM) ?? '',
    searchPage: normalizePage(params.get(SCRAPER_SEARCH_PAGE_PARAM)),
    mangaQuery: params.get(SCRAPER_MANGA_QUERY_PARAM) ?? '',
    mangaUrl: params.get(SCRAPER_MANGA_URL_PARAM) || undefined,
    bookmarksFilterScraperId: params.get(SCRAPER_BOOKMARK_FILTER_PARAM) || null,
  };
};

export const writeScraperRouteState = (
  search: string,
  state: ScraperRouteState,
): string => {
  const params = normalizeSearch(search);

  params.delete(SCRAPER_PARAM);
  params.delete(SCRAPER_MODE_PARAM);
  params.delete(SCRAPER_SEARCH_ACTIVE_PARAM);
  params.delete(SCRAPER_SEARCH_QUERY_PARAM);
  params.delete(SCRAPER_SEARCH_PAGE_PARAM);
  params.delete(SCRAPER_MANGA_QUERY_PARAM);
  params.delete(SCRAPER_MANGA_URL_PARAM);
  params.delete(SCRAPER_BOOKMARK_FILTER_PARAM);

  if (!state.scraperId) {
    const nextSearch = params.toString();
    return nextSearch ? `?${nextSearch}` : '';
  }

  params.set(SCRAPER_PARAM, state.scraperId);
  params.set(SCRAPER_MODE_PARAM, state.mode);

  if (state.searchActive) {
    params.set(SCRAPER_SEARCH_ACTIVE_PARAM, '1');
    params.set(SCRAPER_SEARCH_PAGE_PARAM, String(Math.max(1, state.searchPage)));

    if (state.searchQuery) {
      params.set(SCRAPER_SEARCH_QUERY_PARAM, state.searchQuery);
    }
  }

  if (state.mode === 'manga') {
    if (state.mangaQuery) {
      params.set(SCRAPER_MANGA_QUERY_PARAM, state.mangaQuery);
    }

    if (state.mangaUrl) {
      params.set(SCRAPER_MANGA_URL_PARAM, state.mangaUrl);
    }
  }

  if (state.scraperId === 'bookmarks' && state.bookmarksFilterScraperId) {
    params.set(SCRAPER_BOOKMARK_FILTER_PARAM, state.bookmarksFilterScraperId);
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
};

export const clearScraperRouteState = (search: string): string => (
  writeScraperRouteState(search, {
    scraperId: null,
    mode: 'search',
    searchActive: false,
    searchQuery: '',
    searchPage: 1,
    mangaQuery: '',
    bookmarksFilterScraperId: null,
  })
);
