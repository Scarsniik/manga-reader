const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { openCollectionsDatabase } = require("../dist/electron/database/databaseFactory.js");

const NOW = "2026-08-11T12:00:00.000Z";

const createFixture = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scaramanga-collections-test-"));
  const paths = {
    bookmarks: path.join(directory, "scraper-bookmarks.json"),
    viewHistory: path.join(directory, "scraper-view-history.json"),
    appHistory: path.join(directory, "history.json"),
    readerProgress: path.join(directory, "scraper-reader-progress.json"),
  };
  const bookmark = {
    scraperId: "source-a",
    sourceUrl: "https://example.test/manga/1",
    title: "Fixture manga",
    authors: ["Fixture Author"],
    tags: ["fixture"],
    createdAt: NOW,
    updatedAt: NOW,
  };

  fs.writeFileSync(paths.bookmarks, JSON.stringify([bookmark], null, 2));
  fs.writeFileSync(paths.viewHistory, JSON.stringify([{
    id: "svh_fixture1",
    scraperId: "source-a",
    sourceUrl: bookmark.sourceUrl,
    firstSeenAt: NOW,
  }], null, 2));
  fs.writeFileSync(paths.appHistory, JSON.stringify({
    reading: [],
    details: [{
      id: "details_fixture1",
      scraperId: "source-a",
      sourceUrl: bookmark.sourceUrl,
      title: bookmark.title,
      createdAt: NOW,
      updatedAt: NOW,
    }],
    searches: [],
  }, null, 2));
  fs.writeFileSync(paths.readerProgress, JSON.stringify([{
    id: "progress-fixture-1",
    scraperId: "source-a",
    sourceUrl: bookmark.sourceUrl,
    title: bookmark.title,
    currentPage: 2,
    totalPages: 20,
    updatedAt: NOW,
  }], null, 2));

  return {
    directory,
    databasePath: path.join(directory, "collections.sqlite"),
    paths,
    bookmark,
  };
};

const removeFixture = (fixture) => {
  fs.rmSync(fixture.directory, { recursive: true, force: true });
};

const readCount = (database, tableName) => Number(
  database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count,
);

test("legacy JSON collections are imported atomically and remain untouched", () => {
  const fixture = createFixture();
  const originalBookmarks = fs.readFileSync(fixture.paths.bookmarks, "utf8");

  try {
    const database = openCollectionsDatabase({
      databasePath: fixture.databasePath,
      legacyPaths: fixture.paths,
    });

    assert.equal(readCount(database, "scraper_bookmarks"), 1);
    assert.equal(readCount(database, "scraper_view_history"), 1);
    assert.equal(readCount(database, "app_history"), 1);
    assert.equal(readCount(database, "scraper_reader_progress"), 1);
    assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.ok(database.prepare(
      "SELECT value FROM collection_metadata WHERE key = ?",
    ).get("legacy_json_import_v1"));
    database.close();

    assert.equal(fs.readFileSync(fixture.paths.bookmarks, "utf8"), originalBookmarks);
  } finally {
    removeFixture(fixture);
  }
});

test("completed JSON migration is idempotent", () => {
  const fixture = createFixture();

  try {
    let database = openCollectionsDatabase({
      databasePath: fixture.databasePath,
      legacyPaths: fixture.paths,
    });
    database.close();

    fs.writeFileSync(fixture.paths.bookmarks, JSON.stringify([
      fixture.bookmark,
      {
        ...fixture.bookmark,
        sourceUrl: "https://example.test/manga/added-after-migration",
      },
    ]));

    database = openCollectionsDatabase({
      databasePath: fixture.databasePath,
      legacyPaths: fixture.paths,
    });
    assert.equal(readCount(database, "scraper_bookmarks"), 1);
    database.close();
  } finally {
    removeFixture(fixture);
  }
});

test("a malformed legacy file leaves collection tables empty and can be retried", () => {
  const fixture = createFixture();

  try {
    fs.writeFileSync(fixture.paths.viewHistory, "[invalid-json");
    assert.throws(() => openCollectionsDatabase({
      databasePath: fixture.databasePath,
      legacyPaths: fixture.paths,
    }), /Impossible de convertir le stockage JSON/);

    fs.writeFileSync(fixture.paths.viewHistory, "[]");
    const database = openCollectionsDatabase({
      databasePath: fixture.databasePath,
      legacyPaths: fixture.paths,
    });
    assert.equal(readCount(database, "scraper_bookmarks"), 1);
    assert.equal(readCount(database, "scraper_view_history"), 0);
    database.close();
  } finally {
    removeFixture(fixture);
  }
});
