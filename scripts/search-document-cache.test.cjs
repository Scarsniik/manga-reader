const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");

const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scaramanga-search-cache-test-"));
const originalLoad = Module._load;
Module._load = function loadWithElectronStub(request, parent, isMain) {
  if (request === "electron") {
    return { app: { getPath: () => cacheRoot } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const cache = require("../dist/electron/handlers/scrapers/searchDocumentCache.js");
Module._load = originalLoad;

const makeRequest = (scopeId, overrides = {}) => ({
  scraperId: "source-a",
  baseUrl: "https://example.test",
  targetUrl: "/search?q=manga",
  requestConfig: { method: "POST", bodyMode: "raw", body: "q=manga" },
  searchCache: { scopeId },
  ...overrides,
});

const success = {
  ok: true,
  checkedAt: "2026-08-08T00:00:00.000Z",
  requestedUrl: "https://example.test/search?q=manga",
  finalUrl: "https://example.test/search?q=manga",
  status: 200,
  contentType: "text/html",
  html: "<html><body>manga</body></html>",
};

test.after(() => {
  fs.rmSync(cacheRoot, { recursive: true, force: true });
});

test("the correspondence document cache keys method and body and cleans a job scope", async () => {
  const request = makeRequest("job-cache-key");
  await cache.writeSearchDocumentCache(request, success);
  assert.deepEqual(await cache.readSearchDocumentCache(request), success);
  assert.equal(await cache.readSearchDocumentCache(makeRequest("job-cache-key", {
    requestConfig: { method: "GET" },
  })), null);

  await cache.removeSearchDocumentCacheScope("job-cache-key");
  assert.equal(await cache.readSearchDocumentCache(request), null);
});

test("the document cache expires entries and never stores errors or image validation", async () => {
  const expiring = makeRequest("job-expiry", { searchCache: { scopeId: "job-expiry", ttlMs: 1 } });
  await cache.writeSearchDocumentCache(expiring, success);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await cache.readSearchDocumentCache(expiring), null);

  const failed = makeRequest("job-failed");
  await cache.writeSearchDocumentCache(failed, { ...success, ok: false, html: undefined, error: "failed" });
  assert.equal(await cache.readSearchDocumentCache(failed), null);

  const image = makeRequest("job-image", { validateImage: true });
  await cache.writeSearchDocumentCache(image, success);
  assert.equal(await cache.readSearchDocumentCache(image), null);
});

test("LRU eviction enforces both the per-job and global byte limits", () => {
  const files = [
    { path: "a-old", scopePath: "a", size: 40, modifiedAt: 1 },
    { path: "b-old", scopePath: "b", size: 30, modifiedAt: 2 },
    { path: "a-new", scopePath: "a", size: 40, modifiedAt: 3 },
    { path: "b-new", scopePath: "b", size: 30, modifiedAt: 4 },
  ];

  assert.deepEqual(cache.selectSearchDocumentCacheEvictions(files, 64, 256), ["a-old"]);
  assert.deepEqual(cache.selectSearchDocumentCacheEvictions(files, 100, 90), ["a-old", "b-old"]);
});
