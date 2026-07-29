const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    buildCompleteAuthorFavoriteCache,
    buildLatestAuthorCacheUpdates,
    isAuthorFavoriteCacheUsable,
    loadUsableAuthorFavoriteCaches,
    mergeAuthorFavoriteCacheUpdate,
  } from "@/renderer/utils/scraperAuthorFavoriteCache";
  export {
    normalizeAuthorCorrespondenceTarget,
  } from "@/renderer/utils/authorCorrespondenceIdentity";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "author-favorite-cache-test.ts" },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  alias: { "@": path.resolve("src") },
});
const bundledModule = { exports: {} };
new Function("module", "exports", "require", built.outputFiles[0].text)(
  bundledModule,
  bundledModule.exports,
  require,
);

const {
  buildCompleteAuthorFavoriteCache,
  buildLatestAuthorCacheUpdates,
  isAuthorFavoriteCacheUsable,
  loadUsableAuthorFavoriteCaches,
  mergeAuthorFavoriteCacheUpdate,
  normalizeAuthorCorrespondenceTarget,
} = bundledModule.exports;

const upperCaseAuthorUrl = "https://momoniji.com/cartoonist/%E3%81%B2%E3%82%84%E3%81%97%E3%81%BE%E3%81%8F%E3%82%89/";
const lowerCaseAuthorUrl = upperCaseAuthorUrl.toLowerCase();
const detailUrl = "https://momoniji.com/manga/one/";

const buildSourceResult = (title, url = detailUrl) => ({
  pageIndex: 0,
  searchTerm: "ひやしまくら",
  result: {
    title,
    detailUrl: url,
  },
});

const buildFavorite = (updatedAt) => ({
  id: "favorite",
  name: "Hiyashi",
  sources: [{
    scraperId: "momoniji",
    authorUrl: upperCaseAuthorUrl,
    name: "Hiyashi",
    createdAt: updatedAt,
    updatedAt,
  }],
  createdAt: updatedAt,
  updatedAt,
});

const buildCompleteCache = (cachedAt, favoriteUpdatedAt) => ({
  favoriteId: "favorite",
  favoriteUpdatedAt,
  cachedAt,
  completedAt: cachedAt,
  sources: [{
    key: "momoniji::author",
    scraperId: "momoniji",
    authorUrl: upperCaseAuthorUrl,
    sourceName: "Hiyashi",
    loadedPages: 1,
    hasNextPage: false,
    results: [{
      pageIndex: 0,
      searchTerm: "Hiyashi",
      result: { title: "Manga", detailUrl },
    }],
    updatedAt: cachedAt,
  }],
});

test("percent-encoded author URLs are canonicalized independently of hex casing", () => {
  assert.equal(
    normalizeAuthorCorrespondenceTarget(upperCaseAuthorUrl),
    normalizeAuthorCorrespondenceTarget(lowerCaseAuthorUrl),
  );
});

test("a complete refresh deduplicates canonical author sources and their cards", () => {
  const scraper = { id: "momoniji" };
  const input = {
    favoriteId: "favorite",
    favoriteUpdatedAt: "favorite-updated",
    maxPages: null,
    paceMode: "careful",
    includedLanguageCodes: [],
    scrapeDetailsWithCards: false,
    sources: [
      { id: "source-1", name: "Hiyashi", scraper, query: upperCaseAuthorUrl },
      { id: "source-2", name: "ひやしまくら", scraper, query: "ひやしまくら" },
    ],
  };
  const result = {
    runs: [
      {
        key: "source-1",
        name: "Hiyashi",
        scraper,
        query: upperCaseAuthorUrl,
        status: "done",
        results: [buildSourceResult("Manga")],
        loadedPages: 1,
        hasNextPage: false,
        currentPageUrl: upperCaseAuthorUrl,
      },
      {
        key: "source-2",
        name: "ひやしまくら",
        scraper,
        query: "ひやしまくら",
        status: "done",
        results: [buildSourceResult("Manga")],
        loadedPages: 1,
        hasNextPage: false,
        currentPageUrl: lowerCaseAuthorUrl,
      },
    ],
  };

  const cache = buildCompleteAuthorFavoriteCache(input, result);
  assert.equal(cache.sources.length, 1);
  assert.equal(cache.sources[0].results.length, 1);
});

test("latest author updates merge new cards without duplicating cached cards", () => {
  const existing = {
    favoriteId: "favorite",
    cachedAt: "before",
    completedAt: "complete",
    sources: [{
      key: "momoniji::old",
      scraperId: "momoniji",
      authorUrl: "ひやしまくら",
      sourceName: "Hiyashi",
      loadedPages: 10,
      hasNextPage: false,
      currentPageUrl: upperCaseAuthorUrl,
      results: [{
        pageIndex: 0,
        searchTerm: "Hiyashi",
        result: { title: "Old title", detailUrl },
      }],
      updatedAt: "before",
    }],
  };
  const update = {
    favoriteId: "favorite",
    cachedAt: "after",
    sources: [{
      key: "momoniji::new",
      scraperId: "momoniji",
      authorUrl: "ひやしまくら",
      sourceName: "ひやしまくら",
      loadedPages: 1,
      hasNextPage: true,
      currentPageUrl: lowerCaseAuthorUrl,
      results: [
        {
          pageIndex: 0,
          searchTerm: "ひやしまくら",
          result: { title: "Updated title", detailUrl },
        },
        {
          pageIndex: 0,
          searchTerm: "ひやしまくら",
          result: { title: "New manga", detailUrl: "https://momoniji.com/manga/two/" },
        },
      ],
      updatedAt: "after",
    }],
  };

  const merged = mergeAuthorFavoriteCacheUpdate(existing, update);
  assert.equal(merged.completedAt, "complete");
  assert.equal(merged.sources.length, 1);
  assert.equal(merged.sources[0].results.length, 2);
  assert.equal(merged.sources[0].results[0].result.title, "Updated title");
  assert.equal(merged.sources[0].hasNextPage, false);
});

test("latest author cache updates include known cards hidden from the result view", () => {
  const scraper = { id: "momoniji" };
  const input = {
    maxPages: 1,
    paceMode: "careful",
    includedLanguageCodes: [],
    scrapeDetailsWithCards: false,
    sources: [{
      id: "favorite::momoniji::author",
      favoriteId: "favorite",
      favoriteUpdatedAt: "favorite-updated",
      favoriteSourceName: "Hiyashi",
      name: "Hiyashi",
      scraper,
      query: upperCaseAuthorUrl,
    }],
  };
  const knownResult = buildSourceResult("Known manga");
  const newResult = buildSourceResult("New manga", "https://momoniji.com/manga/new/");
  const result = {
    runs: [{
      key: "favorite::momoniji::author",
      name: "Hiyashi",
      scraper,
      query: upperCaseAuthorUrl,
      status: "done",
      results: [newResult],
      cacheResults: [knownResult, newResult],
      loadedPages: 1,
      hasNextPage: true,
      currentPageUrl: upperCaseAuthorUrl,
    }],
  };

  const update = buildLatestAuthorCacheUpdates(input, result).get("favorite");
  assert.equal(update.sources[0].results.length, 2);
});

test("a complete recent cache is usable for latest author searches", () => {
  const favoriteUpdatedAt = "2026-07-29T08:00:00.000Z";
  const cachedAt = "2026-07-29T09:00:00.000Z";
  assert.equal(isAuthorFavoriteCacheUsable(
    buildFavorite(favoriteUpdatedAt),
    buildCompleteCache(cachedAt, favoriteUpdatedAt),
    24,
    Date.parse("2026-07-29T10:00:00.000Z"),
  ), true);
});

test("an author cache older than the configured duration is not used", () => {
  const favoriteUpdatedAt = "2026-07-28T08:00:00.000Z";
  const cachedAt = "2026-07-28T09:00:00.000Z";
  assert.equal(isAuthorFavoriteCacheUsable(
    buildFavorite(favoriteUpdatedAt),
    buildCompleteCache(cachedAt, favoriteUpdatedAt),
    24,
    Date.parse("2026-07-29T10:00:00.000Z"),
  ), false);
});

test("editing a favorite after caching invalidates its cache", () => {
  const cachedAt = "2026-07-29T09:00:00.000Z";
  assert.equal(isAuthorFavoriteCacheUsable(
    buildFavorite("2026-07-29T09:30:00.000Z"),
    buildCompleteCache(cachedAt, "2026-07-29T08:00:00.000Z"),
    24,
    Date.parse("2026-07-29T10:00:00.000Z"),
  ), false);
});

test("a partial cache without a completed scan is not used", () => {
  const favoriteUpdatedAt = "2026-07-29T08:00:00.000Z";
  const cache = buildCompleteCache("2026-07-29T09:00:00.000Z", favoriteUpdatedAt);
  delete cache.completedAt;
  assert.equal(isAuthorFavoriteCacheUsable(
    buildFavorite(favoriteUpdatedAt),
    cache,
    24,
    Date.parse("2026-07-29T10:00:00.000Z"),
  ), false);
});

test("reusing a cache does not create a cache update with a newer date", () => {
  const scraper = { id: "momoniji" };
  const input = {
    maxPages: 1,
    paceMode: "careful",
    includedLanguageCodes: [],
    scrapeDetailsWithCards: false,
    sources: [{
      id: "favorite::momoniji::author",
      favoriteId: "favorite",
      favoriteUpdatedAt: "favorite-updated",
      name: "Hiyashi",
      scraper,
      query: upperCaseAuthorUrl,
    }],
  };
  const result = {
    runs: [{
      key: "favorite::momoniji::author",
      name: "Hiyashi",
      scraper,
      query: upperCaseAuthorUrl,
      status: "done",
      results: [buildSourceResult("Manga")],
      cacheResults: [buildSourceResult("Manga")],
      fromCache: true,
      loadedPages: 1,
      hasNextPage: false,
    }],
  };

  assert.equal(buildLatestAuthorCacheUpdates(input, result).size, 0);
});

test("cache validation is independent for every favorite in a mixed search", async () => {
  const now = Date.parse("2026-07-29T10:00:00.000Z");
  const validUpdatedAt = "2026-07-29T08:00:00.000Z";
  const staleUpdatedAt = "2026-07-28T08:00:00.000Z";
  const validFavorite = buildFavorite(validUpdatedAt);
  const staleFavorite = {
    ...buildFavorite(staleUpdatedAt),
    id: "stale-favorite",
  };
  const caches = new Map([
    ["favorite", buildCompleteCache("2026-07-29T09:00:00.000Z", validUpdatedAt)],
    ["stale-favorite", {
      ...buildCompleteCache("2026-07-28T09:00:00.000Z", staleUpdatedAt),
      favoriteId: "stale-favorite",
    }],
  ]);

  const usable = await loadUsableAuthorFavoriteCaches(
    [validFavorite, staleFavorite],
    24,
    async (favoriteId) => caches.get(favoriteId) ?? null,
    now,
  );

  assert.deepEqual(Array.from(usable.keys()), ["favorite"]);
});
