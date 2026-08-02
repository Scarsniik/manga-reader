const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export { buildReadingListCandidates } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchCandidates";
  export { matchPotentialMangaCandidates } from "@/renderer/components/ScraperBrowser/utils/potentialMangaMatchMatching";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "potential-manga-reading-lists-test.ts" },
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
  buildReadingListCandidates,
  matchPotentialMangaCandidates,
} = bundledModule.exports;

const scrapersById = new Map([
  ["scraper-a", { id: "scraper-a", name: "Source A" }],
]);

const createList = (id, createdAt, items) => ({
  id,
  createdAt,
  items,
});

test("saved scraper details become reading-list match candidates", () => {
  const [candidate] = buildReadingListCandidates({
    lists: [createList("list-a", "2026-08-01T12:00:00.000Z", [{
      id: "item-a",
      metadata: {
        title: "Example Manga",
        cover: "https://example.test/cover.jpg",
        authors: ["Example Author"],
      },
      sourceTarget: {
        kind: "scraper.details",
        scraperId: "scraper-a",
        sourceUrl: "https://example.test/manga",
      },
    }])],
    libraryMangas: [],
    scrapersById,
  });

  assert.equal(candidate.category, "readingList");
  assert.equal(candidate.sourceUrl, "https://example.test/manga");
  assert.equal(candidate.sourceLabel, "Source A");
  assert.equal(candidate.detailLabel, "Liste de lecture");
  assert.deepEqual(candidate.authorNames, ["Example Author"]);
  assert.deepEqual(candidate.target, {
    kind: "scraperDetails",
    scraperId: "scraper-a",
    sourceUrl: "https://example.test/manga",
    title: "Example Manga",
  });
});

test("saved scraper readers keep their scraper details target", () => {
  const [candidate] = buildReadingListCandidates({
    lists: [createList("list-a", "2026-08-01T12:00:00.000Z", [{
      id: "item-a",
      metadata: { title: "Reader Manga" },
      sourceTarget: {
        kind: "reader",
        mangaId: "scraper-reader-id",
        locationState: {
          scraperReader: {
            id: "scraper-reader-id",
            scraperId: "scraper-a",
            title: "Reader Manga",
            sourceUrl: "https://example.test/reader",
            pageUrls: [],
          },
        },
      },
    }])],
    libraryMangas: [],
    scrapersById,
  });

  assert.equal(candidate.target.kind, "scraperDetails");
  assert.equal(candidate.target.sourceUrl, "https://example.test/reader");
});

test("saved local readers become library match candidates", () => {
  const [candidate] = buildReadingListCandidates({
    lists: [createList("list-a", "2026-08-01T12:00:00.000Z", [{
      id: "item-a",
      metadata: { title: "Local Manga" },
      sourceTarget: {
        kind: "reader",
        mangaId: "local-manga",
      },
    }])],
    libraryMangas: [{
      id: "local-manga",
      title: "Local Manga",
      path: "C:/manga/local",
      createdAt: "2026-07-01T12:00:00.000Z",
      authorIds: [],
      tagIds: [],
    }],
    scrapersById,
  });

  assert.equal(candidate.sourceLabel, "Bibliotheque");
  assert.deepEqual(candidate.target, {
    kind: "library",
    title: "Local Manga",
  });
});

test("matching detects an exact saved-list source and deduplicates multiple lists", () => {
  const lists = [
    createList("new-list", "2026-08-02T12:00:00.000Z", [{
      id: "new-item",
      metadata: { title: "Example Manga" },
      sourceTarget: {
        kind: "scraper.details",
        scraperId: "scraper-a",
        sourceUrl: "https://example.test/manga",
      },
    }]),
    createList("old-list", "2026-08-01T12:00:00.000Z", [{
      id: "old-item",
      metadata: { title: "Example Manga" },
      sourceTarget: {
        kind: "scraper.details",
        scraperId: "scraper-a",
        sourceUrl: "https://example.test/manga",
      },
    }]),
  ];
  const candidates = buildReadingListCandidates({
    lists,
    libraryMangas: [],
    scrapersById,
  });
  const matches = matchPotentialMangaCandidates({
    title: "Example Manga",
    sourceUrl: "https://example.test/manga",
  }, candidates, {
    enableRomajiPhoneticMerge: false,
  });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "reading-list:new-list:new-item");
});
