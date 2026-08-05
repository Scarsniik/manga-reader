const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith("@/")
    ? path.join(__dirname, "..", "dist", request.slice(2))
    : request;
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};

global.window = { api: {} };

const {
  buildReadingListCoverCandidates,
  buildReadingListCoverSources,
  getReadingListCoverReferer,
} = require("../dist/renderer/components/ReadingList/readingListCovers.js");

const createScraperItem = (cover, coverCandidates = undefined) => ({
  metadata: { cover, coverCandidates },
  sourceTarget: {
    kind: "scraper.details",
    scraperId: "example",
    sourceUrl: "https://example.test/details/42",
  },
});

test("an existing saved cover is loaded through the thumbnail proxy with its source referer", () => {
  const sources = buildReadingListCoverSources(createScraperItem("https://cdn.test/cover.webp"));

  assert.equal(sources.length, 2);
  const proxiedSource = new URL(sources[0]);
  assert.equal(proxiedSource.protocol, "scraper-thumb:");
  assert.equal(proxiedSource.searchParams.get("url"), "https://cdn.test/cover.webp");
  assert.equal(proxiedSource.searchParams.get("referer"), "https://example.test/details/42");
  assert.equal(sources[1], "https://cdn.test/cover.webp");
});

test("all deduplicated cover candidates remain available as lazy fallbacks", () => {
  const candidates = buildReadingListCoverCandidates(" https://cdn.test/first.webp ", [
    "https://cdn.test/first.webp",
    "https://cdn.test/second.webp",
  ]);
  const sources = buildReadingListCoverSources(createScraperItem(candidates[0], candidates));

  assert.deepEqual(candidates, [
    "https://cdn.test/first.webp",
    "https://cdn.test/second.webp",
  ]);
  assert.equal(sources.length, 4);
  assert.equal(sources[1], "https://cdn.test/first.webp");
  assert.equal(sources[3], "https://cdn.test/second.webp");
});

test("reader-backed lists recover the scraper source referer from their location state", () => {
  const item = {
    metadata: { cover: "https://cdn.test/reader-cover.webp" },
    sourceTarget: {
      kind: "reader",
      mangaId: "reader-item",
      locationState: {
        scraperReader: { sourceUrl: "https://example.test/gallery/7" },
      },
    },
  };

  assert.equal(getReadingListCoverReferer(item), "https://example.test/gallery/7");
  assert.equal(
    new URL(buildReadingListCoverSources(item)[0]).searchParams.get("referer"),
    "https://example.test/gallery/7",
  );
});

test("local covers keep their reader asset URL without a redundant fallback", () => {
  const sources = buildReadingListCoverSources({
    metadata: { cover: "C:\\manga\\cover.jpg" },
    sourceTarget: { kind: "reader" },
  });

  assert.deepEqual(sources, ["local:///C:/manga/cover.jpg"]);
});
