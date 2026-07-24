const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    resolveBackgroundListingConcurrency,
    resolveBackgroundQuickSeenProgress,
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
  resolveBackgroundListingConcurrency,
  resolveBackgroundQuickSeenProgress,
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

test("quick author scans stop after the configured consecutive seen boundary", () => {
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
