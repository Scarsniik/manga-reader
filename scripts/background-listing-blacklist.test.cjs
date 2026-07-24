const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    BACKGROUND_LISTING_MAX_STAGNANT_BACKFILL_PAGES,
    filterBackgroundListingSourcesByBlacklist,
    isBackgroundListingPaginationStalled,
    resolveBackgroundListingAcceptedTarget,
    shouldContinueBackgroundBlacklistBackfill,
  } from "@/renderer/backgroundSearch/backgroundListingBlacklist";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "background-listing-blacklist-test.ts" },
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
  BACKGROUND_LISTING_MAX_STAGNANT_BACKFILL_PAGES,
  filterBackgroundListingSourcesByBlacklist,
  isBackgroundListingPaginationStalled,
  resolveBackgroundListingAcceptedTarget,
  shouldContinueBackgroundBlacklistBackfill,
} = bundledModule.exports;

const makeSource = (scraperId, title, tags = [], tagUrls = []) => ({
  scraper: { id: scraperId, name: scraperId },
  result: { title, tags, tagUrls },
  pageIndex: 0,
  searchTerm: "",
  sourceLanguageCodes: [],
  tentativeAuthorNames: [],
  contentTypes: [],
});

test("background latest filtering excludes blacklisted sources before they are counted", () => {
  const sources = [
    makeSource("source-a", "Blocked by value", ["netorare"]),
    makeSource("source-a", "Blocked by label", [], ["https://example.test/tags/group"]),
    makeSource("source-a", "Accepted", ["vanilla"]),
    makeSource("source-b", "Same tag, other scraper", ["netorare"]),
  ];
  const result = filterBackgroundListingSourcesByBlacklist(sources, {
    excludeBlacklistedTagCards: true,
    tagBlacklistByScraper: {
      "source-a": [
        { value: "netorare" },
        { value: "group", label: "https://example.test/tags/group" },
      ],
    },
  });

  assert.equal(result.excludedCount, 2);
  assert.deepEqual(result.accepted.map((item) => item.result.title), [
    "Accepted",
    "Same tag, other scraper",
  ]);
});

test("background latest filtering preserves every source when exclusion is disabled", () => {
  const sources = [makeSource("source-a", "Blocked", ["netorare"])];
  const result = filterBackgroundListingSourcesByBlacklist(sources, {
    excludeBlacklistedTagCards: false,
    tagBlacklistByScraper: { "source-a": [{ value: "netorare" }] },
  });

  assert.equal(result.excludedCount, 0);
  assert.equal(result.accepted, sources);
});

test("blacklisted sources do not consume the result target", () => {
  assert.equal(resolveBackgroundListingAcceptedTarget(30, 30), 30);
  assert.equal(shouldContinueBackgroundBlacklistBackfill({
    sourceHasNextPage: true,
    nextPageIndex: 1,
    configuredMaxPages: 1,
    resultLimit: 30,
    acceptedResultTarget: 30,
    storedResultCount: 3,
  }), true);
  assert.equal(shouldContinueBackgroundBlacklistBackfill({
    sourceHasNextPage: true,
    nextPageIndex: 8,
    configuredMaxPages: 1,
    resultLimit: 30,
    acceptedResultTarget: 30,
    storedResultCount: 30,
  }), false);
});

test("background blacklist backfill detects a pagination URL that no longer advances", () => {
  assert.equal(isBackgroundListingPaginationStalled(
    "https://example.test/?page=2",
    "https://example.test/?page=2",
  ), true);
  assert.equal(isBackgroundListingPaginationStalled(
    "https://example.test/?page=2",
    "https://example.test/?page=3",
  ), false);
  assert.equal(isBackgroundListingPaginationStalled(
    undefined,
    "https://example.test/?page=2",
  ), false);
  assert.equal(BACKGROUND_LISTING_MAX_STAGNANT_BACKFILL_PAGES, 3);
});
