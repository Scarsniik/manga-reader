const assert = require("node:assert/strict");
const test = require("node:test");
const { buildSummary } = require("./analyze-scraper-latest-diagnostics.cjs");

const entry = (event, elapsedMs, data = {}, sourceKey) => ({
  event,
  elapsedMs,
  data,
  sourceKey,
  profileId: "profile-1",
});

test("the latest-search diagnostic separates limiter waits from HTTP time", () => {
  const entries = [
    entry("session.started", 0, {
      mode: "foreground",
      concurrency: 2,
      sourceCount: 2,
    }),
    entry("request.queued", 10, { requestId: "r1", purpose: "listing-demand" }, "source-a"),
    entry("request.acquired", 2_510, { requestId: "r1", purpose: "listing-demand", queueWaitMs: 2_500 }, "source-a"),
    entry("request.completed", 2_810, {
      requestId: "r1",
      purpose: "listing-demand",
      queueWaitMs: 2_500,
      executionMs: 300,
      totalRequestMs: 2_800,
      ok: true,
      status: 200,
    }, "source-a"),
    entry("session.finish-requested", 2_900, { status: "completed" }),
  ];

  const summary = buildSummary(entries, "profile.jsonl");

  assert.equal(summary.requests.queue.totalMs, 2_500);
  assert.equal(summary.requests.execution.totalMs, 300);
  assert.ok(summary.findings.some((finding) => finding.code === "request-queue"));
  assert.ok(!summary.findings.some((finding) => finding.code === "slow-http"));
});

test("the latest-search diagnostic reports slow HTTP, barriers, detail rejections and unused preloads", () => {
  const entries = [entry("session.started", 0, { mode: "background" })];
  for (let index = 0; index < 12; index += 1) {
    entries.push(entry("request.queued", index, {
      requestId: `detail-${index}`,
      purpose: "card-details",
    }, "source-a"));
    entries.push(entry("request.acquired", index, {
      requestId: `detail-${index}`,
      purpose: "card-details",
      queueWaitMs: 10,
    }, "source-a"));
    entries.push(entry("request.completed", 6_500 + index, {
      requestId: `detail-${index}`,
      purpose: "card-details",
      queueWaitMs: 10,
      executionMs: 6_000,
      totalRequestMs: 6_010,
      ok: true,
      status: 200,
    }, "source-a"));
  }
  entries.push(
    entry("source.batch-completed", 6_600, { addedResultCount: 2 }, "source-a"),
    entry("quota.round-completed", 6_700, { durationMs: 6_000, barrierIdleMs: 2_500 }),
    entry("prefetch.preload-started", 100, {}, "source-a"),
    entry("prefetch.preload-started", 101, {}, "source-b"),
    entry("prefetch.preload-started", 102, {}, "source-c"),
    entry("prefetch.load-hit", 200, {}, "source-a"),
    entry("prefetch.load-miss", 201, {}, "source-b"),
    entry("prefetch.load-replaced", 202, {}, "source-c"),
    entry("session.finish-requested", 10_000, { status: "completed" }),
  );

  const summary = buildSummary(entries);
  const codes = new Set(summary.findings.map((finding) => finding.code));

  assert.ok(codes.has("slow-http"));
  assert.ok(codes.has("round-barrier"));
  assert.ok(codes.has("detail-rejections"));
  assert.ok(codes.has("low-prefetch-hit-rate"));
  assert.equal(summary.prefetch.hitRatePercent, 33);
});

test("the latest-search diagnostic exposes duplicate retry pacing", () => {
  const summary = buildSummary([
    entry("session.started", 0, { mode: "foreground" }),
    entry("pace.wait", 100, {
      pageIndex: 2,
      attempt: 0,
      delayMs: 650,
      reason: "retry-after-failure",
    }, "source-a"),
    entry("pace.wait", 750, {
      pageIndex: 2,
      attempt: 1,
      delayMs: 650,
      reason: "retry-before-attempt",
    }, "source-a"),
    entry("session.finish-requested", 1_500, { status: "error" }),
  ]);

  assert.equal(summary.scheduling.retryWaitMs, 1_300);
  assert.equal(summary.scheduling.duplicateRetryWaitCount, 1);
  assert.ok(summary.findings.some((finding) => finding.code === "double-retry-wait"));
});
