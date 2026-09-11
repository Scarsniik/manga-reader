const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    findScraperBookmarkDuplicateGroups,
  } from "@/renderer/components/ScraperBookmarks/bookmarkDuplicateDetection";
`;
const built = esbuild.buildSync({
  stdin: {
    contents: source,
    resolveDir: process.cwd(),
    sourcefile: "bookmark-duplicate-detection-test.ts",
  },
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

const { findScraperBookmarkDuplicateGroups } = bundledModule.exports;

global.window = {
  api: null,
  setTimeout,
};

const createBookmark = (title, authors, index) => ({
  scraperId: `scraper-${index}`,
  sourceUrl: `https://source-${index}.test/item`,
  title,
  authors,
});

const findGroups = (bookmarks) => findScraperBookmarkDuplicateGroups({
  bookmarks,
  scrapersById: new Map(),
  mergeOptions: {
    enableRomajiPhoneticMerge: true,
  },
});

test("compact slashes, franchises and neighboring years do not create false duplicates", async () => {
  const groups = await findGroups([
    createBookmark("[Artist] 06/2021 reward", ["Artist"], 1),
    createBookmark("[Artist] 06/2023 reward", ["Artist"], 2),
    createBookmark("First Work (Fate/Grand Order)", ["First Artist"], 3),
    createBookmark("Second Work (Fate/Grand Order)", ["Second Artist"], 4),
    createBookmark("Winter Story 2017", ["Shared Artist"], 5),
    createBookmark("Winter Story 2018", ["Shared Artist"], 6),
  ]);

  assert.deepEqual(groups, []);
});

test("author aliases and an abbreviated translated title can identify duplicates", async () => {
  const bookmarks = [
    createBookmark(
      "[Circle (Kurosu Gatari)] Mama ga Kawari ni | Mom's the Substitute! [English]",
      ["kurosu gatari"],
      1,
    ),
    createBookmark("Mom's The Substitute!", ["Kurosu Gatari (Doll Play)"], 2),
    createBookmark(
      "[Pija] Futari no Hi - Day Only For Two (Magazine 2016-03) [English]",
      ["pija"],
      3,
    ),
    createBookmark("Day Only For Two", ["Pianissimo (Pija)"], 4),
  ];
  const groups = await findGroups(bookmarks);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.bookmarks.length), [2, 2]);
});

test("dash matching keeps distinct installments and editions separate", async () => {
  const groups = await findGroups([
    createBookmark("Long Series 1 - Shared Translation", ["Artist"], 1),
    createBookmark("Long Series 2 - Shared Translation", ["Artist"], 2),
    createBookmark("Long Series - White Edition", ["Artist"], 3),
    createBookmark("Long Series - Black Edition", ["Artist"], 4),
    createBookmark("Chapter Collection - Chapter 1-12", ["Artist"], 5),
    createBookmark("Chapter Collection - Chapter 1-14", ["Artist"], 6),
  ]);

  assert.deepEqual(groups, []);
});

test("an author suffix is not treated as a shared title", async () => {
  const groups = await findGroups([
    createBookmark("First Story – Shared Artist", ["Shared Artist"], 1),
    createBookmark("Second Story – Shared Artist", ["Shared Artist"], 2),
  ]);

  assert.deepEqual(groups, []);
});

test("duplicate groups require every bookmark to match every other bookmark", async () => {
  const groups = await findGroups([
    createBookmark("Alpha Story | Beta Story", ["Shared Artist"], 1),
    createBookmark("Alpha Story", ["Shared Artist"], 2),
    createBookmark("Beta Story", ["Shared Artist"], 3),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].bookmarks.length, 2);
});
