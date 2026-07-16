const assert = require("node:assert/strict");
const test = require("node:test");
const {
  autoSortReadingListItems,
  moveReadingListItem,
  reorderReadingListItems,
} = require("../dist/renderer/components/ReadingList/readingListOrdering.js");

const createItem = (id, title) => ({
  id,
  metadata: { title },
  sourceTarget: { kind: "reader" },
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
    createItem("japanese-10", "作品 第１０話"),
    createItem("japanese-2", "作品 第2話"),
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
