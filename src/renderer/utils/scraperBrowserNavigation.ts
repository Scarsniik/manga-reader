export type ScraperRouteMode = 'homepage' | 'search' | 'manga' | 'author' | 'tag';

export const SCRAPER_MULTI_SEARCH_VIEW_ID = 'multi-search';
export const SCRAPER_AUTHOR_FAVORITES_VIEW_ID = 'author-favorites';
export const SCRAPER_TAG_FAVORITES_VIEW_ID = 'tag-favorites';
export const SCRAPER_HISTORY_VIEW_ID = 'history';
export const SCRAPER_LATEST_VIEW_ID = 'latest';

export type MultiSearchPrefillLocationState = {
  multiSearchPrefillQuery?: string;
};

export type ScraperRouteState = {
  scraperId: string | null;
  mode: ScraperRouteMode;
  homepageActive?: boolean;
  homepagePage?: number;
  searchActive: boolean;
  searchQuery: string;
  searchPage: number;
  authorActive: boolean;
  authorQuery: string;
  authorPage: number;
  tagActive?: boolean;
  tagQuery?: string;
  tagPage?: number;
  mangaQuery: string;
  mangaUrl?: string;
  bookmarksFilterScraperId?: string | null;
};

const SCRAPER_PARAM = 'scraper';
const SCRAPER_MODE_PARAM = 'scraperMode';
const SCRAPER_HOMEPAGE_ACTIVE_PARAM = 'scraperHomepageActive';
const SCRAPER_HOMEPAGE_PAGE_PARAM = 'scraperHomepagePage';
const SCRAPER_SEARCH_ACTIVE_PARAM = 'scraperSearchActive';
const SCRAPER_SEARCH_QUERY_PARAM = 'scraperSearchQuery';
const SCRAPER_SEARCH_PAGE_PARAM = 'scraperSearchPage';
const SCRAPER_AUTHOR_ACTIVE_PARAM = 'scraperAuthorActive';
const SCRAPER_AUTHOR_QUERY_PARAM = 'scraperAuthorQuery';
const SCRAPER_AUTHOR_PAGE_PARAM = 'scraperAuthorPage';
const SCRAPER_TAG_ACTIVE_PARAM = 'scraperTagActive';
const SCRAPER_TAG_QUERY_PARAM = 'scraperTagQuery';
const SCRAPER_TAG_PAGE_PARAM = 'scraperTagPage';
const SCRAPER_MANGA_QUERY_PARAM = 'scraperMangaQuery';
const SCRAPER_MANGA_URL_PARAM = 'scraperMangaUrl';
const SCRAPER_BOOKMARK_FILTER_PARAM = 'scraperBookmarkFilter';
const SCRAPER_AUTHOR_FAVORITE_PARAM = 'scraperAuthorFavorite';
const SCRAPER_TAG_FAVORITE_PARAM = 'scraperTagFavorite';

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
  const rawMode = params.get(SCRAPER_MODE_PARAM);
  const mode = rawMode === 'manga'
    ? 'manga'
    : rawMode === 'author'
      ? 'author'
      : rawMode === 'tag'
        ? 'tag'
        : rawMode === 'homepage'
          ? 'homepage'
          : 'search';

  return {
    scraperId,
    mode,
    homepageActive: params.get(SCRAPER_HOMEPAGE_ACTIVE_PARAM) === '1',
    homepagePage: normalizePage(params.get(SCRAPER_HOMEPAGE_PAGE_PARAM)),
    searchActive: params.get(SCRAPER_SEARCH_ACTIVE_PARAM) === '1',
    searchQuery: params.get(SCRAPER_SEARCH_QUERY_PARAM) ?? '',
    searchPage: normalizePage(params.get(SCRAPER_SEARCH_PAGE_PARAM)),
    authorActive: params.get(SCRAPER_AUTHOR_ACTIVE_PARAM) === '1',
    authorQuery: params.get(SCRAPER_AUTHOR_QUERY_PARAM) ?? '',
    authorPage: normalizePage(params.get(SCRAPER_AUTHOR_PAGE_PARAM)),
    tagActive: params.get(SCRAPER_TAG_ACTIVE_PARAM) === '1',
    tagQuery: params.get(SCRAPER_TAG_QUERY_PARAM) ?? '',
    tagPage: normalizePage(params.get(SCRAPER_TAG_PAGE_PARAM)),
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
  params.delete(SCRAPER_HOMEPAGE_ACTIVE_PARAM);
  params.delete(SCRAPER_HOMEPAGE_PAGE_PARAM);
  params.delete(SCRAPER_SEARCH_ACTIVE_PARAM);
  params.delete(SCRAPER_SEARCH_QUERY_PARAM);
  params.delete(SCRAPER_SEARCH_PAGE_PARAM);
  params.delete(SCRAPER_AUTHOR_ACTIVE_PARAM);
  params.delete(SCRAPER_AUTHOR_QUERY_PARAM);
  params.delete(SCRAPER_AUTHOR_PAGE_PARAM);
  params.delete(SCRAPER_TAG_ACTIVE_PARAM);
  params.delete(SCRAPER_TAG_QUERY_PARAM);
  params.delete(SCRAPER_TAG_PAGE_PARAM);
  params.delete(SCRAPER_MANGA_QUERY_PARAM);
  params.delete(SCRAPER_MANGA_URL_PARAM);
  params.delete(SCRAPER_BOOKMARK_FILTER_PARAM);
  params.delete(SCRAPER_AUTHOR_FAVORITE_PARAM);
  params.delete(SCRAPER_TAG_FAVORITE_PARAM);

  if (!state.scraperId) {
    const nextSearch = params.toString();
    return nextSearch ? `?${nextSearch}` : '';
  }

  params.set(SCRAPER_PARAM, state.scraperId);
  params.set(SCRAPER_MODE_PARAM, state.mode);

  if (state.homepageActive) {
    params.set(SCRAPER_HOMEPAGE_ACTIVE_PARAM, '1');
    params.set(SCRAPER_HOMEPAGE_PAGE_PARAM, String(Math.max(1, state.homepagePage ?? 1)));
  }

  if (state.searchActive) {
    params.set(SCRAPER_SEARCH_ACTIVE_PARAM, '1');
    params.set(SCRAPER_SEARCH_PAGE_PARAM, String(Math.max(1, state.searchPage)));

    if (state.searchQuery) {
      params.set(SCRAPER_SEARCH_QUERY_PARAM, state.searchQuery);
    }
  }

  if (state.authorActive) {
    params.set(SCRAPER_AUTHOR_ACTIVE_PARAM, '1');
    params.set(SCRAPER_AUTHOR_PAGE_PARAM, String(Math.max(1, state.authorPage)));

    if (state.authorQuery) {
      params.set(SCRAPER_AUTHOR_QUERY_PARAM, state.authorQuery);
    }
  }

  if (state.tagActive) {
    params.set(SCRAPER_TAG_ACTIVE_PARAM, '1');
    params.set(SCRAPER_TAG_PAGE_PARAM, String(Math.max(1, state.tagPage ?? 1)));

    if (state.tagQuery) {
      params.set(SCRAPER_TAG_QUERY_PARAM, state.tagQuery);
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
    homepageActive: false,
    homepagePage: 1,
    searchActive: false,
    searchQuery: '',
    searchPage: 1,
    authorActive: false,
    authorQuery: '',
    authorPage: 1,
    tagActive: false,
    tagQuery: '',
    tagPage: 1,
    mangaQuery: '',
    bookmarksFilterScraperId: null,
  })
);

export const readScraperAuthorFavoriteRouteId = (search: string): string | null => (
  normalizeSearch(search).get(SCRAPER_AUTHOR_FAVORITE_PARAM) || null
);

export const writeScraperAuthorFavoriteRouteState = (
  search: string,
  favoriteId: string | null | undefined,
): string => {
  const params = normalizeSearch(search);
  const trimmedFavoriteId = String(favoriteId ?? '').trim();

  params.delete(SCRAPER_AUTHOR_FAVORITE_PARAM);
  if (trimmedFavoriteId) {
    params.set(SCRAPER_AUTHOR_FAVORITE_PARAM, trimmedFavoriteId);
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
};

export const readScraperTagFavoriteRouteId = (search: string): string | null => (
  normalizeSearch(search).get(SCRAPER_TAG_FAVORITE_PARAM) || null
);

export const writeScraperTagFavoriteRouteState = (
  search: string,
  favoriteId: string | null | undefined,
): string => {
  const params = normalizeSearch(search);
  const trimmedFavoriteId = String(favoriteId ?? '').trim();

  params.delete(SCRAPER_TAG_FAVORITE_PARAM);
  if (trimmedFavoriteId) {
    params.set(SCRAPER_TAG_FAVORITE_PARAM, trimmedFavoriteId);
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
};
