const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildBackgroundSearchQueueSummary,
  hasBackgroundSearchExpired,
  isBackgroundSearchActive,
  isBackgroundSearchUnopened,
} = require("../dist/electron/handlers/backgroundSearch/metadata.js");

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
