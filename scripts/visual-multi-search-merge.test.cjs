const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const built = esbuild.buildSync({
  stdin: {
    contents: `
      export { mergeMultiSearchResults } from "@/renderer/components/MultiSearch/multiSearchMerge";
      export { mergeMultiSearchResultsByVisualFingerprint } from "@/renderer/components/MultiSearch/useVisualMultiSearchMerge";
      export { processMultiSearchLists } from "@/renderer/components/MultiSearch/multiSearchListProcessing";
    `,
    resolveDir: process.cwd(),
    sourcefile: "visual-multi-search-merge-test.ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  alias: { "@": path.resolve("src") },
  external: ["*.worker"],
});
const bundledModule = { exports: {} };
new Function("module", "exports", "require", built.outputFiles[0].text)(
  bundledModule,
  bundledModule.exports,
  require,
);
const {
  mergeMultiSearchResults,
  mergeMultiSearchResultsByVisualFingerprint,
  processMultiSearchLists,
} = bundledModule.exports;

const scraper = {
  id: "test",
  name: "Test",
  baseUrl: "https://example.test",
  features: [],
};
const options = {
  enableRomajiPhoneticMerge: true,
  assumeSameAuthor: true,
  preferredTitleLanguageCodes: ["en"],
};
const buildSource = (title, detailUrl, sourceLanguageCodes = ["en"]) => ({
  scraper,
  result: { title, detailUrl, thumbnailUrl: `${detailUrl}.jpg` },
  searchTerm: "author",
  pageIndex: 0,
  sourceLanguageCodes,
  detectedLanguageCodes: [],
  tentativeAuthorNames: ["Gagarin Kichi"],
  advancedRomanizedTitleVariants: [],
  advancedRomanizedTentativeAuthorNameVariants: [],
  contentTypes: [],
  canOpenDetails: true,
});

test("large card lists share the backend-compatible filter and display pipeline", () => {
  const results = Array.from({ length: 1500 }, (_, index) => {
    const isEnglish = index % 2 === 0;
    const source = buildSource(
      isEnglish ? `English title ${index}` : `日本語 タイトル ${index}`,
      `https://example.test/list-${index}`,
      [isEnglish ? "en" : "ja"],
    );
    return {
      id: `result-${index}`,
      title: source.result.title,
      coverUrl: source.result.thumbnailUrl,
      sources: [source],
      sourceLanguageCodes: source.sourceLanguageCodes,
      tentativeAuthorNames: [],
      contentTypes: [],
    };
  });
  const processed = processMultiSearchLists(results, [], {
    languageFilterModes: { en: "only" },
    readingStatusFilters: [],
    textFilter: "English",
    readingStatusContext: {
      libraryMangas: [],
      bookmarkedSourceKeys: new Set(),
      sourceProgressIndex: { recordsById: new Map(), recordsBySourceKey: new Map() },
      viewHistoryRecordsById: new Map(),
    },
    display: {
      originalOnly: false,
      hideBlacklistedCards: false,
      viewHistoryRecordsById: new Map(),
      newViewHistoryIds: new Set(),
      showUnseenFirst: false,
      showUnseenOnly: false,
    },
  });

  assert.equal(processed.results.length, 750);
  assert.ok(processed.results.every((result) => result.sourceLanguageCodes.includes("en")));
  assert.equal(processed.splitResultCount, 1500);
  assert.equal(processed.languageResultCount, 750);
});
const buildFingerprint = (value) => ({
  version: 1,
  width: 24,
  height: 24,
  luminanceBase64: Buffer.alloc(24 * 24, value).toString("base64"),
  aspectRatio: 1.33,
});
const buildFingerprintMap = (entries) => new Map(entries.map(([source, fingerprint]) => ([
  `test::${source.result.detailUrl}`,
  fingerprint,
])));

test("visual matching merges publication cards before the series view", () => {
  const englishYouko = buildSource(
    "[Golden Bazooka (Gagarin Kichi)] Netorareta Bakunyuu Genki Zuma Youko -Kaji Daikou saki de Toshishita Celeb no Onaho Zuma ni Saremashita- [English] [Decensored]",
    "https://example.test/youko-english",
  );
  const romanizedYouko = buildSource(
    "[Gagarin Kichi] Netorare ta bakunyū genki tsuma Yōko ― kaji daikō-saki de toshishita serebu no onaho tsuma ni sa remashita",
    "https://example.test/youko-romanized",
  );
  const firstChapter = buildSource(
    "[Gagarin Kichi] Netorareta Bakunyuu Tsuma-tachi",
    "https://example.test/tsuma-1",
  );
  const secondChapter = buildSource(
    "[Gagarin Kichi] Netorareta Bakunyuu Tsuma-tachi 2",
    "https://example.test/tsuma-2",
  );
  const sameCover = buildFingerprint(120);
  const titleMergedResults = mergeMultiSearchResults([
    englishYouko,
    romanizedYouko,
    firstChapter,
    secondChapter,
  ], options);
  const visuallyMergedResults = mergeMultiSearchResultsByVisualFingerprint(
    titleMergedResults,
    options,
    buildFingerprintMap([
      [englishYouko, sameCover],
      [romanizedYouko, sameCover],
      [firstChapter, buildFingerprint(220)],
      [secondChapter, sameCover],
    ]),
  );

  assert.deepEqual(
    visuallyMergedResults.map((result) => result.sources.length).sort((left, right) => left - right),
    [1, 3],
  );
});

test("visual matching keeps different covers and conflicting chapters separate", () => {
  const quiet = buildSource("A Quiet Afternoon", "https://example.test/quiet");
  const blue = buildSource("Blue Morning", "https://example.test/blue");
  const moonOne = buildSource("Moonlight Journey 1", "https://example.test/moon-1");
  const moonTwo = buildSource("Moonlight Journey 2", "https://example.test/moon-2");
  const sources = [quiet, blue, moonOne, moonTwo];
  const sameCover = buildFingerprint(120);
  const visuallyMergedResults = mergeMultiSearchResultsByVisualFingerprint(
    mergeMultiSearchResults(sources, options),
    options,
    buildFingerprintMap([
      [quiet, buildFingerprint(40)],
      [blue, buildFingerprint(220)],
      [moonOne, sameCover],
      [moonTwo, sameCover],
    ]),
  );

  assert.equal(visuallyMergedResults.length, 4);
  assert.equal(visuallyMergedResults.every((result) => result.sources.length === 1), true);
});

test("same-author visual matching bridges Japanese and romaji one-shot titles", () => {
  const romaji = buildSource(
    "(C108) [Golden Bazooka (Gagarin Kichi)] Batsuichi Oba-san to Sekkyou Hitozuma, Wake Ari Ureman Onaho ni Shimasu. [Sample]",
    "https://example.test/batsuichi-romaji",
  );
  const japanese = buildSource(
    "（C108） ［ゴールデンバズーカ （ガガーリン吉）］ バツイチおばさんと説教人妻、ワケあり熟れまんオナホにします。 （オリジナル） ［DL版］",
    "https://example.test/batsuichi-japanese",
  );
  const sameCover = buildFingerprint(120);
  const visuallyMergedResults = mergeMultiSearchResultsByVisualFingerprint(
    mergeMultiSearchResults([romaji, japanese], options),
    options,
    buildFingerprintMap([
      [romaji, sameCover],
      [japanese, sameCover],
    ]),
  );

  assert.equal(visuallyMergedResults.length, 1);
  assert.equal(visuallyMergedResults[0].sources.length, 2);
});
