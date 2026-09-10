const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    resolveBackgroundListingTotalGroupKey,
    isBackgroundListingSourceUnavailableForQuota,
    runBackgroundListingTotalGroup,
    resolveBackgroundLanguageProgress,
    resolveBackgroundListingConcurrency,
    resolveBackgroundListingResultLimit,
    resolveBackgroundEligibleQuickSeenProgress,
    resolveBackgroundQuickSeenProgress,
    usesBackgroundQuickSeenBoundary,
  } from "@/renderer/backgroundSearch/backgroundListingExecution";
  export {
    enrichScraperLatestCandidatesForSlots,
  } from "@/renderer/components/ScraperLatest/scraperLatestCandidateEnrichment";
  export {
    buildScraperLatestCursorCheckpointRequest,
    resolveScraperLatestCheckpointQuotaUnavailableReason,
    SCRAPER_LATEST_QUOTA_UNAVAILABLE_TTL_MS,
  } from "@/renderer/utils/scraperLatestCheckpoints";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "background-listing-execution-test.ts" },
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
  enrichScraperLatestCandidatesForSlots,
  resolveBackgroundListingTotalGroupKey,
  isBackgroundListingSourceUnavailableForQuota,
  runBackgroundListingTotalGroup,
  resolveBackgroundLanguageProgress,
  resolveBackgroundListingConcurrency,
  resolveBackgroundListingResultLimit,
  resolveBackgroundEligibleQuickSeenProgress,
  resolveBackgroundQuickSeenProgress,
  usesBackgroundQuickSeenBoundary,
  buildScraperLatestCursorCheckpointRequest,
  resolveScraperLatestCheckpointQuotaUnavailableReason,
  SCRAPER_LATEST_QUOTA_UNAVAILABLE_TTL_MS,
} = bundledModule.exports;

test("normal and background latest scans share quota-aware detail enrichment", async () => {
  const batchSizes = [];
  const result = await enrichScraperLatestCandidatesForSlots({
    candidates: [1, 2, 3, 4, 5, 6],
    remainingResultSlots: 2,
    enrichBatch: async (batch) => {
      batchSizes.push(batch.length);
      return batch;
    },
    isAccepted: (candidate) => candidate % 2 === 0,
  });

  assert.deepEqual(batchSizes, [2, 1, 1]);
  assert.deepEqual(result.acceptedCandidates, [2, 4]);
  assert.deepEqual(result.remainingCandidates, [5, 6]);
  assert.equal(result.processedCandidateCount, 4);
});

test("detail batches report rejections early enough to preload the next listing page", async () => {
  const progress = [];
  await enrichScraperLatestCandidatesForSlots({
    candidates: [1, 2, 3, 4, 5, 6],
    remainingResultSlots: 6,
    maxBatchSize: 2,
    enrichBatch: async (batch) => batch,
    isAccepted: (candidate) => candidate !== 1,
    onProgress: (snapshot) => progress.push(snapshot),
  });

  assert.equal(progress[0].acceptedCandidateCount, 0);
  assert.ok(progress.some((snapshot) => (
    snapshot.processedCandidateCount < 6
    && snapshot.acceptedCandidateCount + snapshot.remainingCandidateCount < snapshot.targetCount
  )));
});

test("total latest quotas group regular scrapers together and each favorite tag separately", () => {
  assert.equal(resolveBackgroundListingTotalGroupKey({ id: "homepage-a", mode: "homepage" }), "scraper");
  assert.equal(resolveBackgroundListingTotalGroupKey({
    id: "tag:glasses:source-a:https://example.test/tag/glasses",
    mode: "tag",
    favoriteId: "glasses",
  }), "tag:glasses");
  assert.equal(resolveBackgroundListingTotalGroupKey({
    id: "tag:hairy:source-b:https://example.test/tag/hairy",
    mode: "tag",
  }), "tag:hairy");
});

test("total latest quotas stop execution as soon as the group target is reached", async () => {
  const counts = [0, 0, 0];
  const calls = [];
  const summary = await runBackgroundListingTotalGroup({
    sourceIndexes: [0, 1, 2],
    resultLimit: 5,
    getResultCount: (sourceIndex) => counts[sourceIndex],
    canContinue: () => true,
    execute: async (sourceIndex, targetResultCount) => {
      calls.push(sourceIndex);
      counts[sourceIndex] = targetResultCount;
    },
  });

  assert.deepEqual(counts, [2, 2, 1]);
  assert.deepEqual(calls, [0, 1, 2]);
  assert.deepEqual(summary, { quotaReached: true, resultCount: 5 });
});

test("total latest quotas redistribute missing results without scraping exhausted sources again", async () => {
  const counts = [0, 0];
  const calls = [];
  await runBackgroundListingTotalGroup({
    sourceIndexes: [0, 1],
    resultLimit: 3,
    getResultCount: (sourceIndex) => counts[sourceIndex],
    canContinue: (sourceIndex) => sourceIndex === 1 || calls.filter((value) => value === 0).length === 0,
    isUnavailable: (sourceIndex) => sourceIndex === 0 && calls.includes(0),
    execute: async (sourceIndex, targetResultCount) => {
      calls.push(sourceIndex);
      if (sourceIndex === 1) counts[sourceIndex] = targetResultCount;
    },
  });

  assert.deepEqual(counts, [0, 3]);
  assert.deepEqual(calls, [0, 1, 1]);
});

test("total latest quotas do not compensate a source that still has pages after rejections", async () => {
  const counts = [0, 0];
  const calls = [];
  const summary = await runBackgroundListingTotalGroup({
    sourceIndexes: [0, 1],
    resultLimit: 20,
    getResultCount: (sourceIndex) => counts[sourceIndex],
    canContinue: () => true,
    isUnavailable: () => false,
    execute: async (sourceIndex, targetResultCount) => {
      calls.push([sourceIndex, targetResultCount]);
      if (sourceIndex === 1) counts[sourceIndex] = targetResultCount;
    },
  });

  assert.deepEqual(counts, [0, 10]);
  assert.deepEqual(calls, [[0, 10], [1, 10], [0, 10]]);
  assert.deepEqual(summary, { quotaReached: false, resultCount: 10 });
});

test("total latest quotas redistribute sources that cannot satisfy the filtered quota", () => {
  assert.equal(isBackgroundListingSourceUnavailableForQuota({
    resultCount: 0,
    languageRejectLimitReached: true,
  }), true);
  assert.equal(isBackgroundListingSourceUnavailableForQuota({
    resultCount: 0,
    safetyLimitReached: true,
  }), true);
  assert.equal(isBackgroundListingSourceUnavailableForQuota({
    resultCount: 0,
    sourceExhausted: true,
  }), true);
});

test("total latest quotas keep partial and ordinarily rejected sources fixed", () => {
  assert.equal(isBackgroundListingSourceUnavailableForQuota({
    resultCount: 1,
    languageRejectLimitReached: true,
  }), false);
  assert.equal(isBackgroundListingSourceUnavailableForQuota({
    resultCount: 1,
    safetyLimitReached: true,
  }), false);
  assert.equal(isBackgroundListingSourceUnavailableForQuota({
    resultCount: 0,
  }), false);
});

test("filtered quota unavailability is cached for equivalent scans and expires", () => {
  const now = Date.parse("2026-08-05T00:00:00.000Z");
  const request = buildScraperLatestCursorCheckpointRequest({
    scraper: { id: "source-a", updatedAt: "2026-08-01T00:00:00.000Z" },
    module: "tag",
    query: "https://example.test/tag/glasses",
    includedLanguageCodes: ["en"],
    pageIndex: 49,
    page: {
      items: [],
      currentPageUrl: "https://example.test/tag/glasses?page=50",
      nextPageUrl: "https://example.test/tag/glasses?page=51",
    },
    quotaUnavailableReason: "pageLimitWithoutResults",
    quotaUnavailableLimit: 50,
    now,
  });
  const checkpoint = {
    ...request,
    id: "checkpoint-a",
    query: request.query ?? "",
    includedLanguageCodes: request.includedLanguageCodes ?? [],
    updatedAt: new Date(now).toISOString(),
  };

  assert.equal(
    resolveScraperLatestCheckpointQuotaUnavailableReason(checkpoint, now),
    "pageLimitWithoutResults",
  );
  assert.equal(request.quotaUnavailableLimit, 50);
  assert.equal(
    resolveScraperLatestCheckpointQuotaUnavailableReason(
      checkpoint,
      now + SCRAPER_LATEST_QUOTA_UNAVAILABLE_TTL_MS,
    ),
    null,
  );
});

test("a larger deep page budget overrides a cached page-limit stop", () => {
  const now = Date.parse("2026-08-05T00:00:00.000Z");
  const checkpoint = {
    id: "checkpoint-a",
    scraperId: "source-a",
    module: "tag",
    query: "glasses",
    includedLanguageCodes: ["en"],
    pageIndex: 49,
    cursorVersion: 2,
    nextPageIndex: 50,
    quotaUnavailableReason: "pageLimitWithoutResults",
    quotaUnavailableLimit: 50,
    quotaUnavailableUntil: new Date(now + SCRAPER_LATEST_QUOTA_UNAVAILABLE_TTL_MS).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  assert.equal(
    resolveScraperLatestCheckpointQuotaUnavailableReason(checkpoint, now, { pageLimit: 50 }),
    "pageLimitWithoutResults",
  );
  assert.equal(
    resolveScraperLatestCheckpointQuotaUnavailableReason(checkpoint, now, { pageLimit: 100 }),
    null,
  );
});

test("legacy page-limit stops can be overridden by a clearly larger budget", () => {
  const now = Date.parse("2026-08-05T00:00:00.000Z");
  const checkpoint = {
    id: "checkpoint-a",
    scraperId: "source-a",
    module: "tag",
    query: "glasses",
    includedLanguageCodes: ["en"],
    pageIndex: 49,
    cursorVersion: 2,
    nextPageIndex: 50,
    quotaUnavailableReason: "pageLimitWithoutResults",
    quotaUnavailableUntil: new Date(now + SCRAPER_LATEST_QUOTA_UNAVAILABLE_TTL_MS).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  assert.equal(
    resolveScraperLatestCheckpointQuotaUnavailableReason(checkpoint, now, { pageLimit: 50 }),
    "pageLimitWithoutResults",
  );
  assert.equal(
    resolveScraperLatestCheckpointQuotaUnavailableReason(checkpoint, now, { pageLimit: 100_000 }),
    null,
  );
});

test("disabling or raising the language guard overrides its cached stop", () => {
  const now = Date.parse("2026-08-05T00:00:00.000Z");
  const checkpoint = {
    id: "checkpoint-a",
    scraperId: "source-a",
    module: "tag",
    query: "glasses",
    includedLanguageCodes: ["en"],
    pageIndex: 1,
    cursorVersion: 2,
    nextPageIndex: 2,
    quotaUnavailableReason: "languageRejectLimit",
    quotaUnavailableLimit: 40,
    quotaUnavailableUntil: new Date(now + SCRAPER_LATEST_QUOTA_UNAVAILABLE_TTL_MS).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  assert.equal(
    resolveScraperLatestCheckpointQuotaUnavailableReason(checkpoint, now, { languageRejectLimit: 40 }),
    "languageRejectLimit",
  );
  assert.equal(
    resolveScraperLatestCheckpointQuotaUnavailableReason(checkpoint, now, { languageRejectLimit: 80 }),
    null,
  );
  assert.equal(
    resolveScraperLatestCheckpointQuotaUnavailableReason(checkpoint, now, { languageRejectLimit: 0 }),
    null,
  );
});

test("a cached unavailable source gives its quota to an available source", async () => {
  const counts = [0, 0];
  const calls = [];
  const summary = await runBackgroundListingTotalGroup({
    sourceIndexes: [0, 1],
    resultLimit: 4,
    getResultCount: (sourceIndex) => counts[sourceIndex],
    canContinue: (sourceIndex) => sourceIndex === 1,
    isUnavailable: (sourceIndex) => sourceIndex === 0,
    execute: async (sourceIndex, targetResultCount) => {
      calls.push([sourceIndex, targetResultCount]);
      counts[sourceIndex] = targetResultCount;
    },
  });

  assert.deepEqual(calls, [[1, 2], [1, 4]]);
  assert.deepEqual(counts, [0, 4]);
  assert.deepEqual(summary, { quotaReached: true, resultCount: 4 });
});

test("background listings keep the concurrency selected by the search", () => {
  assert.equal(resolveBackgroundListingConcurrency(30, 2), 30);
  assert.equal(resolveBackgroundListingConcurrency("8", 2), 8);
});

test("background listings fall back to the pace concurrency for old jobs", () => {
  assert.equal(resolveBackgroundListingConcurrency(undefined, 2), 2);
  assert.equal(resolveBackgroundListingConcurrency(0, 4), 4);
  assert.equal(resolveBackgroundListingConcurrency(Number.NaN, 3), 3);
});

test("quick listing progress detects the configured consecutive seen boundary", () => {
  assert.deepEqual(resolveBackgroundQuickSeenProgress([true, true], 0, 2), {
    consecutiveSeenCount: 2,
    boundaryReached: false,
  });
  assert.deepEqual(resolveBackgroundQuickSeenProgress([true], 2, 2), {
    consecutiveSeenCount: 3,
    boundaryReached: true,
  });
  assert.deepEqual(resolveBackgroundQuickSeenProgress([true, false, true], 2, 2), {
    consecutiveSeenCount: 1,
    boundaryReached: true,
  });
});

test("filtered unseen results do not keep latest scans open", () => {
  assert.deepEqual(resolveBackgroundEligibleQuickSeenProgress([
    { seen: false, eligible: false },
    { seen: true, eligible: false },
  ], 2, 2), {
    consecutiveSeenCount: 3,
    boundaryReached: true,
  });
});

test("eligible unseen results still reset the latest scan boundary", () => {
  assert.deepEqual(resolveBackgroundEligibleQuickSeenProgress([
    { seen: false, eligible: true },
    { seen: true, eligible: false },
  ], 2, 2), {
    consecutiveSeenCount: 1,
    boundaryReached: false,
  });
});

test("latest author scans are limited by pages instead of results", () => {
  assert.equal(resolveBackgroundListingResultLimit(undefined, 50, true), 0);
  assert.equal(resolveBackgroundListingResultLimit(20, 50, true), 0);
  assert.equal(resolveBackgroundListingResultLimit(undefined, 50, false), 50);
});

test("latest author scans ignore the quick seen boundary", () => {
  assert.equal(usesBackgroundQuickSeenBoundary("latestAuthors"), false);
  assert.equal(usesBackgroundQuickSeenBoundary("latestSources"), true);
});

test("background source scans stop after the configured language rejection boundary", () => {
  assert.deepEqual(resolveBackgroundLanguageProgress(40, 0, 25, 0, 0, 60), {
    excludedCount: 65,
    includedCount: 0,
    boundaryReached: true,
  });
});

test("background source scans keep running after finding an included language", () => {
  assert.deepEqual(resolveBackgroundLanguageProgress(60, 1, 20, 0, 0, 60), {
    excludedCount: 80,
    includedCount: 1,
    boundaryReached: false,
  });
});

test("background language rejection boundary can be disabled", () => {
  assert.deepEqual(resolveBackgroundLanguageProgress(0, 0, 100, 0, 0, 0), {
    excludedCount: 100,
    includedCount: 0,
    boundaryReached: false,
  });
});
