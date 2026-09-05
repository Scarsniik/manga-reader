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

const {
  autoSortReadingListItems,
  inferReadingListSeriesName,
  moveReadingListItem,
  reorderReadingListItems,
} = require("../dist/renderer/components/ReadingList/readingListOrdering.js");
const {
  findLastStartedReadingListItemIndex,
} = require("../dist/renderer/components/ReadingList/readingListReader.js");
const {
  getDefaultReadingListName,
} = require("../dist/shared/readingList.js");

const createItem = (id, title, scraperId = null) => ({
  id,
  metadata: { title },
  sourceTarget: scraperId
    ? { kind: "scraper.details", scraperId, sourceUrl: `https://example.test/${id}` }
    : { kind: "reader", mangaId: id },
});

const getItemIds = (items) => items.map(({ id }) => id);

test("auto sort orders chapters while leaving unrelated slots untouched", () => {
  const items = [
    createItem("chapter-10", "Une série - Chapitre 10"),
    createItem("unrelated", "20th Century Boys"),
    createItem("chapter-2", "Une série - ch. #2"),
  ];

  const sortedItems = autoSortReadingListItems(items);

  assert.deepEqual(getItemIds(sortedItems), ["chapter-2", "unrelated", "chapter-10"]);
  assert.deepEqual(getItemIds(items), ["chapter-10", "unrelated", "chapter-2"]);
});

test("auto sort normalizes authors and languages like card merges", () => {
  const chapterNumbers = [2, 4, ...Array.from({ length: 15 }, (_, index) => index + 6), 1, 21, 22];
  const items = chapterNumbers.map((chapterNumber) => createItem(
    `chapter-${chapterNumber}`,
    chapterNumber === 1
      ? "Everyone's Kissing Club - Chapter 1"
      : `[NOU SHUN] Everyone's Kissing Club - Chapter ${chapterNumber}${chapterNumber >= 6 ? " (English)" : ""}`,
    chapterNumber === 1 ? "nhentai" : "e-hentai.org",
  ));

  assert.deepEqual(
    getItemIds(autoSortReadingListItems(items)),
    [1, 2, 4, ...Array.from({ length: 17 }, (_, index) => index + 6)]
      .map((chapterNumber) => `chapter-${chapterNumber}`),
  );
});

test("auto sort honors the source title analysis rules", () => {
  const items = [
    createItem("chapter-10", "[Custom Series] Alice [Chapter 10]", "custom-scraper"),
    createItem("chapter-2", "[Custom Series] Bob [Chapter 2]", "custom-scraper"),
  ];
  const config = {
    enabled: true,
    manualTestTitles: [],
    suffixMappings: [],
    variants: [{
      id: "custom-list-sort",
      name: "Custom list sort",
      enabled: true,
      blocks: [
        {
          id: "series",
          kind: "bracket",
          enabled: true,
          optional: false,
          field: "title",
          validation: "none",
          onValidationFailure: "rejectVariant",
        },
        {
          id: "extra",
          kind: "title",
          enabled: true,
          optional: false,
          field: "extra",
          validation: "none",
          onValidationFailure: "rejectVariant",
        },
        {
          id: "sequence",
          kind: "suffixes",
          enabled: true,
          optional: false,
          validation: "none",
          onValidationFailure: "rejectVariant",
        },
      ],
    }],
  };

  assert.deepEqual(getItemIds(autoSortReadingListItems(items)), ["chapter-10", "chapter-2"]);
  assert.deepEqual(
    getItemIds(autoSortReadingListItems(items, new Map([["custom-scraper", config]]))),
    ["chapter-2", "chapter-10"],
  );
  assert.equal(
    inferReadingListSeriesName(items, new Map([["custom-scraper", config]])),
    "Custom Series",
  );
});

test("auto sort orders volume and chapter tuples", () => {
  const items = [
    createItem("volume-2", "Title Volume 2 Chapter 1"),
    createItem("volume-1-chapter-10", "Title Tome 1 Chapitre 10"),
    createItem("volume-1-chapter-2", "Title Vol. 1 Ch. 2"),
  ];

  assert.deepEqual(getItemIds(autoSortReadingListItems(items)), [
    "volume-1-chapter-2",
    "volume-1-chapter-10",
    "volume-2",
  ]);
});

test("auto sort supports decimals, trailing numbers, and Japanese markers", () => {
  const items = [
    createItem("decimal-2", "Décimal chapter 2"),
    createItem("decimal-1-5", "Décimal chapitre 1,5"),
    createItem("generic-10", "Sans libellé 10"),
    createItem("generic-2", "Sans libellé 2"),
    createItem("japanese-10", "作品第１０話"),
    createItem("japanese-2", "作品第2話"),
  ];

  assert.deepEqual(getItemIds(autoSortReadingListItems(items)), [
    "decimal-1-5",
    "decimal-2",
    "generic-2",
    "generic-10",
    "japanese-2",
    "japanese-10",
  ]);
});

test("auto sort supports roman numerals and ranges", () => {
  const items = [
    createItem("range", "Sequence Chapter 10-12"),
    createItem("roman", "Sequence Chapter II"),
  ];

  assert.deepEqual(getItemIds(autoSortReadingListItems(items)), ["roman", "range"]);
});

test("auto sort places named chapters after numbered chapters", () => {
  const items = [
    createItem(
      "named-student",
      "[Ailail (Ail)] Boku ni SeFri ga Dekita Riyuu ~Beit Saki no JK Hen~ | How I made sex friends ~Students after work~ [English] {KittyKatMan}",
      "e-hentai.org",
    ),
    createItem(
      "chapter-2",
      "[Ailail (Ail)] Boku ni SeFri ga Dekita Riyuu Ch. 2 [English]",
      "e-hentai.org",
    ),
    createItem(
      "named-neighbor",
      "[Ailail (Ail)] Boku ni SeFri ga Dekita Riyuu ~Otonari no Hitozuma Hen~ | How I Made Sex Friends ~The Neighbor's Wife~ [English] {KittyKatMan}",
      "e-hentai.org",
    ),
    createItem(
      "chapter-1",
      "[Ailail (Ail)] Boku ni SeFri ga Dekita Riyuu Ch. 1 [English]",
      "e-hentai.org",
    ),
  ];

  assert.deepEqual(getItemIds(autoSortReadingListItems(items)), [
    "chapter-1",
    "chapter-2",
    "named-student",
    "named-neighbor",
  ]);
});

test("auto sort does not mix chapter-only and volume-only sequences", () => {
  const items = [
    createItem("chapter-3", "Mixed Chapter 3"),
    createItem("volume-2", "Mixed Tome 2"),
    createItem("chapter-1", "Mixed Chapter 1"),
    createItem("volume-1", "Mixed Tome 1"),
  ];

  assert.deepEqual(getItemIds(autoSortReadingListItems(items)), [
    "chapter-1",
    "volume-1",
    "chapter-3",
    "volume-2",
  ]);
});

test("auto sort keeps single detected numbers and unnumbered titles in place", () => {
  const items = [
    createItem("year", "Edition 2024"),
    createItem("plain", "Titre sans numéro"),
    createItem("internal-number", "20th Century Boys"),
  ];

  assert.deepEqual(getItemIds(autoSortReadingListItems(items)), getItemIds(items));
});

test("auto sort is stable and idempotent", () => {
  const items = [
    createItem("chapter-10", "Stable Chapter 10"),
    createItem("chapter-2-first", "Stable Chapter 2"),
    createItem("chapter-2-second", "Stable ch. 2"),
  ];
  const sortedItems = autoSortReadingListItems(items);

  assert.deepEqual(getItemIds(sortedItems), [
    "chapter-2-first",
    "chapter-2-second",
    "chapter-10",
  ]);
  assert.deepEqual(
    getItemIds(autoSortReadingListItems(sortedItems)),
    getItemIds(sortedItems),
  );
});

test("drag reorder inserts before or after the target", () => {
  const items = [
    createItem("a", "A"),
    createItem("b", "B"),
    createItem("c", "C"),
  ];

  assert.deepEqual(
    getItemIds(reorderReadingListItems(items, "a", "c", "after")),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    getItemIds(reorderReadingListItems(items, "c", "a", "before")),
    ["c", "a", "b"],
  );
});

test("keyboard move respects list boundaries", () => {
  const items = [
    createItem("a", "A"),
    createItem("b", "B"),
    createItem("c", "C"),
  ];

  assert.deepEqual(getItemIds(moveReadingListItem(items, "b", -1)), ["b", "a", "c"]);
  assert.deepEqual(getItemIds(moveReadingListItem(items, "a", -1)), ["a", "b", "c"]);
  assert.notStrictEqual(moveReadingListItem(items, "a", -1), items);
});

test("the title parser suggests a series shared by a strict majority", () => {
  const items = [
    createItem("chapter-1", "Parser Series Chapter 1"),
    createItem("other", "Unrelated manga"),
    createItem("chapter-2", "Parser Series Chapter 2"),
  ];

  const seriesName = inferReadingListSeriesName(items);

  assert.equal(seriesName, "Parser Series");
  assert.equal(getDefaultReadingListName(items, seriesName), "Parser Series");
});

test("the majority author is used when the parser finds no majority series", () => {
  const items = [
    { ...createItem("first", "First"), metadata: { title: "First", authors: ["Alice"] } },
    { ...createItem("second", "Second"), metadata: { title: "Second", authors: ["Alice", "Bob"] } },
    { ...createItem("third", "Third"), metadata: { title: "Third", authors: ["Carol"] } },
  ];

  assert.equal(inferReadingListSeriesName(items), null);
  assert.equal(getDefaultReadingListName(items), "Alice");
});

test("resume starts at the last manga progressed beyond page one", () => {
  const items = [
    createItem("first", "First"),
    createItem("second", "Second"),
    createItem("third", "Third"),
  ];
  const mangas = [
    { id: "first", currentPage: 4, pages: 20 },
    { id: "second", currentPage: 1, pages: 20 },
    { id: "third", currentPage: 7, pages: 20 },
  ];

  assert.equal(findLastStartedReadingListItemIndex(items, mangas, []), 2);
});

test("page one and completed progress do not count as started", () => {
  const items = [
    createItem("first", "First"),
    createItem("second", "Second"),
  ];
  const mangas = [
    { id: "first", currentPage: 1, pages: 20 },
    { id: "second", currentPage: 20, pages: 20 },
  ];

  assert.equal(findLastStartedReadingListItemIndex(items, mangas, []), 0);
});

test("resume finds scraper progress from the saved source", () => {
  const items = [
    createItem("first", "First"),
    createItem("second", "Second", "source"),
  ];
  const progressRecords = [{
    id: "legacy-id",
    scraperId: "source",
    sourceUrl: "https://example.test/second",
    currentPage: 3,
    totalPages: 12,
    updatedAt: "2026-09-05T12:00:00.000Z",
  }];

  assert.equal(findLastStartedReadingListItemIndex(items, [], progressRecords), 1);
});
