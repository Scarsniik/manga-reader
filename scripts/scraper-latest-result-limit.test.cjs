const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    resolveScraperLatestTotalGroupKey,
    allocateScraperLatestFixedTargets,
    resolveScraperLatestTotalTarget,
    buildScraperListingPageRequestKey,
    createScraperListingPagePrefetchCache,
    planScraperLatestBalancedBatches,
    selectScraperLatestRoundRobinIndexes,
  } from "@/renderer/utils/scraperLatestExecutionPlanning";
  export {
    DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT,
    normalizeScraperLatestDeepPageLimit,
  } from "@/shared/scraperLatestSettings";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "scraper-latest-result-limit-test.ts" },
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
  resolveScraperLatestTotalGroupKey,
  allocateScraperLatestFixedTargets,
  resolveScraperLatestTotalTarget,
  buildScraperListingPageRequestKey,
  createScraperListingPagePrefetchCache,
  planScraperLatestBalancedBatches,
  selectScraperLatestRoundRobinIndexes,
  DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT,
  normalizeScraperLatestDeepPageLimit,
} = bundledModule.exports;

test("legacy unlimited deep scans migrate to the finite default", () => {
  assert.equal(DEFAULT_SCRAPER_LATEST_DEEP_PAGE_LIMIT, 50);
  assert.equal(normalizeScraperLatestDeepPageLimit(0), 50);
  assert.equal(normalizeScraperLatestDeepPageLimit("0"), 50);
  assert.equal(normalizeScraperLatestDeepPageLimit(undefined), 50);
  assert.equal(normalizeScraperLatestDeepPageLimit(1), 1);
  assert.equal(normalizeScraperLatestDeepPageLimit(12.9), 12);
});

test("total latest quotas keep every favorite tag in its own group", () => {
  assert.equal(resolveScraperLatestTotalGroupKey({
    key: "source-a",
    sourceKind: "scraper",
  }), "scraper");
  assert.equal(resolveScraperLatestTotalGroupKey({
    key: "glasses-a",
    sourceKind: "tagFavorite",
    favorite: { id: "glasses" },
  }), "tagFavorite:glasses");
  assert.equal(resolveScraperLatestTotalGroupKey({
    key: "hairy-a",
    sourceKind: "tagFavorite",
    favorite: { id: "hairy" },
  }), "tagFavorite:hairy");
});

test("total latest selection rotates fairly between runnable sources", () => {
  assert.deepEqual(selectScraperLatestRoundRobinIndexes([true, true, true], 2, 0), {
    selectedIndexes: [0, 1],
    nextIndex: 2,
  });
  assert.deepEqual(selectScraperLatestRoundRobinIndexes([true, true, true], 2, 2), {
    selectedIndexes: [2, 0],
    nextIndex: 1,
  });
});

test("total latest selection skips exhausted sources", () => {
  assert.deepEqual(selectScraperLatestRoundRobinIndexes([false, true, false, true], 3, 2), {
    selectedIndexes: [3, 1],
    nextIndex: 2,
  });
});

test("continuation adds one total quota instead of one quota per source", () => {
  assert.equal(resolveScraperLatestTotalTarget(5, 5, false), 5);
  assert.equal(resolveScraperLatestTotalTarget(5, 5, true), 10);
});

test("total latest fixed targets split the user quota before scraping", () => {
  assert.deepEqual(allocateScraperLatestFixedTargets([0, 1, 2], 8), [
    { sourceIndex: 0, allocatedResultCount: 3, targetResultCount: 3 },
    { sourceIndex: 1, allocatedResultCount: 3, targetResultCount: 3 },
    { sourceIndex: 2, allocatedResultCount: 2, targetResultCount: 2 },
  ]);
});

test("continuation gives every source its fixed additional share", () => {
  const counts = [4, 7];
  assert.deepEqual(allocateScraperLatestFixedTargets(
    [0, 1],
    10,
    (sourceIndex) => counts[sourceIndex],
    true,
  ), [
    { sourceIndex: 0, allocatedResultCount: 5, targetResultCount: 9 },
    { sourceIndex: 1, allocatedResultCount: 5, targetResultCount: 12 },
  ]);
});

test("total latest planning assigns an optimistic balanced batch to every source", () => {
  const counts = [0, 0];
  assert.deepEqual(planScraperLatestBalancedBatches({
    sourceIndexes: [0, 1],
    resultLimit: 20,
    getResultCount: (sourceIndex) => counts[sourceIndex],
    canContinue: () => true,
  }), {
    batches: [
      { sourceIndex: 0, requestedResultCount: 10, targetResultCount: 10 },
      { sourceIndex: 1, requestedResultCount: 10, targetResultCount: 10 },
    ],
    nextPosition: 0,
  });
});

test("total latest planning recalculates every source batch from accepted results", () => {
  const counts = [6, 9];
  assert.deepEqual(planScraperLatestBalancedBatches({
    sourceIndexes: [0, 1],
    resultLimit: 20,
    getResultCount: (sourceIndex) => counts[sourceIndex],
    canContinue: () => true,
  }).batches, [
    { sourceIndex: 0, requestedResultCount: 4, targetResultCount: 10 },
    { sourceIndex: 1, requestedResultCount: 1, targetResultCount: 10 },
  ]);
});

test("total latest planning redistributes exhausted source batches", () => {
  const counts = [6, 9];
  assert.deepEqual(planScraperLatestBalancedBatches({
    sourceIndexes: [0, 1],
    resultLimit: 20,
    getResultCount: (sourceIndex) => counts[sourceIndex],
    canContinue: (sourceIndex) => sourceIndex === 1,
  }).batches, [
    { sourceIndex: 1, requestedResultCount: 5, targetResultCount: 14 },
  ]);
});

test("listing page preloading reuses the request when the source needs it", async () => {
  const cache = createScraperListingPagePrefetchCache();
  const requestKey = buildScraperListingPageRequestKey(1, "https://example.test/page/2");
  let preloadCount = 0;
  let fallbackLoadCount = 0;

  cache.preload("source-a", requestKey, async () => {
    preloadCount += 1;
    return { page: 2 };
  });
  const page = await cache.load("source-a", requestKey, async () => {
    fallbackLoadCount += 1;
    return { page: -1 };
  });

  assert.deepEqual(page, { page: 2 });
  assert.equal(preloadCount, 1);
  assert.equal(fallbackLoadCount, 0);
});

test("listing page preloading keeps at most the matching page for each source", async () => {
  const cache = createScraperListingPagePrefetchCache();
  cache.preload("source-a", buildScraperListingPageRequestKey(1), async () => ({ page: 1 }));
  cache.preload("source-a", buildScraperListingPageRequestKey(2), async () => ({ page: 2 }));

  const page = await cache.load("source-a", buildScraperListingPageRequestKey(2), async () => ({ page: -1 }));
  assert.deepEqual(page, { page: 2 });
});
