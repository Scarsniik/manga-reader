const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export { doesCorrespondenceTitleContainKnownTitle } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
  export { extractCorrespondenceBareHashChapter } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
  export { extractTitleSequenceMarkers } from "@/renderer/utils/scraperTitleAnalysis/sequence";
  export { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
  export { inferMangaCorrespondenceFirstChapter } from "@/renderer/utils/mangaCorrespondenceChapter";
  export { mergeMultiSearchResults } from "@/renderer/components/MultiSearch/multiSearchMerge";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "manga-correspondence-test.ts" },
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
  doesCorrespondenceTitleContainKnownTitle,
  extractCorrespondenceBareHashChapter,
  extractTitleSequenceMarkers,
  analyzeMangaCorrespondenceTitle,
  inferMangaCorrespondenceFirstChapter,
  mergeMultiSearchResults,
} = bundledModule.exports;

test("correspondence accepts a known title surrounded by chapter and release metadata", () => {
  const knownTitle = "Having Tons of Bareback Sex with Gyarus";
  const candidates = [
    "Having Tons of Bareback Sex with Gyarus #6",
    "Having Tons of Bareback Sex with Gyarus Special Chapter: I Still Want to Have Sex Before the Exam",
    "[Sakamoto Shouten (Nishizawa Mizuki)] Gal to Meccha Namahame Nakadashi Ecchi Suru Hanashi #5 | Having Tons of Bareback Sex with Gyarus #5 [English] [Coffedrug] [Digital]",
  ];

  candidates.forEach((candidate) => {
    assert.equal(doesCorrespondenceTitleContainKnownTitle(candidate, knownTitle), true, candidate);
  });
});

test("correspondence containment does not accept unrelated or incidental short titles", () => {
  assert.equal(
    doesCorrespondenceTitleContainKnownTitle("A completely unrelated manga", "Having Tons of Bareback Sex with Gyarus"),
    false,
  );
  assert.equal(doesCorrespondenceTitleContainKnownTitle("The Gal Story", "Gal"), false);
});

test("bare hash suffixes are parsed as chapter markers", () => {
  assert.deepEqual(extractTitleSequenceMarkers("Having Tons of Bareback Sex with Gyarus #6"), {
    title: "Having Tons of Bareback Sex with Gyarus",
    sequenceMarkers: [{ kind: "chapter", label: "#", value: "6" }],
  });
  assert.equal(extractCorrespondenceBareHashChapter(
    "Japanese title #5 | Having Tons of Bareback Sex with Gyarus #5 [English] [Digital]",
  ), "5");
});

test("correspondence parsing uses the default structured parser when a scraper has no custom parser", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "[Popochichi (Yahiro Pochi)] Grope-A-Girlfriend 12 (Kanojo, Okarishimasu)",
    null,
  );

  assert.equal(result.title, "Grope-A-Girlfriend");
  assert.deepEqual(result.authors, ["Yahiro Pochi"]);
  assert.equal(result.circle, "Popochichi");
  assert.equal(result.parody, "Kanojo, Okarishimasu");
  assert.equal(result.chapter, "12");
});

test("correspondence parsing separates translated titles and their bare chapter", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "Rental Kanojo Osawari Shimasu 10 ー Grope-a-Girlfriend 10 (Kanojo, Okarishimasu) [English] [Digital]",
    null,
  );

  assert.equal(result.title, "Rental Kanojo Osawari Shimasu");
  assert.deepEqual(result.alternativeTitles, ["Grope-a-Girlfriend"]);
  assert.equal(result.chapter, "10");
  assert.equal(result.languageCode, "en");
  assert.deepEqual(result.suffixTags, ["Digital"]);
});

test("correspondence parsing separates author, chapter and release suffixes", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "[Sakura no Tomoru Hi e] Gal Mama Anna-san 2 [English] [SS22]",
    null,
  );

  assert.equal(result.title, "Gal Mama Anna-san");
  assert.deepEqual(result.authors, ["Sakura no Tomoru Hi e"]);
  assert.equal(result.chapter, "2");
  assert.equal(result.languageCode, "en");
  assert.deepEqual(result.unmatchedParts, ["SS22"]);
});

test("correspondence parsing tolerates event prefixes and nested release metadata", () => {
  const eventResult = analyzeMangaCorrespondenceTitle(
    "(C107) [Popochichi (Yahiro Pochi)] Rental Kanojo Osawari Shimasu 12 (Kanojo, Okarishimasu) [Chinese] [空気系☆漢化]",
    null,
  );
  const compilationResult = analyzeMangaCorrespondenceTitle(
    "[Popochichi (Yahiro Pochi)] Rental Kanojo Osawari Shimasu 05 (Rental Kanojo Osawari Shimasu Soushuuhen + 05) (Kanojo, Okarishimasu) [English] [Digital]",
    null,
  );

  assert.equal(eventResult.title, "Rental Kanojo Osawari Shimasu");
  assert.equal(eventResult.chapter, "12");
  assert.equal(eventResult.languageCode, "zh");
  assert.deepEqual(eventResult.authors, ["Yahiro Pochi"]);
  assert.equal(compilationResult.title, "Rental Kanojo Osawari Shimasu");
  assert.equal(compilationResult.chapter, "5");
  assert.equal(compilationResult.parody, "Kanojo, Okarishimasu");
  assert.deepEqual(compilationResult.suffixTags, ["Digital"]);
});

test("correspondence parsing tolerates alternate titles with punctuated chapters", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "[Popochichi (Yahiro Pochi)] Rental Kanojo Osawari Shimasu 08 (Kanojo, Okarishimasu) | Touch -A- Girlfriend 08! [English] [Team Rabu2] [Digital]",
    null,
  );

  assert.equal(result.title, "Rental Kanojo Osawari Shimasu");
  assert.deepEqual(result.alternativeTitles, ["Touch -A- Girlfriend"]);
  assert.equal(result.chapter, "8");
  assert.equal(result.parody, "Kanojo, Okarishimasu");
});

test("a plain known title is treated as chapter 1 but an extra release is not", () => {
  const knownTitles = ["Rental Kanojo Osawari Shimasu"];
  const plain = analyzeMangaCorrespondenceTitle(
    "[Popochichi (Yahiro Pochi)] Rental Kanojo Osawari Shimasu (Kanojo, Okarishimasu) [English]",
    null,
  );
  const extra = analyzeMangaCorrespondenceTitle(
    "[Popochichi (Yahiro Pochi)] Rental Kanojo Osawari Shimasu Extra (Kanojo, Okarishimasu) [English]",
    null,
  );
  const ongoing = analyzeMangaCorrespondenceTitle(
    "[Popochichi (Yahiro Pochi)] Rental Kanojo Osawari Shimasu (Ongoing) [English]",
    null,
  );

  assert.equal(inferMangaCorrespondenceFirstChapter(plain, knownTitles), "1");
  assert.equal(inferMangaCorrespondenceFirstChapter(extra, knownTitles), undefined);
  assert.equal(inferMangaCorrespondenceFirstChapter(ongoing, knownTitles), undefined);
});

const buildMergeSource = (title, languageCode, detailUrl, thumbnailUrl) => ({
  scraper: { id: "test", name: "Test" },
  result: { title, detailUrl, thumbnailUrl },
  searchTerm: "test",
  pageIndex: 0,
  sourceLanguageCodes: [languageCode],
  detectedLanguageCodes: [],
  tentativeAuthorNames: ["Yahiro Pochi"],
  advancedRomanizedTitleVariants: [],
  advancedRomanizedTentativeAuthorNameVariants: [],
  contentTypes: [],
  canOpenDetails: true,
});

test("merged cards use the first source from the highest-priority available language", () => {
  const japanese = buildMergeSource(
    "Rental Kanojo Osawari Shimasu 10",
    "ja",
    "https://example.test/ja",
    "https://example.test/ja.jpg",
  );
  const english = buildMergeSource(
    "Rental Kanojo Osawari Shimasu 10 [English]",
    "en",
    "https://example.test/en",
    "https://example.test/en.jpg",
  );
  const [merged] = mergeMultiSearchResults([japanese, english], {
    enableRomajiPhoneticMerge: false,
    preferredTitleLanguageCodes: ["fr", "en", "ja"],
  });

  assert.equal(merged.sources.length, 2);
  assert.equal(merged.title, english.result.title);
  assert.equal(merged.coverUrl, english.result.thumbnailUrl);
});
