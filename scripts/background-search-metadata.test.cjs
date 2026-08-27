const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const authorCacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "scaramanga-author-cache-test-"));
process.env.SCARAMANGA_AUTHOR_CORRESPONDENCE_CACHE_DIR = authorCacheDirectory;
const {
  buildBackgroundSearchQueueSummary,
  canContinueBackgroundSearch,
  canReplayBackgroundSearch,
  hasBackgroundSearchExpired,
  isBackgroundSearchActive,
  isBackgroundSearchResultEditable,
  isBackgroundSearchUnopened,
  resolveCompletedBackgroundSearchRelation,
} = require("../dist/electron/handlers/backgroundSearch/metadata.js");
const {
  getAuthorCorrespondenceSessionCache,
  loadAuthorCorrespondenceSessionCache,
  persistAuthorCorrespondenceSessionCache,
  pruneAuthorCorrespondenceSessionCaches,
  removeAuthorCorrespondenceSessionCache,
  setAuthorCorrespondenceSessionCache,
} = require("../dist/electron/handlers/authorCorrespondenceSessionCache.js");
const {
  buildStoredScraperLatestContinuationResult,
} = require("../dist/shared/scraperLatestContinuation.js");

test.after(() => {
  fs.rmSync(authorCacheDirectory, { recursive: true, force: true });
});

const makeJob = (id, status, createdAt, expiresAt) => ({
  id,
  schemaVersion: 1,
  kind: "multiSearch",
  title: id,
  primaryTerm: id,
  status,
  storageMode: "temporaryFile",
  retentionHours: 24,
  createdAt,
  updatedAt: createdAt,
  revision: 1,
  progress: { completedUnits: 0, resultCount: 0 },
  inputAvailable: true,
  resultAvailable: false,
  expiresAt,
});

test("background search activity only includes queued and running jobs", () => {
  assert.equal(isBackgroundSearchActive("queued"), true);
  assert.equal(isBackgroundSearchActive("running"), true);
  assert.equal(isBackgroundSearchActive("completed"), false);
});

test("completed and cancelled results can be edited before a replay", () => {
  assert.equal(isBackgroundSearchResultEditable("completed"), true);
  assert.equal(isBackgroundSearchResultEditable("cancelled"), true);
  assert.equal(isBackgroundSearchResultEditable("running"), false);
  assert.equal(isBackgroundSearchResultEditable("error"), false);
  assert.equal(canReplayBackgroundSearch({
    ...makeJob("stopped", "cancelled", "2026-01-01T00:00:00.000Z"),
    kind: "mangaCorrespondence",
  }), true);
  assert.equal(canReplayBackgroundSearch({
    ...makeJob("author", "completed", "2026-01-01T00:00:00.000Z"),
    kind: "authorCorrespondence",
  }), true);
  assert.equal(canReplayBackgroundSearch({
    ...makeJob("running", "running", "2026-01-01T00:00:00.000Z"),
    kind: "mangaCorrespondence",
  }), false);
  assert.equal(canReplayBackgroundSearch({
    ...makeJob("other", "cancelled", "2026-01-01T00:00:00.000Z"),
    kind: "multiSearch",
  }), false);
});

test("linked author completion respects automatic replay safety choices", () => {
  const relation = {
    kind: "authorExpansion",
    parentJobId: "manga-job",
    autoImportOnCompletion: true,
    blockAutomaticImportOnSafetyWarning: true,
    automationStatus: "waiting",
  };
  assert.equal(resolveCompletedBackgroundSearchRelation(relation, {
    advancedSearch: { automaticMangaReplayBlocked: true },
  }).automationStatus, "blocked");
  assert.equal(resolveCompletedBackgroundSearchRelation({
    ...relation,
    blockAutomaticImportOnSafetyWarning: false,
  }, {
    advancedSearch: { automaticMangaReplayBlocked: true },
  }).automationStatus, "pending");
  assert.equal(resolveCompletedBackgroundSearchRelation({
    ...relation,
    autoImportOnCompletion: false,
  }, {}).automationStatus, "manualReady");
});

test("completed latest-source scans can be continued as background jobs", () => {
  assert.equal(canContinueBackgroundSearch({
    ...makeJob("latest", "completed", "2026-01-01T00:00:00.000Z"),
    kind: "latestSources",
  }), true);
  assert.equal(canContinueBackgroundSearch({
    ...makeJob("running", "running", "2026-01-01T00:00:00.000Z"),
    kind: "latestSources",
  }), false);
  assert.equal(canContinueBackgroundSearch({
    ...makeJob("other", "completed", "2026-01-01T00:00:00.000Z"),
    kind: "multiSearch",
  }), false);
});

test("latest-source background continuation keeps cursors and replaces stored cards", () => {
  const result = {
    executionFingerprint: "same-input",
    runs: [{
      key: "source-a",
      status: "done",
      results: [{ id: "old-card" }],
      pendingResults: [{ id: "pending-card" }],
      checkedPages: 4,
      loadedPages: 4,
      nextPageUrl: "https://example.test/page/5",
      checkpointUsed: true,
    }],
  };

  const continuation = buildStoredScraperLatestContinuationResult({
    searchMode: "deep",
    sources: [{ id: "source-a" }],
  }, result);

  assert.equal(continuation.executionFingerprint, "same-input");
  assert.deepEqual(continuation.runs[0].results, []);
  assert.deepEqual(continuation.runs[0].pendingResults, [{ id: "pending-card" }]);
  assert.equal(continuation.runs[0].loadedPages, 4);
  assert.equal(continuation.runs[0].nextPageUrl, "https://example.test/page/5");
  assert.equal(continuation.runs[0].checkpointUsed, false);
  assert.equal(continuation.runs[0].deepScanPhaseStarted, true);
});

test("only new jobs explicitly marked as unopened show the visual state", () => {
  assert.equal(isBackgroundSearchUnopened({ openedAt: null }), true);
  assert.equal(isBackgroundSearchUnopened({ openedAt: "2026-01-01T00:00:00.000Z" }), false);
  assert.equal(isBackgroundSearchUnopened({}), false);
});

test("background search queue summary is newest-first and counts each state", () => {
  const summary = buildBackgroundSearchQueueSummary([
    makeJob("old", "queued", "2026-01-01T00:00:00.000Z"),
    makeJob("new", "completed", "2026-01-02T00:00:00.000Z"),
    makeJob("active", "running", "2026-01-01T12:00:00.000Z"),
  ]);

  assert.deepEqual(summary.jobs.map((job) => job.id), ["new", "active", "old"]);
  assert.equal(summary.counts.total, 3);
  assert.equal(summary.counts.active, 2);
  assert.equal(summary.counts.queued, 1);
  assert.equal(summary.counts.running, 1);
  assert.equal(summary.counts.completed, 1);
});

test("expiration ignores future and already-expired jobs", () => {
  const now = Date.parse("2026-01-02T00:00:00.000Z");
  assert.equal(hasBackgroundSearchExpired(
    makeJob("past", "completed", "2026-01-01T00:00:00.000Z", "2026-01-01T12:00:00.000Z"),
    now,
  ), true);
  assert.equal(hasBackgroundSearchExpired(
    makeJob("future", "completed", "2026-01-01T00:00:00.000Z", "2026-01-03T00:00:00.000Z"),
    now,
  ), false);
  assert.equal(hasBackgroundSearchExpired(
    makeJob("expired", "expired", "2026-01-01T00:00:00.000Z", "2026-01-01T12:00:00.000Z"),
    now,
  ), false);
});

test("author correspondence session cache stays memory-bounded and refreshes recent entries", () => {
  for (let index = 0; index < 20; index += 1) {
    setAuthorCorrespondenceSessionCache(`author-${index}`, { revision: index });
  }
  assert.deepEqual(getAuthorCorrespondenceSessionCache("author-0"), { revision: 0 });
  setAuthorCorrespondenceSessionCache("author-20", { revision: 20 });

  assert.equal(getAuthorCorrespondenceSessionCache("author-1"), null);
  assert.deepEqual(getAuthorCorrespondenceSessionCache("author-0"), { revision: 0 });
  assert.deepEqual(getAuthorCorrespondenceSessionCache("author-20"), { revision: 20 });
});

test("author correspondence cache is compressed and reloads after memory eviction", async () => {
  const jobId = "persisted-author";
  const snapshot = {
    revision: 7,
    runs: [{ title: "Repeated title ".repeat(100) }],
    mangaEnrichments: [],
  };
  await persistAuthorCorrespondenceSessionCache(jobId, snapshot);
  const latestSnapshot = { ...snapshot, revision: 8 };
  await persistAuthorCorrespondenceSessionCache(jobId, latestSnapshot);
  const cachePath = path.join(authorCacheDirectory, `${jobId}.json.gz`);
  const compressed = fs.readFileSync(cachePath);
  assert.deepEqual(Array.from(compressed.subarray(0, 2)), [0x1f, 0x8b]);

  for (let index = 0; index < 25; index += 1) {
    setAuthorCorrespondenceSessionCache(`eviction-${index}`, { revision: index });
  }
  assert.equal(getAuthorCorrespondenceSessionCache(jobId), null);
  assert.deepEqual(await loadAuthorCorrespondenceSessionCache(jobId), latestSnapshot);

  await removeAuthorCorrespondenceSessionCache(jobId);
  assert.equal(getAuthorCorrespondenceSessionCache(jobId), null);
  assert.equal(fs.existsSync(cachePath), false);
});

test("author correspondence cache pruning removes orphaned job files", async () => {
  await persistAuthorCorrespondenceSessionCache("retained-author", { revision: 1 });
  await persistAuthorCorrespondenceSessionCache("orphaned-author", { revision: 2 });
  await pruneAuthorCorrespondenceSessionCaches(["retained-author"]);

  assert.deepEqual(await loadAuthorCorrespondenceSessionCache("retained-author"), { revision: 1 });
  assert.equal(await loadAuthorCorrespondenceSessionCache("orphaned-author"), null);
  await removeAuthorCorrespondenceSessionCache("retained-author");
});
