const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const built = esbuild.buildSync({
  stdin: {
    contents: `
      export { buildAuthorSeriesGroups } from "@/renderer/components/ScraperAuthorFavorites/authorSeriesGroups";
      export { buildAuthorSeriesChapterCoverage } from "@/renderer/components/ScraperAuthorFavorites/authorSeriesChapterCoverage";
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
  buildAuthorSeriesChapterCoverage,
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

test("a lone descriptive subtitle remains a one shot", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("subtitle", buildSource(
      "Seimu Chousa wa Totsuzen ni. ~Aisuru Tsuma e no Namahame Chousa~",
      "https://example.test/subtitle",
    )),
  ], mergeOptions);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "oneShots");
  assert.equal(groups[0].chapters.length, 1);
});

test("plain and descriptively subtitled variants remain one merged one shot", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("plain", buildSource(
      "Netorareta Bakunyuu Genki Zuma Youko",
      "https://example.test/plain",
    )),
    buildResult("subtitle", buildSource(
      "Netorareta Bakunyuu Genki Zuma Youko -Kaji Daikou saki de Toshishita Celeb no Onaho Zuma ni Saremashita-",
      "https://example.test/subtitle",
    )),
  ], mergeOptions);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "oneShots");
  assert.equal(groups[0].chapters.length, 1);
  assert.equal(groups[0].chapters[0].result.sources.length, 2);
});

test("translated aliases keep one named chapter in the one shot group", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("romanized", buildSource(
      "Netorareta Bakunyuu Seiso Zuma Hitomi -Oikko ni Torotoro ni Tokasaremashita-",
      "https://example.test/romanized",
    )),
    buildResult("korean", buildSource(
      "Netorareta Bakunyuu Seiso Zuma Hitomi -Oikko ni Torotoro ni Tokasaremashita- ㅣ 네토라레 폭유 청순 아내 히토미 -조카에게 끈적끈적 녹아버렸습니다-",
      "https://example.test/korean",
    )),
  ], mergeOptions);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "oneShots");
  assert.equal(groups[0].chapters.length, 1);
  assert.equal(groups[0].chapters[0].result.sources.length, 2);
});

test("distinct named releases with the same base title still form a series", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("first", buildSource(
      "Shared Work ~First Story~",
      "https://example.test/first-story",
    )),
    buildResult("second", buildSource(
      "Shared Work ~Second Story~",
      "https://example.test/second-story",
    )),
  ], mergeOptions);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "series");
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), [
    "First Story",
    "Second Story",
  ]);
});

test("an inferred first chapter stays numbered when the series has other chapters", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("series-plain", buildSource("Long Journey", "https://example.test/journey-1")),
    buildResult("series-2", buildSource("Long Journey 2", "https://example.test/journey-2")),
  ], mergeOptions);

  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["1", "2"]);
});

test("explicit parts are grouped as numbered releases of the same series", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("midnight-1", buildSource(
      "Mom In The Middle of Midnight Part 1",
      "https://example.test/midnight-1",
    )),
    buildResult("midnight-2", buildSource(
      "Mom In The Middle of Midnight Part 2",
      "https://example.test/midnight-2",
    )),
  ], mergeOptions);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "Mom In The Middle of Midnight");
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["1", "2"]);
});

test("an unseparated numbered subtitle joins a corroborated bilingual series", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("hifuu-1", buildSource(
      "(Kouroumu 10) [Nagiyamasugi (Nagiyama)] Hifuu Ryoujoku 1 - Renko Chikan Densha",
      "https://example.test/hifuu-1",
    )),
    buildResult("hifuu-5", buildSource(
      "(C89) [Nagiyamasugi (Nagiyama)] Hifuu Ryoujoku 5 Katei Kyoushi Renko | Secret Sex Assault 5 - Private Tutor Renko",
      "https://example.test/hifuu-5",
    )),
  ], mergeOptions);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "Hifuu Ryoujoku");
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["1", "5"]);
});

test("matching cover fingerprints bridge a named release to its numbered series chapter", () => {
  const sameCoverFingerprint = {
    version: 1,
    width: 24,
    height: 24,
    luminanceBase64: Buffer.alloc(24 * 24, 120).toString("base64"),
    aspectRatio: 1.33,
  };
  const otherCoverFingerprint = {
    ...sameCoverFingerprint,
    luminanceBase64: Buffer.alloc(24 * 24, 220).toString("base64"),
  };
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
  const fingerprints = new Map([
    ["test::https://example.test/youko-english", sameCoverFingerprint],
    ["test::https://example.test/youko-romanized", sameCoverFingerprint],
    ["test::https://example.test/tsuma-1", otherCoverFingerprint],
    ["test::https://example.test/tsuma-2", sameCoverFingerprint],
  ]);

  const groups = buildAuthorSeriesGroups([
    buildResult("youko-en", englishYouko),
    buildResult("youko-romaji", romanizedYouko),
    buildResult("tsuma-1", firstChapter),
    buildResult("tsuma-2", secondChapter),
  ], mergeOptions, new Map(), new Map(), fingerprints);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "series");
  assert.equal(groups[0].title, "Netorareta Bakunyuu Tsuma-tachi");
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["1", "2"]);
  assert.equal(groups[0].chapters[0].result.sources.length, 1);
  assert.equal(groups[0].chapters[1].result.sources.length, 3);
});

test("matching cover fingerprints do not merge unrelated titles", () => {
  const sharedFingerprint = {
    version: 1,
    width: 24,
    height: 24,
    luminanceBase64: Buffer.alloc(24 * 24, 120).toString("base64"),
    aspectRatio: 1.33,
  };
  const groups = buildAuthorSeriesGroups([
    buildResult("quiet", buildSource("A Quiet Afternoon", "https://example.test/quiet")),
    buildResult("blue", buildSource("Blue Morning", "https://example.test/blue")),
  ], mergeOptions, new Map(), new Map(), new Map([
    ["test::https://example.test/quiet", sharedFingerprint],
    ["test::https://example.test/blue", sharedFingerprint],
  ]));

  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "oneShots");
  assert.equal(groups[0].chapters.length, 2);
});

test("matching cover fingerprints preserve conflicting explicit chapters", () => {
  const sharedFingerprint = {
    version: 1,
    width: 24,
    height: 24,
    luminanceBase64: Buffer.alloc(24 * 24, 120).toString("base64"),
    aspectRatio: 1.33,
  };
  const groups = buildAuthorSeriesGroups([
    buildResult("moon-1", buildSource("Moonlight 1", "https://example.test/moon-cover-1")),
    buildResult("moon-2", buildSource("Moonlight 2", "https://example.test/moon-cover-2")),
  ], mergeOptions, new Map(), new Map(), new Map([
    ["test::https://example.test/moon-cover-1", sharedFingerprint],
    ["test::https://example.test/moon-cover-2", sharedFingerprint],
  ]));

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["1", "2"]);
  assert.equal(groups[0].chapters.every((chapter) => chapter.result.sources.length === 1), true);
});

test("a source card with chapters represents their cumulative coverage", () => {
  const source = buildSource("Long Journey", "https://example.test/journey");
  const coverage = buildAuthorSeriesChapterCoverage([
    {
      label: "2 - A Seemingly Gentle Personal Trainer Gives My Body A Rough Workout 2 (by: Anonymous)",
      url: "https://example.test/journey/2",
    },
    {
      label: "1 - A Seemingly Gentle Personal Trainer Gives My Body A Rough Workout (by: Anonymous)",
      url: "https://example.test/journey/1",
    },
  ]);
  const groups = buildAuthorSeriesGroups(
    [buildResult("series", source)],
    mergeOptions,
    new Map(),
    new Map([["test::https://example.test/journey", coverage]]),
  );

  assert.deepEqual(coverage, { chapter: "1-2" });
  assert.equal(groups[0].chapterCount, 2);
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["1-2"]);
});

test("a source without extracted chapters keeps the chapter from its card title", () => {
  const groups = buildAuthorSeriesGroups([
    buildResult("series-2", buildSource("Long Journey 2", "https://example.test/journey-2")),
  ], mergeOptions);

  assert.equal(buildAuthorSeriesChapterCoverage([]), null);
  assert.equal(groups[0].chapterCount, 1);
  assert.deepEqual(groups[0].chapters.map((chapter) => chapter.chapter), ["2"]);
});

test("a source with only one extracted chapter remains a one shot", () => {
  const source = buildSource("A Quiet Afternoon", "https://example.test/quiet-afternoon");
  const coverage = buildAuthorSeriesChapterCoverage([
    {
      label: "1 - A Quiet Afternoon (by: Anonymous)",
      url: "https://example.test/quiet-afternoon/1",
    },
  ]);
  const groups = buildAuthorSeriesGroups(
    [buildResult("one-shot", source)],
    mergeOptions,
    new Map(),
    coverage
      ? new Map([["test::https://example.test/quiet-afternoon", coverage]])
      : new Map(),
  );

  assert.equal(coverage, null);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, "oneShots");
  assert.equal(groups[0].title, "One Shot");
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
