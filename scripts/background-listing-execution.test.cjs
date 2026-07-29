const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    resolveBackgroundLanguageProgress,
    resolveBackgroundListingConcurrency,
    resolveBackgroundListingResultLimit,
    resolveBackgroundQuickSeenProgress,
    usesBackgroundQuickSeenBoundary,
  } from "@/renderer/backgroundSearch/backgroundListingExecution";
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
  resolveBackgroundLanguageProgress,
  resolveBackgroundListingConcurrency,
  resolveBackgroundListingResultLimit,
  resolveBackgroundQuickSeenProgress,
  usesBackgroundQuickSeenBoundary,
} = bundledModule.exports;

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
