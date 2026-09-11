const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const built = esbuild.buildSync({
  stdin: {
    contents: `
      export { buildAuthorSeriesQuickReview } from "@/renderer/components/ScraperAuthorFavorites/authorSeriesQuickReview";
    `,
    resolveDir: process.cwd(),
    sourcefile: "author-series-quick-review-test.ts",
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
const { buildAuthorSeriesQuickReview } = bundledModule.exports;

const scraper = {
  id: "test",
  name: "Test",
  baseUrl: "https://example.test",
  features: [],
};

const buildSource = (title, detailUrl, languageCode) => ({
  scraper,
  result: { title, detailUrl },
  searchTerm: "author",
  pageIndex: 0,
  sourceLanguageCodes: [languageCode],
  detectedLanguageCodes: [],
  tentativeAuthorNames: ["Author"],
  advancedRomanizedTitleVariants: [],
  advancedRomanizedTentativeAuthorNameVariants: [],
  contentTypes: [],
  canOpenDetails: true,
});

const buildResult = (id, ...sources) => ({
  id,
  title: sources[0].result.title,
  sources,
  sourceLanguageCodes: Array.from(new Set(sources.flatMap((source) => (
    source.sourceLanguageCodes
  )))),
  preferredTitleLanguageCodes: ["en"],
  tentativeAuthorNames: ["Author"],
  contentTypes: [],
});

const buildGroup = (kind, id, title, chapters) => ({
  id,
  kind,
  title,
  aliases: [title.toLowerCase()],
  chapterCount: chapters.length,
  chapters,
  reference: {
    scraperId: scraper.id,
    sourceUrl: scraper.baseUrl,
    rawTitle: title,
    title,
    alternativeTitles: [],
    authors: ["Author"],
    authorUrls: [],
  },
  sourceCount: chapters.reduce((count, chapter) => count + chapter.result.sources.length, 0),
});

test("series quick review exposes chapters and language coverage", () => {
  const series = buildGroup("series", "series::moon", "Moonlight", [
    {
      chapter: "1-2",
      result: buildResult(
        "moon-1-2",
        buildSource("Moonlight 1-2", "https://example.test/en-1-2", "en"),
      ),
    },
    {
      chapter: "3",
      result: buildResult(
        "moon-3",
        buildSource("Moonlight 3", "https://example.test/en-3", "en"),
        buildSource("Clair de lune 3", "https://example.test/fr-3", "fr"),
      ),
    },
  ]);
  series.chapterCount = 3;

  const review = buildAuthorSeriesQuickReview([series], "Author");

  assert.equal(review.items.length, 2);
  assert.equal(review.seriesSession.contextLabel, "Author");
  assert.equal(review.seriesSession.groups.length, 1);
  assert.deepEqual(
    review.seriesSession.groups[0].chapters.map((chapter) => chapter.label),
    ["1-2", "3"],
  );
  assert.deepEqual(review.seriesSession.groups[0].languageAvailability, [
    { languageCode: "en", chapterCount: 3 },
    { languageCode: "fr", chapterCount: 1 },
  ]);
});

test("the One Shot bucket stays a list of independent review cards", () => {
  const oneShots = buildGroup("oneShots", "series::one-shots", "One Shot", [
    {
      chapter: "Blue Morning",
      result: buildResult(
        "blue-morning",
        buildSource("Blue Morning", "https://example.test/blue", "en"),
      ),
    },
    {
      chapter: "Quiet Afternoon",
      result: buildResult(
        "quiet-afternoon",
        buildSource("Quiet Afternoon", "https://example.test/quiet", "en"),
      ),
    },
  ]);

  const review = buildAuthorSeriesQuickReview([oneShots], "Author");

  assert.equal(review.items.length, 2);
  assert.deepEqual(review.seriesSession.groups, []);
  assert.ok(review.items.every((item) => item.id.startsWith("series::one-shots:")));
});
