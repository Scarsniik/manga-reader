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
  getScraperBookmarkChapterNumber,
  matchesScraperBookmarkSeriesFilter,
} = require("../dist/renderer/components/ScraperBookmarks/bookmarkSeriesFiltering.js");
const {
  createDefaultScraperTitleAnalysisConfig,
} = require("../dist/renderer/utils/scraperTitleAnalysis/defaults.js");

const createBookmark = (title, scraperId = "test-scraper") => ({
  scraperId,
  sourceUrl: `https://example.test/${encodeURIComponent(title)}`,
  title,
  authors: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

test("series-only keeps titles with a parsed chapter number", () => {
  assert.equal(matchesScraperBookmarkSeriesFilter(
    createBookmark("Example Chapter 2"),
    "only",
  ), true);
  assert.equal(matchesScraperBookmarkSeriesFilter(
    createBookmark("Standalone example"),
    "only",
  ), false);
  assert.equal(matchesScraperBookmarkSeriesFilter(
    createBookmark("Example Volume 2"),
    "only",
  ), false);
});

test("series exclusion retains standalone titles and the first chapter", () => {
  assert.equal(matchesScraperBookmarkSeriesFilter(
    createBookmark("Standalone example"),
    "without",
  ), true);
  assert.equal(matchesScraperBookmarkSeriesFilter(
    createBookmark("Example Chapter 1"),
    "without",
  ), true);
  assert.equal(matchesScraperBookmarkSeriesFilter(
    createBookmark("Example Chapter 0"),
    "without",
  ), true);
  assert.equal(matchesScraperBookmarkSeriesFilter(
    createBookmark("Example Chapter 2"),
    "without",
  ), false);
});

test("chapter parsing supports roman and Japanese markers", () => {
  assert.equal(getScraperBookmarkChapterNumber(createBookmark("Example Chapter II")), 2);
  assert.equal(getScraperBookmarkChapterNumber(createBookmark("作品第１話")), 1);
});

test("source title-analysis rules are used before filtering", () => {
  const config = createDefaultScraperTitleAnalysisConfig();
  config.enabled = true;
  const configs = new Map([["configured-scraper", config]]);
  const bookmark = createBookmark(
    "[Author] Example Chapter 2 [English]",
    "configured-scraper",
  );

  assert.equal(getScraperBookmarkChapterNumber(bookmark), null);
  assert.equal(getScraperBookmarkChapterNumber(bookmark, configs), 2);
  assert.equal(matchesScraperBookmarkSeriesFilter(bookmark, "only", configs), true);
  assert.equal(matchesScraperBookmarkSeriesFilter(bookmark, "without", configs), false);
});
