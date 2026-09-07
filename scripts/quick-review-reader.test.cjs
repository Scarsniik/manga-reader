const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export { selectQuickReviewReaderChapter } from "@/renderer/components/QuickReview/quickReviewReader";
  export { createScraperMangaId } from "@/renderer/utils/scraperRuntime";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "quick-review-reader-test.ts" },
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
  createScraperMangaId,
  selectQuickReviewReaderChapter,
} = bundledModule.exports;

const scraperId = "hentaihere";
const sourceUrl = "https://hentaihere.com/m/S71527";
const chapters = [
  { label: "Chapitre 1", url: "https://hentaihere.com/m/S71527/1/1/" },
  { label: "Chapitre 2", url: "https://hentaihere.com/m/S71527/2/1/" },
];

test("quick review starts at the first chapter when no progress exists", () => {
  const selection = selectQuickReviewReaderChapter({
    scraperId,
    sourceUrls: [sourceUrl],
    chapters,
    progressRecords: [],
  });

  assert.equal(selection.chapter.label, "Chapitre 1");
  assert.equal(selection.progress, null);
});

test("quick review resumes the most recently updated chapter progress", () => {
  const older = {
    id: createScraperMangaId(scraperId, `${sourceUrl}/`, chapters[0].url),
    scraperId,
    title: "Example",
    sourceUrl: `${sourceUrl}/`,
    currentPage: 3,
    totalPages: 10,
    updatedAt: "2026-09-05T10:00:00.000Z",
  };
  const latest = {
    ...older,
    id: createScraperMangaId(scraperId, `${sourceUrl}/`, chapters[1].url),
    currentPage: 7,
    updatedAt: "2026-09-06T10:00:00.000Z",
  };
  const selection = selectQuickReviewReaderChapter({
    scraperId,
    sourceUrls: [sourceUrl],
    chapters,
    progressRecords: [older, latest],
  });

  assert.equal(selection.chapter.label, "Chapitre 2");
  assert.equal(selection.progress.currentPage, 7);
  assert.equal(selection.sourceUrl, `${sourceUrl}/`);
});
