const assert = require("node:assert/strict");
const test = require("node:test");
const {
  applyReadingListSave,
} = require("../dist/electron/handlers/readingListCollection.js");

const createItem = (id, title) => ({
  id,
  metadata: { title },
  sourceTarget: {
    kind: "reader",
    mangaId: id,
  },
});

test("updating an existing list preserves its identity and creation date", () => {
  const originalItems = [createItem("first", "First")];
  const replacementItems = [createItem("second", "Second")];
  const lists = [
    {
      id: "saved-list",
      items: originalItems,
      createdAt: "2026-07-16T12:29:44.902Z",
    },
    {
      id: "other-list",
      items: [createItem("other", "Other")],
      createdAt: "2026-07-15T10:00:00.000Z",
    },
  ];

  const result = applyReadingListSave(lists, replacementItems, {
    createId: () => "unused-id",
    createdAt: "2026-07-16T15:00:00.000Z",
    savedListId: "saved-list",
  });

  assert.equal(result.lists.length, 2);
  assert.equal(result.lists[0].id, "saved-list");
  assert.equal(result.lists[0].createdAt, "2026-07-16T12:29:44.902Z");
  assert.deepEqual(result.lists[0].items, replacementItems);
  assert.equal(result.savedList, result.lists[0]);
  assert.deepEqual(lists[0].items, originalItems);
});

test("saving without a list id creates a new list", () => {
  const items = [createItem("new-item", "New")];
  const existingList = {
    id: "existing-list",
    items: [createItem("existing-item", "Existing")],
    createdAt: "2026-07-15T10:00:00.000Z",
  };

  const result = applyReadingListSave([existingList], items, {
    createId: () => "new-list",
    createdAt: "2026-07-16T15:00:00.000Z",
  });

  assert.equal(result.lists.length, 2);
  assert.deepEqual(result.savedList, {
    id: "new-list",
    items,
    createdAt: "2026-07-16T15:00:00.000Z",
  });
  assert.equal(result.lists[0], result.savedList);
  assert.equal(result.lists[1], existingList);
});

test("updating an unknown list fails instead of creating a duplicate", () => {
  assert.throws(() => applyReadingListSave([], [createItem("item", "Item")], {
    createId: () => "new-list",
    createdAt: "2026-07-16T15:00:00.000Z",
    savedListId: "missing-list",
  }), /n'existe plus/);
});
