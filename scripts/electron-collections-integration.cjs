const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const NOW = "2026-08-11T12:00:00.000Z";
const temporaryUserData = fs.mkdtempSync(path.join(os.tmpdir(), "scaramanga-electron-db-test-"));
const dataDirectory = path.join(temporaryUserData, "data");
fs.mkdirSync(dataDirectory, { recursive: true });

const initialBookmark = {
  scraperId: "source-a",
  sourceUrl: "https://example.test/manga/1",
  title: "Initial bookmark",
  authors: [],
  tags: [],
  createdAt: NOW,
  updatedAt: NOW,
};

fs.writeFileSync(path.join(dataDirectory, "scraper-bookmarks.json"), JSON.stringify([initialBookmark]));
fs.writeFileSync(path.join(dataDirectory, "scraper-view-history.json"), "[]");
fs.writeFileSync(path.join(dataDirectory, "history.json"), JSON.stringify({
  reading: [],
  details: [],
  searches: [],
}));
fs.writeFileSync(path.join(dataDirectory, "scraper-reader-progress.json"), "[]");
fs.writeFileSync(path.join(dataDirectory, "params.json"), "{}");

app.setPath("userData", temporaryUserData);
app.setPath("sessionData", temporaryUserData);

const cleanup = () => {
  try {
    const connection = require("../dist/electron/database/connection.js");
    connection.closeCollectionsDatabase();
  } catch {
    // The connection may not have been loaded when startup itself failed.
  }

  try {
    fs.rmSync(temporaryUserData, { recursive: true, force: true });
  } catch {
    // Electron may retain a session file briefly; the operating-system temp cleanup can remove it later.
  }
};

app.whenReady().then(async () => {
  const bookmarks = require("../dist/electron/handlers/scrapers/bookmarks.js");
  const history = require("../dist/electron/handlers/history.js");
  const readerProgress = require("../dist/electron/handlers/scrapers/readerProgress.js");
  const viewHistory = require("../dist/electron/handlers/scrapers/viewHistory.js");

  assert.equal((await bookmarks.getScraperBookmarks()).length, 1);
  const savedBookmark = await bookmarks.saveScraperBookmark({}, {
    scraperId: "source-b",
    sourceUrl: "https://example.test/manga/2",
    title: "Inserted bookmark",
    authors: ["Test Author"],
    tags: [],
  });
  assert.equal(savedBookmark.title, "Inserted bookmark");
  assert.equal((await bookmarks.getScraperBookmarks()).length, 2);
  assert.equal(await bookmarks.removeScraperBookmark({}, savedBookmark), true);
  assert.equal((await bookmarks.getScraperBookmarks()).length, 1);

  const seenRecords = await viewHistory.recordScraperCardsSeenCompact({}, {
    cards: [{
      scraperId: initialBookmark.scraperId,
      sourceUrl: initialBookmark.sourceUrl,
      title: initialBookmark.title,
    }],
  });
  assert.equal(seenRecords.length, 1);
  assert.equal((await viewHistory.getScraperViewHistory()).length, 1);

  const detailsRecord = await history.recordDetailsHistory({}, {
    scraperId: initialBookmark.scraperId,
    sourceUrl: initialBookmark.sourceUrl,
    title: initialBookmark.title,
  });
  assert.equal((await history.getHistoryRecords()).details.length, 1);
  assert.equal((await history.removeDetailsHistoryRecord({}, detailsRecord.id)).details.length, 0);

  await readerProgress.saveScraperReaderProgress({}, {
    id: "progress-test",
    scraperId: initialBookmark.scraperId,
    sourceUrl: initialBookmark.sourceUrl,
    title: initialBookmark.title,
    currentPage: 2,
    totalPages: 10,
  });
  assert.ok(await readerProgress.getScraperReaderProgress({}, "progress-test"));
  assert.equal(await readerProgress.removeScraperReaderProgress({}, {
    scraperId: initialBookmark.scraperId,
    sourceUrl: initialBookmark.sourceUrl,
  }), 1);

  const connection = require("../dist/electron/database/connection.js");
  const database = connection.getCollectionsDatabase();
  assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  console.log("Electron collections integration passed.");

  cleanup();
  app.quit();
}).catch((error) => {
  console.error(error);
  cleanup();
  app.exit(1);
});
