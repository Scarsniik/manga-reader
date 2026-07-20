const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export { resolveBackgroundListingConcurrency } from "@/renderer/backgroundSearch/backgroundListingExecution";
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

const { resolveBackgroundListingConcurrency } = bundledModule.exports;

test("background listings keep the concurrency selected by the search", () => {
  assert.equal(resolveBackgroundListingConcurrency(30, 2), 30);
  assert.equal(resolveBackgroundListingConcurrency("8", 2), 8);
});

test("background listings fall back to the pace concurrency for old jobs", () => {
  assert.equal(resolveBackgroundListingConcurrency(undefined, 2), 2);
  assert.equal(resolveBackgroundListingConcurrency(0, 4), 4);
  assert.equal(resolveBackgroundListingConcurrency(Number.NaN, 3), 3);
});
