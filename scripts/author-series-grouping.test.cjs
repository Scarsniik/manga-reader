const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const built = esbuild.buildSync({
  stdin: {
    contents: `
      export { buildAuthorSeriesGroups } from "@/renderer/components/ScraperAuthorFavorites/authorSeriesGroups";
      export { applyAuthorSeriesCorrespondenceSnapshots } from "@/renderer/components/ScraperAuthorFavorites/authorSeriesCorrespondence";
      export { buildAuthorSeriesPrefilledCorrespondenceResult } from "@/renderer/components/ScraperAuthorFavorites/authorSeriesCorrespondence";
    `,
    resolveDir: process.cwd(),
    sourcefile: "author-series-grouping-test.ts",
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
const {
  applyAuthorSeriesCorrespondenceSnapshots,
  buildAuthorSeriesPrefilledCorrespondenceResult,
  buildAuthorSeriesGroups,
} = bundledModule.exports;

const scraper = {
  id: "test",
  name: "Test",
  baseUrl: "https://example.test",
  features: [],
};

const buildSource = (title, detailUrl) => ({
  scraper,
  result: { title, detailUrl },
  searchTerm: "author",
  pageIndex: 0,
  sourceLanguageCodes: ["en"],
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
  sourceLanguageCodes: ["en"],
  tentativeAuthorNames: ["Author"],
  contentTypes: [],
});

const mergeOptions = {
  enableRomajiPhoneticMerge: true,
  assumeSameAuthor: true,
  preferredTitleLanguageCodes: ["en"],
};

test("author results are sorted by series and chapters", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("moon-2", buildSource("Moonlight 2", "https://example.test/moon-2")),
    buildResult("other-3", buildSource("Other Story 3", "https://example.test/other-3")),
    buildResult("moon-1", buildSource("Moonlight 1", "https://example.test/moon-1")),
  ], mergeOptions);

  assert.deepEqual(groups.map((group) => group.title), ["Moonlight", "Other Story"]);
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["1", "2"]);
});

test("a bilingual card connects translated series across chapters", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("english-1", buildSource("Moonlight 1", "https://example.test/en-1")),
    buildResult("japanese-2", buildSource("Tsukiakari 2", "https://example.test/ja-2")),
    buildResult(
      "bridge-3",
      buildSource("Moonlight 3", "https://example.test/en-3"),
      buildSource("Tsukiakari 3", "https://example.test/ja-3"),
    ),
  ], mergeOptions);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["1", "2", "3"]);
  assert.equal(groups[0].chapters[2].result.sources.length, 2);
});

test("unnumbered standalone works share a top-level one shot group", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("standalone", buildSource("A Quiet Afternoon", "https://example.test/standalone")),
    buildResult("standalone-2", buildSource("Blue Morning", "https://example.test/standalone-2")),
  ], mergeOptions);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "One Shot");
  assert.equal(groups[0].kind, "oneShots");
  assert.deepEqual(
    groups[0].chapters.map((chapter) => chapter.chapter),
    ["A Quiet Afternoon", "Blue Morning"],
  );
});

test("an inferred first chapter stays numbered when the series has other chapters", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("series-plain", buildSource("Long Journey", "https://example.test/journey-1")),
    buildResult("series-2", buildSource("Long Journey 2", "https://example.test/journey-2")),
  ], mergeOptions);

  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["1", "2"]);
});

test("chapter corrections from an opened correspondence update the series overview", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("series-1", buildSource("Moonlight 1", "https://example.test/moon-1")),
    buildResult("series-2", buildSource("Moonlight 2", "https://example.test/moon-2")),
  ], mergeOptions);
  const correctedSource = buildSource("Moonlight 2", "https://example.test/moon-2");
  const snapshot = {
    input: {
      reference: groups[0].reference,
      request: "otherChapters",
      strategy: "balanced",
      scraperFilterValues: [],
      scrapers: [scraper],
      maxPages: 1,
      paceMode: "fast",
      scrapingConcurrency: 1,
      scrapeDetailsWithCards: false,
      enableRomajiPhoneticMerge: true,
      safety: {},
    },
    result: {
      request: "otherChapters",
      matches: [{
        key: "corrected-2",
        source: correctedSource,
        analyzedTitle: "Moonlight",
        alternativeTitles: [],
        authors: ["Author"],
        chapter: "2",
        chapterOverride: {
          value: "4",
          scope: "match",
          updatedAt: "2026-09-05T00:00:00.000Z",
        },
        matchedTerm: "Moonlight",
        discoveredByStepIds: [],
      }],
      rejectedCandidates: [],
      rejectedCandidateCount: 0,
      passNumber: 1,
      trace: [],
      searchedTitles: ["Moonlight"],
      searchedAuthors: [],
    },
  };

  const updatedGroups = applyAuthorSeriesCorrespondenceSnapshots(
    groups,
    new Map([[groups[0].id, snapshot]]),
    mergeOptions,
  );

  assert.deepEqual(updatedGroups[0].chapters.map((chapter) => chapter.chapter), ["1", "4"]);
});

test("a manual assignment changes both the series and the chapter", () => {
  const movedSource = buildSource("Moonlight 2", "https://example.test/moon-2");
  const groups = buildAuthorSeriesGroups([
    buildResult("moon-1", buildSource("Moonlight 1", "https://example.test/moon-1")),
    buildResult("moon-2", movedSource),
    buildResult("other-1", buildSource("Other Story 1", "https://example.test/other-1")),
  ], mergeOptions, new Map([[
    "test::https://example.test/moon-2",
    { seriesTitle: "Other Story", chapter: "3" },
  ]]));

  assert.deepEqual(groups.map((group) => group.title), ["Moonlight", "Other Story"]);
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["1"]);
  assert.deepEqual(groups[1].chapters.map((chapter) => chapter.chapter), ["1", "3"]);
});

test("opening a series builds a prefilled correspondence result without searched terms", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("series-1", buildSource("Moonlight 1", "https://example.test/moon-1")),
    buildResult("series-2", buildSource("Moonlight 2", "https://example.test/moon-2")),
  ], mergeOptions);

  const result = buildAuthorSeriesPrefilledCorrespondenceResult(groups[0]);

  assert.deepEqual(result.matches.map((match) => match.chapter), ["1", "2"]);
  assert.deepEqual(result.searchedTitles, []);
  assert.deepEqual(result.searchedAuthors, []);
  assert.equal(result.matches.every((match) => match.acceptedManually), true);
});
