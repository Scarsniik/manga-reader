const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith("@/")
    ? path.join(__dirname, "..", "dist", request.slice(2))
    : request;
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};

const {
  buildBookmarkAuthorStats,
  buildBookmarkAuthorStatsFromCandidates,
  getBookmarkAuthorCandidates,
} = require("../dist/renderer/components/ScraperBookmarks/bookmarkAuthorStats.js");
const {
  createDefaultScraperTitleAnalysisConfig,
} = require("../dist/renderer/utils/scraperTitleAnalysis/defaults.js");

const createBookmark = ({
  scraperId = "source-a",
  sourceUrl,
  title,
  authors = [],
  authorUrls,
  cover,
}) => ({
  scraperId,
  sourceUrl,
  title,
  authors,
  authorUrls,
  cover,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

test("configured title parsers provide missing bookmark authors", () => {
  const config = createDefaultScraperTitleAnalysisConfig();
  config.enabled = true;
  const bookmark = createBookmark({
    sourceUrl: "https://source-a.test/manga/one",
    title: "[Alice Example] Parsed title [English]",
  });

  assert.deepEqual(
    getBookmarkAuthorCandidates(bookmark, new Map([[bookmark.scraperId, config]])),
    [{ name: "Alice Example", origin: "titleParser" }],
  );
});

test("stored metadata stays authoritative when the title parser finds the same author", () => {
  const config = createDefaultScraperTitleAnalysisConfig();
  config.enabled = true;
  const bookmark = createBookmark({
    sourceUrl: "https://source-a.test/manga/two",
    title: "[Alice Example] Parsed title",
    authors: ["Alice Example"],
  });

  assert.deepEqual(
    getBookmarkAuthorCandidates(bookmark, new Map([[bookmark.scraperId, config]])),
    [{ name: "Alice Example", origin: "metadata" }],
  );
});

test("author correspondence name rules merge compatible names", () => {
  const bookmarks = [
    createBookmark({
      sourceUrl: "https://source-a.test/manga/three",
      title: "First title",
      authors: ["Yahiro Pochi"],
    }),
    createBookmark({
      sourceUrl: "https://source-a.test/manga/four",
      title: "Second title",
      authors: ["Yahiro Pochl"],
    }),
  ];

  const stats = buildBookmarkAuthorStats(bookmarks, {
    minOccurrences: 1,
    configsByScraperId: new Map(),
  });

  assert.equal(stats.length, 1);
  assert.equal(stats[0].count, 2);
  assert.deepEqual(stats[0].variants.map((variant) => variant.author), [
    "Yahiro Pochi",
    "Yahiro Pochl",
  ]);
});

test("author favorites merge source aliases without double-counting associated bookmarks", () => {
  const bookmarks = [
    createBookmark({
      sourceUrl: "https://source-a.test/manga/five",
      title: "Third title",
      authors: ["Alias A"],
      cover: "https://source-a.test/covers/five.jpg",
    }),
    createBookmark({
      scraperId: "source-b",
      sourceUrl: "https://source-b.test/manga/six",
      title: "Fourth title",
      authors: ["Alias B"],
    }),
  ];
  const timestamp = "2026-01-01T00:00:00.000Z";
  const authorFavorites = [{
    id: "favorite-author",
    name: "Grouped Author",
    sources: [
      {
        scraperId: "source-a",
        authorUrl: "https://source-a.test/authors/a",
        name: "Alias A",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        scraperId: "source-b",
        authorUrl: "https://source-b.test/authors/b",
        name: "Alias B",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  }];

  const stats = buildBookmarkAuthorStats(bookmarks, {
    minOccurrences: 1,
    configsByScraperId: new Map(),
    authorFavorites,
  });

  assert.equal(stats.length, 1);
  assert.equal(stats[0].author, "Grouped Author");
  assert.equal(stats[0].favoriteName, "Grouped Author");
  assert.equal(stats[0].count, 2);
  assert.equal(stats[0].cover, "https://source-a.test/covers/five.jpg");
  assert.equal(stats[0].coverRefererUrl, "https://source-a.test/manga/five");
  assert.deepEqual(stats[0].referenceSources.map((source) => source.authorUrl), [
    "https://source-a.test/authors/a",
    "https://source-b.test/authors/b",
  ]);
});

test("incremental author grouping reuses cached name comparisons", () => {
  const compatibilityCache = new Map();
  const sources = [
    {
      bookmarkKey: "source-a::one",
      scraperId: "source-a",
      candidates: [{ name: "Yahiro Pochi", origin: "metadata" }],
    },
    {
      bookmarkKey: "source-a::two",
      scraperId: "source-a",
      candidates: [{ name: "Yahiro Pochl", origin: "metadata" }],
    },
  ];
  const options = { minOccurrences: 1, compatibilityCache };

  buildBookmarkAuthorStatsFromCandidates(sources, options);
  assert.equal(compatibilityCache.size, 1);

  buildBookmarkAuthorStatsFromCandidates(sources, options);
  assert.equal(compatibilityCache.size, 1);

  buildBookmarkAuthorStatsFromCandidates([
    ...sources,
    {
      bookmarkKey: "source-a::three",
      scraperId: "source-a",
      candidates: [{ name: "Distant Author", origin: "metadata" }],
    },
  ], options);
  assert.equal(compatibilityCache.size, 3);
});

test("linked author pages from bookmarks seed the combined author view", () => {
  const bookmark = createBookmark({
    sourceUrl: "https://source-a.test/manga/linked-author",
    title: "Linked author title",
    authors: ["Linked Author"],
    authorUrls: ["https://source-a.test/authors/linked"],
  });

  const stats = buildBookmarkAuthorStats([bookmark], {
    minOccurrences: 1,
    configsByScraperId: new Map(),
  });

  assert.deepEqual(stats[0].referenceSources, [{
    scraperId: "source-a",
    authorUrl: "https://source-a.test/authors/linked",
    name: "Linked Author",
  }]);
});
