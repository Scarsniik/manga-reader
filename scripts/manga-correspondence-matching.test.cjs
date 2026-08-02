const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export { doesCorrespondenceTitleContainKnownTitle } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
  export { doesCorrespondenceAnalyzedTitleMatchKnownTitle } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
  export { extractCorrespondenceBareHashChapter } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
  export { partitionCorrespondenceAlternativeTitles } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
  export { selectCorrespondenceDiscoverableTitles } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
  export { extractTitleSequenceMarkers } from "@/renderer/utils/scraperTitleAnalysis/sequence";
  export { analyzeMangaCorrespondenceTitle } from "@/renderer/utils/mangaCorrespondenceTitleAnalysis";
  export { inferMangaCorrespondenceFirstChapter } from "@/renderer/utils/mangaCorrespondenceChapter";
  export { resolveMangaCorrespondenceMatchChapter } from "@/renderer/utils/mangaCorrespondenceChapter";
  export { compareMangaCorrespondenceChapters } from "@/renderer/utils/mangaCorrespondenceChapter";
  export { describeMangaCorrespondenceChapter } from "@/renderer/utils/mangaCorrespondenceChapter";
  export { doMangaCorrespondenceChaptersOverlap } from "@/renderer/utils/mangaCorrespondenceChapter";
  export { formatMangaCorrespondenceChapterLabel } from "@/renderer/utils/mangaCorrespondenceChapter";
  export { filterIncludedMangaCorrespondenceChapters } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceReadingListSelection";
  export { toggleMangaCorrespondenceChapterExclusion } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceReadingListSelection";
  export { mergeMultiSearchResults } from "@/renderer/components/MultiSearch/multiSearchMerge";
  export { selectMangaCorrespondenceRomanizedSearchTerms } from "@/renderer/backgroundSearch/mangaCorrespondenceRomanization";
  export { getMangaTitleAlternatives } from "@/renderer/utils/mangaMatching/titleProfiles";
  export { getMangaTitleMergeMatchKind } from "@/renderer/utils/mangaMatching/titleProfiles";
  export { getTokenBasedRomanizationVariants } from "@/electron/handlers/japaneseRomanizationTokenVariants";
  export { applyCommonReadingAlternatives } from "@/electron/handlers/japaneseRomanizationStringVariants";
  export { isClearlyDerivativeMangaCorrespondenceTitle } from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";
  export { stripMangaCorrespondenceTrailingKnownAuthor } from "@/renderer/backgroundSearch/mangaCorrespondenceSourceAnalysis";
  export { buildMangaCorrespondenceTitleInput } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceTitleInput";
  export { parseMangaCorrespondenceTitleInput } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceTitleInput";
  export { scoreMangaCorrespondenceRejectedCandidate } from "@/renderer/backgroundSearch/mangaCorrespondenceRejectedCandidates";
  export { buildMangaCorrespondenceContinuationInput } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceRejectedReview";
  export { getEffectiveMangaCorrespondenceMatches } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceRejectedReview";
  export { updateMangaCorrespondenceRejectedReview } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceRejectedReview";
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
  doesCorrespondenceAnalyzedTitleMatchKnownTitle,
  extractCorrespondenceBareHashChapter,
  partitionCorrespondenceAlternativeTitles,
  selectCorrespondenceDiscoverableTitles,
  extractTitleSequenceMarkers,
  analyzeMangaCorrespondenceTitle,
  inferMangaCorrespondenceFirstChapter,
  resolveMangaCorrespondenceMatchChapter,
  compareMangaCorrespondenceChapters,
  describeMangaCorrespondenceChapter,
  doMangaCorrespondenceChaptersOverlap,
  formatMangaCorrespondenceChapterLabel,
  filterIncludedMangaCorrespondenceChapters,
  toggleMangaCorrespondenceChapterExclusion,
  mergeMultiSearchResults,
  selectMangaCorrespondenceRomanizedSearchTerms,
  getMangaTitleAlternatives,
  getMangaTitleMergeMatchKind,
  getTokenBasedRomanizationVariants,
  applyCommonReadingAlternatives,
  isClearlyDerivativeMangaCorrespondenceTitle,
  stripMangaCorrespondenceTrailingKnownAuthor,
  buildMangaCorrespondenceTitleInput,
  parseMangaCorrespondenceTitleInput,
  scoreMangaCorrespondenceRejectedCandidate,
  buildMangaCorrespondenceContinuationInput,
  getEffectiveMangaCorrespondenceMatches,
  updateMangaCorrespondenceRejectedReview,
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

test("correspondence only expands explicit or merge-backed alternative titles", () => {
  assert.deepEqual(
    selectCorrespondenceDiscoverableTitles(
      ["The Rock Cocks - Special Edition"],
      ["The Rock Cocks"],
      true,
      true,
    ),
    [],
  );
  assert.deepEqual(
    selectCorrespondenceDiscoverableTitles(
      ["Original Series", "Translated Series"],
      ["Translated Series"],
      true,
      true,
    ),
    ["Original Series"],
  );
  assert.deepEqual(
    selectCorrespondenceDiscoverableTitles(
      ["日本語の題名"],
      ["Nihongo no Daimoku"],
      false,
      true,
    ),
    ["日本語の題名"],
  );
});

test("correspondence title input exposes and separates every parsed title", () => {
  const initialTitles = [
    "Gal Yuina-chan to Ecchi",
    "Sex with the Gyaru Yuina-chan",
  ];
  const input = buildMangaCorrespondenceTitleInput(
    initialTitles[0],
    initialTitles.slice(1),
  );

  assert.equal(
    input,
    "Gal Yuina-chan to Ecchi, Sex with the Gyaru Yuina-chan",
  );
  assert.deepEqual(
    parseMangaCorrespondenceTitleInput(input, initialTitles),
    initialTitles,
  );
  assert.deepEqual(
    parseMangaCorrespondenceTitleInput("First title, Second title", initialTitles),
    ["First title", "Second title"],
  );
});

test("correspondence title input preserves a known title containing a comma", () => {
  const initialTitles = ["Kanojo, Okarishimasu", "Rent-A-Girlfriend"];
  const input = buildMangaCorrespondenceTitleInput(
    initialTitles[0],
    initialTitles.slice(1),
  );

  assert.deepEqual(
    parseMangaCorrespondenceTitleInput(input, initialTitles),
    initialTitles,
  );
  assert.deepEqual(
    parseMangaCorrespondenceTitleInput("Kanojo, Okarishimasu", initialTitles),
    ["Kanojo, Okarishimasu"],
  );
});

test("correspondence only validates titles found in parsed title fields", () => {
  assert.equal(
    doesCorrespondenceAnalyzedTitleMatchKnownTitle(
      "Isekai de Shota ni Okasareru Yatsu",
      ["Ravaged by a Shota in Another World"],
      "Isekai no Onnatachi",
    ),
    false,
  );
  assert.equal(
    doesCorrespondenceAnalyzedTitleMatchKnownTitle(
      "Isekai no Onnatachi",
      ["The Women From Another World"],
      "The Women From Another World",
    ),
    true,
  );
});

test("correspondence treats dotted initialisms as the same title", () => {
  assert.equal(
    doesCorrespondenceTitleContainKnownTitle(
      "N.I.L.F. Nerd I’d Like To Fuck – Tekuho",
      "NILF - Nerd I'd Like To Fuck",
    ),
    true,
  );
});

test("an author suffix parsed as an alternative cannot become a searched manga title", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "N.I.L.F. Nerd I’d Like To Fuck – Tekuho",
    null,
  );
  const partition = partitionCorrespondenceAlternativeTitles(
    result.alternativeTitles,
    ["Tekuho", "tekuho"],
  );

  assert.equal(result.title, "N.I.L.F. Nerd I’d Like To Fuck");
  assert.deepEqual(partition.titleAlternatives, []);
  assert.deepEqual(partition.authorAlternatives, ["Tekuho"]);
  assert.equal(
    doesCorrespondenceTitleContainKnownTitle("Jessica – Tekuho", "NILF - Nerd I'd Like To Fuck"),
    false,
  );
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

test("correspondence parsing removes parenthesized chapters and curly source suffixes", () => {
  const bilingual = analyzeMangaCorrespondenceTitle(
    "[R-man] Nandemo Iukoto o Kiite Kureru Jimi-ko-chan (1) | The Plain Girl Who Does Whatever I Tell Her (1) [English] {Doujins.com}",
    null,
  );
  const english = analyzeMangaCorrespondenceTitle(
    "The Plain Girl Who Does Whatever I Tell Her (1) [English] {Doujins.com}",
    null,
  );

  assert.equal(bilingual.title, "Nandemo Iukoto o Kiite Kureru Jimi-ko-chan");
  assert.deepEqual(bilingual.alternativeTitles, ["The Plain Girl Who Does Whatever I Tell Her"]);
  assert.deepEqual(bilingual.authors, ["R-man"]);
  assert.equal(bilingual.chapter, "1");
  assert.equal(bilingual.languageCode, "en");
  assert.deepEqual(bilingual.unmatchedParts, ["Doujins.com"]);

  assert.equal(english.title, "The Plain Girl Who Does Whatever I Tell Her");
  assert.deepEqual(english.alternativeTitles, []);
  assert.equal(english.chapter, "1");
  assert.equal(english.languageCode, "en");
  assert.deepEqual(english.unmatchedParts, ["Doujins.com"]);
});

test("correspondence parsing removes equals-delimited release suffixes", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "(C99) [Kireinabuta (Butachang)] Isekai no Onnatachi 2.0 [English] =LWB=",
    null,
  );

  assert.equal(result.title, "Isekai no Onnatachi");
  assert.deepEqual(result.authors, ["Butachang"]);
  assert.equal(result.circle, "Kireinabuta");
  assert.equal(result.chapter, "2");
  assert.equal(result.languageCode, "en");
  assert.deepEqual(result.unmatchedParts, ["LWB"]);
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

test("correspondence parsing recognizes fullwidth translated-title separators", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "[Karuwani (Rama)] Boku no Ie ga Class no Furyou Musume ni Iribitararete iru Ken. 3 ｜ 關於班上的不良少女賴在我家這檔事3 [Chinese] [Decensored]",
    null,
  );

  assert.equal(result.title, "Boku no Ie ga Class no Furyou Musume ni Iribitararete iru Ken.");
  assert.deepEqual(result.alternativeTitles, ["關於班上的不良少女賴在我家這檔事"]);
  assert.deepEqual(result.authors, ["Rama"]);
  assert.equal(result.chapter, "3");
  assert.equal(result.languageCode, "zh");
});

test("correspondence parses adjacent Japanese chapters after a nested creator prefix", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "(のり御膳（のり伍郎）)今泉ん家はどうやらギャルの溜まり場になってるらしい5",
    null,
  );

  assert.equal(result.title, "今泉ん家はどうやらギャルの溜まり場になってるらしい");
  assert.equal(result.circle, "のり御膳");
  assert.deepEqual(result.authors, ["のり伍郎"]);
  assert.equal(result.chapter, "5");
});

test("correspondence recognizes chapter ranges and normalizes wave separators", () => {
  const compiled = analyzeMangaCorrespondenceTitle(
    "Imaizumin-chi wa Douyara Gal no Tamariba ni Natteru Rashii 1-6 + Bonus",
    null,
  );
  const translatedRange = analyzeMangaCorrespondenceTitle(
    "[Nori5rou] Imaizumin-chi wa Douyara Gal no Tamariba ni Natteru Rashii 1~2 [Chinese]",
    null,
  );

  assert.equal(compiled.title, "Imaizumin-chi wa Douyara Gal no Tamariba ni Natteru Rashii");
  assert.equal(compiled.chapter, "1-6");
  assert.equal(translatedRange.chapter, "1-2");
  assert.deepEqual(
    extractTitleSequenceMarkers("Example Chapter 1～6").sequenceMarkers,
    [{ kind: "chapter", label: "Chapter", value: "1-6" }],
  );
});

test("correspondence removes generic chapter subtitles from bilingual titles", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "[Minazuki Mikka] Sex Shinai to Shinu Yamai 6 ～ Gakuen Houkai Hen～ | Fuck-or-Die 6 ~School Collapse Edition~ [English] [Chalklog]",
    null,
  );

  assert.equal(result.title, "Sex Shinai to Shinu Yamai");
  assert.deepEqual(result.alternativeTitles, ["Fuck-or-Die"]);
  assert.deepEqual(result.authors, ["Minazuki Mikka"]);
  assert.equal(result.chapter, "6");
  assert.equal(result.languageCode, "en");
});

test("correspondence parses chapters followed by an unwrapped subtitle", () => {
  const numbered = analyzeMangaCorrespondenceTitle(
    "[Hy-dou (Hyji)] Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta,,, 3 - Saikyouiku Hen",
    null,
  );
  const bare = analyzeMangaCorrespondenceTitle(
    "[Hy-dou (Hyji)] Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta,,, 5 [English]",
    null,
  );
  const bilingual = analyzeMangaCorrespondenceTitle(
    "[Hy-dou (Hyji)] Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta,,, 4 - Honshou Hen | Neighborhood Seduction White Rose - The Aunt's Secret 4 - True Nature Arc [English]",
    null,
  );
  const translated = analyzeMangaCorrespondenceTitle(
    "[Hy-dou (Hyji)] Neighborhood Seduction White Rose - The Aunt's Secret 2 - Weakness Arc [English]",
    null,
  );

  assert.equal(numbered.title, "Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta");
  assert.equal(numbered.chapter, "3");
  assert.equal(bare.title, "Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta");
  assert.equal(bare.chapter, "5");
  assert.equal(bilingual.title, "Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta");
  assert.deepEqual(
    bilingual.alternativeTitles,
    ["Neighborhood Seduction White Rose - The Aunt's Secret"],
  );
  assert.equal(bilingual.chapter, "4");
  assert.equal(translated.title, "Neighborhood Seduction White Rose - The Aunt's Secret");
  assert.equal(translated.chapter, "2");
});

test("correspondence parses numbered named releases without a separator", () => {
  const standalone = analyzeMangaCorrespondenceTitle(
    "[Hy-dou (Hyji)] Boku ga Okaa-san to Konna Koto ni Nacchau Hanashi 11 Owari Hen [Chinese]",
    null,
  );
  const wrapped = analyzeMangaCorrespondenceTitle(
    "[Hy-dou (Hyji)] Boku ga Okaa-san to Konna Koto ni Nacchau Hanashi 8 ＜Numa Hen＞",
    null,
  );
  const translated = analyzeMangaCorrespondenceTitle(
    "[Hy-dou (Hyji)] Boku ga Okaa-san to Konna Koto ni Nacchau Hanashi 11 Owari Hen | 關於我和媽媽有了不可告人的關係這件事 11 完結篇 [Chinese]",
    null,
  );

  for (const result of [standalone, translated]) {
    assert.equal(result.title, "Boku ga Okaa-san to Konna Koto ni Nacchau Hanashi");
    assert.equal(result.chapter, "11");
  }
  assert.equal(wrapped.title, "Boku ga Okaa-san to Konna Koto ni Nacchau Hanashi");
  assert.equal(wrapped.chapter, "8");
});

test("stored inferred chapters yield to improved parsing unless manually reviewed", () => {
  assert.equal(resolveMangaCorrespondenceMatchChapter("1", "11", undefined), "11");
  assert.equal(resolveMangaCorrespondenceMatchChapter(undefined, "10", undefined), "10");
  assert.equal(resolveMangaCorrespondenceMatchChapter("9", "8", undefined), "9");
  assert.equal(resolveMangaCorrespondenceMatchChapter("3", "11", undefined, true), "3");
});

test("correspondence treats an explicit main story release as chapter one", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "[Hy-dou (Hyji)] Neighborhood Seduction White Rose - The Aunt's Secret - Main Story [English][MTL]",
    null,
  );

  assert.equal(result.title, "Neighborhood Seduction White Rose - The Aunt's Secret");
  assert.equal(result.chapter, "1");
});

test("correspondence removes hyphen-wrapped subtitles without confusing chapter ranges", () => {
  const numbered = analyzeMangaCorrespondenceTitle(
    "[Example Circle (Example Author)] Example Series 3 -A Blushing Crush!?- | Translated Series 3 -My Crush Is Blushing!?- [English]",
    null,
  );
  const firstChapter = analyzeMangaCorrespondenceTitle(
    "[Example Author] Example Series -The First Encounter- [English]",
    null,
  );
  const compactRange = analyzeMangaCorrespondenceTitle("Example Series 1-6", null);
  const spacedRange = analyzeMangaCorrespondenceTitle("Example Series 1 - 6", null);

  assert.equal(numbered.title, "Example Series");
  assert.deepEqual(numbered.alternativeTitles, ["Translated Series"]);
  assert.equal(numbered.chapter, "3");
  assert.equal(firstChapter.title, "Example Series");
  assert.equal(firstChapter.chapter, undefined);
  assert.equal(inferMangaCorrespondenceFirstChapter(firstChapter, ["Example Series"]), "1");
  assert.equal(compactRange.chapter, "1-6");
  assert.equal(spacedRange.chapter, "1-6");
});

test("correspondence infers the first chapter after removing an unnumbered subtitle", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "[Example Author] Example Series ~The Beginning~ [English]",
    null,
  );

  assert.equal(result.title, "Example Series");
  assert.equal(result.chapter, undefined);
  assert.equal(inferMangaCorrespondenceFirstChapter(result, ["Example Series"]), "1");
});

test("correspondence recognizes generic sequence labels followed by subtitles", () => {
  const track = analyzeMangaCorrespondenceTitle(
    "[Brad & Leslie Brown] The Rock Cocks - Track 21: The First Sin [English] [Ongoing]",
    null,
  );
  const numberedEdition = analyzeMangaCorrespondenceTitle(
    "The Rock Cocks - 2 - Highway To Hell [French]",
    null,
  );

  assert.equal(track.title, "The Rock Cocks");
  assert.deepEqual(track.authors, ["Brad", "Leslie Brown"]);
  assert.equal(track.chapter, "21");
  assert.equal(numberedEdition.title, "The Rock Cocks");
  assert.equal(numberedEdition.chapter, "2");
});

test("correspondence keeps generic ranges and status metadata out of the series title", () => {
  const range = analyzeMangaCorrespondenceTitle(
    "[Leslie Brown] The Rock Cocks ch. 1 - 21 [Ongoing] (HQ)",
    null,
  );
  const inlineStatus = analyzeMangaCorrespondenceTitle(
    "[Leslie Brown] The Rock Cocks [Ongoing] Track 1-2 [Chinese]",
    null,
  );
  const numero = analyzeMangaCorrespondenceTitle(
    "[Leslie Brown] The Rock Cocks №1 [Russian]",
    null,
  );

  assert.equal(range.title, "The Rock Cocks");
  assert.equal(range.chapter, "1-21");
  assert.equal(inlineStatus.title, "The Rock Cocks");
  assert.equal(inlineStatus.chapter, "1-2");
  assert.equal(numero.title, "The Rock Cocks");
  assert.equal(numero.chapter, "1");
});

test("correspondence strips generic compilation descriptors from discovered titles", () => {
  const covered = analyzeMangaCorrespondenceTitle(
    "[Example Author] Example Series Soushuuhen【1〜4＋】 [Chinese]",
    null,
  );
  const unnumbered = analyzeMangaCorrespondenceTitle(
    "[Example Author] Example Series Compilation",
    null,
  );

  assert.equal(covered.title, "Example Series");
  assert.equal(covered.chapter, "Compilation 1-4");
  assert.equal(unnumbered.title, "Example Series");
  assert.equal(unnumbered.chapter, "Compilation");
});

test("correspondence removes known authors around generic title separators", () => {
  assert.equal(
    stripMangaCorrespondenceTrailingKnownAuthor(
      "The Rock Cocks 15- Leslie Brown",
      ["Leslie Brown"],
    ),
    "The Rock Cocks 15",
  );
  assert.equal(
    stripMangaCorrespondenceTrailingKnownAuthor(
      "Leslie Brown - The Rock Cocks",
      ["Leslie Brown"],
    ),
    "The Rock Cocks",
  );
});

test("correspondence keeps compilations separate from identically numbered chapters", () => {
  const numbered = analyzeMangaCorrespondenceTitle(
    "[Norigoro] Imaizumin-chi wa Douyara Gal no Tamariba ni Natteru Rashii - Soushuuhen 2 [English]",
    null,
  );
  const unnumbered = analyzeMangaCorrespondenceTitle(
    "(のり御膳（のり伍郎）)今泉ん家はどうやらギャルの溜まり場になってるらしい 総集編",
    null,
  );

  assert.equal(numbered.chapter, "Compilation 2");
  assert.equal(unnumbered.chapter, "Compilation");
});

test("correspondence gives unnumbered bonus releases their own chapter group", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "Imaizumi Brings All The Gyarus To His House Succubus OMAKE",
    null,
  );

  assert.equal(result.chapter, "Bonus");
});

test("parenthesized release metadata does not hide the preceding chapter", () => {
  const result = analyzeMangaCorrespondenceTitle(
    "[Nori5rou] Imaizumin-chi wa Douyara Gal no Tamariba ni Natteru Rashii 4 [English] (Uncensored)",
    null,
  );

  assert.equal(result.chapter, "4");
  assert.equal(result.languageCode, "en");
  assert.ok(result.suffixTags.includes("Uncensored"));
});

test("correspondence recovers a chapter glued to a known trailing author", () => {
  assert.equal(
    stripMangaCorrespondenceTrailingKnownAuthor(
      "今泉ん家はどうやらギャルの溜まり場になってるらしい 4のり伍郎",
      ["のり伍郎", "nori gorou"],
    ),
    "今泉ん家はどうやらギャルの溜まり場になってるらしい 4",
  );
});

test("correspondence rejects clearly derivative image and animation results", () => {
  [
    "[Konoha Waifus] Risa Hamazaki - Imaizumin Chi wa Douyara Gal no Tamariba ni Natteru Rashii (Patreon) [AI Generated]",
    "Jelly Ray - Reina Hamazaki (Imaizumi Brings All The Gyarus To His House) [68 images]",
    "Imaizumin Chi wa Douyara Gal no Tamariba ni Natteru Rashii (OAV 01) (Censured)",
  ].forEach((title) => {
    assert.equal(isClearlyDerivativeMangaCorrespondenceTitle(title), true, title);
  });
  assert.equal(
    isClearlyDerivativeMangaCorrespondenceTitle(
      "[Nori5rou] Imaizumin-chi wa Douyara Gal no Tamariba ni Natteru Rashii 5",
    ),
    false,
  );
});

test("chapter ranges and compilations have explicit labels and stable ordering", () => {
  assert.deepEqual(describeMangaCorrespondenceChapter("1-6"), {
    kind: "range",
    value: "1-6",
    start: 1,
    end: 6,
  });
  assert.equal(formatMangaCorrespondenceChapterLabel("1-6"), "chapitres 1 à 6");
  assert.equal(formatMangaCorrespondenceChapterLabel("Compilation 2", true), "Compilation 2");
  assert.deepEqual(
    ["Compilation 2", "1-6", "3", "1"].sort(compareMangaCorrespondenceChapters),
    ["1", "3", "1-6", "Compilation 2"],
  );
  assert.equal(doMangaCorrespondenceChaptersOverlap("5", "1-6"), true);
  assert.equal(doMangaCorrespondenceChaptersOverlap("7", "1-6"), false);
  assert.equal(doMangaCorrespondenceChaptersOverlap("2", "Compilation 2"), false);
});

test("correspondence selects a bounded pair of readable romaji title searches", () => {
  const terms = selectMangaCorrespondenceRomanizedSearchTerms([
    "imaizumin-chi wa dōyara gal no tamariba ni natteru rashii",
    "imaizumin-chi wa dōyara gyaru no tamariba ni natteru rashii",
    "imaizumin-chi wa douyara gal no tamariba ni natteru rashii",
    "imaizuminchiwadouyaragyarunotamaribaninatterurashii",
  ]);

  assert.deepEqual(terms, [
    "imaizumin-chi wa douyara gal no tamariba ni natteru rashii",
    "imaizumin-chi wa douyara gyaru no tamariba ni natteru rashii",
  ]);
});

test("advanced reference romanization matches a Japanese title to its romaji title", () => {
  assert.equal(
    getMangaTitleMergeMatchKind(
      {
        title: "今泉ん家はどうやらギャルの溜まり場になってるらしい",
        authorNames: ["のり伍郎", "nori gorou"],
        advancedRomanizedTitleVariants: [
          "imaizumin-chi wa douyara gyaru no tamariba ni natteru rashii",
        ],
      },
      {
        title: "Imaizumin Chi wa Douyara Gyaru no Tamariba ni Natteru Rashii",
        authorNames: ["Nori Gorou"],
      },
      { enableRomajiPhoneticMerge: false },
    ),
    "heavy",
  );
});

test("multi-search recognizes normalized bilingual title separators", () => {
  assert.deepEqual(
    getMangaTitleAlternatives("Titre japonais｜English title │ Titre français ー Titolo italiano"),
    ["Titre japonais", "English title", "Titre français", "Titolo italiano"],
  );
});

test("multi-search normalizes common Japanese author romanization spellings", () => {
  const canonical = {
    title: "A sufficiently distinctive manga title",
    authorNames: ["Oshima Aki"],
  };

  ["Ooshima Aki", "Ōshima Aki", "Ohshima Aki", "Aki Oshima"].forEach((authorName) => {
    assert.equal(
      getMangaTitleMergeMatchKind(
        canonical,
        {
          title: canonical.title,
          authorNames: [authorName],
        },
        { enableRomajiPhoneticMerge: false },
      ),
      "base",
      authorName,
    );
  });
  assert.equal(
    getMangaTitleMergeMatchKind(
      canonical,
      {
        title: canonical.title,
        authorNames: ["Oshima Akira"],
      },
      { enableRomajiPhoneticMerge: false },
    ),
    null,
  );
});

test("multi-search uses author-page context when card titles omit authors", () => {
  const title = "A sufficiently distinctive manga title";

  assert.equal(
    getMangaTitleMergeMatchKind(
      {
        title,
        contextualAuthorNames: ["Oshima Aki"],
      },
      {
        title,
        contextualAuthorNames: ["Ōshima Aki"],
      },
      { enableRomajiPhoneticMerge: false },
    ),
    "base",
  );
  assert.equal(
    getMangaTitleMergeMatchKind(
      {
        title,
        contextualAuthorNames: ["Oshima Aki"],
      },
      {
        title,
        contextualAuthorNames: ["Another Author"],
      },
      { enableRomajiPhoneticMerge: false },
    ),
    null,
  );
});

test("multi-search compares structured sequence and edition markers", () => {
  const options = { enableRomajiPhoneticMerge: false };
  const matchKind = (leftTitle, rightTitle) => getMangaTitleMergeMatchKind(
    { title: leftTitle },
    { title: rightTitle },
    options,
  );

  assert.equal(matchKind("Series Part 2", "Series #2"), "base");
  assert.equal(matchKind("Series Part II", "Series #2"), "base");
  assert.equal(matchKind("Series Vol. 1-2", "Series 1–2"), "base");
  assert.equal(matchKind("Series (Zenpen)", "Series (前編)"), "base");
  assert.equal(matchKind("Series Part 2", "Series Part 3"), null);
  assert.equal(matchKind("Series (Zenpen)", "Series (Kouhen)"), null);
  assert.equal(matchKind("Series (Zenpen+Kouhen)", "Series (Zenpen)"), null);
  assert.equal(matchKind("Series Part 2", "Series"), null);
  assert.equal(matchKind("Series (COMIC 2023-05)", "Series"), "base");
});

test("Japanese colloquial n-chi house suffix gets a searchable token variant", async () => {
  const kanaToRomaji = (value) => ({
    イマイズミ: "imaizumi",
    ン: "n",
    イエ: "ie",
    今泉: "imaizumi",
    ん: "n",
    家: "ie",
  })[value] ?? value;
  const variants = await getTokenBasedRomanizationVariants(
    {
      _analyzer: {
        parse: async () => [
          { surface_form: "今泉", reading: "イマイズミ" },
          { surface_form: "ん", reading: "ン" },
          { surface_form: "家", reading: "イエ" },
        ],
      },
    },
    kanaToRomaji,
    "今泉ん家",
  );

  assert.ok(variants.includes("imaizumin-chi"));
  assert.equal(
    applyCommonReadingAlternatives(
      "imaizumin-chi wa douyara gyaru no tamariba ni natteru rashii",
    ),
    "imaizumin-chi wa douyara gal no tamariba ni natteru rashii",
  );
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
  const compilation = analyzeMangaCorrespondenceTitle(
    "[Kireinabuta (Butachang)] Isekai no Onnatachi Soushuuhen II [English] [Digital]",
    null,
  );

  assert.equal(inferMangaCorrespondenceFirstChapter(plain, knownTitles), "1");
  assert.equal(inferMangaCorrespondenceFirstChapter(extra, knownTitles), undefined);
  assert.equal(inferMangaCorrespondenceFirstChapter(ongoing, knownTitles), undefined);
  assert.equal(
    inferMangaCorrespondenceFirstChapter(
      compilation,
      ["Isekai no Onnatachi Soushuuhen II"],
    ),
    undefined,
  );
});

test("invalidated correspondence chapters are omitted without mutating the search results", () => {
  const chapters = [
    { chapter: "1", title: "Chapter 1" },
    { chapter: "2", title: "Chapter 2" },
    { chapter: "3", title: "Chapter 3" },
  ];
  const initialExclusions = new Set(["2"]);
  const included = filterIncludedMangaCorrespondenceChapters(chapters, initialExclusions);
  const withChapterThreeExcluded = toggleMangaCorrespondenceChapterExclusion(
    initialExclusions,
    "3",
  );
  const withChapterTwoRestored = toggleMangaCorrespondenceChapterExclusion(
    withChapterThreeExcluded,
    "2",
  );

  assert.deepEqual(included.map((chapter) => chapter.chapter), ["1", "3"]);
  assert.deepEqual(chapters.map((chapter) => chapter.chapter), ["1", "2", "3"]);
  assert.deepEqual(Array.from(initialExclusions), ["2"]);
  assert.deepEqual(Array.from(withChapterThreeExcluded), ["2", "3"]);
  assert.deepEqual(Array.from(withChapterTwoRestored), ["3"]);
});

test("rejected correspondence scoring surfaces a partially translated title from the same author", () => {
  const scored = scoreMangaCorrespondenceRejectedCandidate({
    titleFields: [
      "Kinjo Yuuwaku white rose Oba-san no Himeta, Ero Shitagi Hen",
    ],
    candidateAuthors: ["Hyji"],
    knownTitles: ["Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta"],
    knownAuthors: ["Hyji"],
    rejectionReason: "titleMismatch",
  });

  assert.ok(scored.score >= 75, `expected a likely score, received ${scored.score}`);
  assert.ok(scored.reasons.includes("Auteur identique"));
  assert.ok(scored.reasons.some((reason) => reason.includes("traduit")));
});

test("rejected correspondence scoring keeps another work by the same author below likely", () => {
  const scored = scoreMangaCorrespondenceRejectedCandidate({
    titleFields: ["Boku ga Okaa-san to Konna Koto ni Nacchau Hanashi 11"],
    candidateAuthors: ["Hyji"],
    knownTitles: ["Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta"],
    knownAuthors: ["Hyji"],
    rejectionReason: "titleMismatch",
  });

  assert.ok(scored.score < 75, `expected a non-likely score, received ${scored.score}`);
});

test("accepted rejected candidates join the effective results with the reviewed chapter", () => {
  const source = buildMergeSource(
    "Kinjo Yuuwaku white rose Oba-san no Himeta, Ero Shitagi Hen",
    "en",
    "https://example.test/rejected",
    "https://example.test/rejected.jpg",
  );
  const initial = {
    request: "otherChapters",
    matches: [],
    rejectedCandidates: [{
      key: "rejected-1",
      source,
      analyzedTitle: source.result.title,
      alternativeTitles: [],
      authors: ["Hyji"],
      suggestedChapter: "1",
      chapterConfidence: "low",
      rejectionReason: "titleMismatch",
      score: 84,
      scoreReasons: ["Auteur identique"],
      discoveredByStepIds: ["step-1"],
      decision: "pending",
      useAsSearchSeed: true,
    }],
    rejectedCandidateCount: 1,
    passNumber: 1,
    trace: [],
    searchedTitles: [],
    searchedAuthors: [],
  };
  const reviewed = updateMangaCorrespondenceRejectedReview(initial, {
    candidateKeys: ["rejected-1"],
    decision: "accepted",
    chapter: "3",
    useAsSearchSeed: true,
  });
  const matches = getEffectiveMangaCorrespondenceMatches(reviewed, "Reference");

  assert.equal(matches.length, 1);
  assert.equal(matches[0].chapter, "3");
  assert.equal(matches[0].acceptedManually, true);
  assert.equal(reviewed.rejectedCandidates[0].decision, "accepted");
});

test("a continuation increments the pass without mutating the original input", () => {
  const input = { reference: { title: "Reference" } };
  const result = {
    passNumber: 2,
    rejectedCandidates: [
      { key: "new", decision: "accepted", useAsSearchSeed: true },
      { key: "used", decision: "accepted", useAsSearchSeed: true, searchSeedUsedInPass: 2 },
      { key: "display-only", decision: "accepted", useAsSearchSeed: false },
    ],
  };
  const continuation = buildMangaCorrespondenceContinuationInput(input, result);

  assert.equal(continuation.continuation.passNumber, 3);
  assert.deepEqual(continuation.continuation.seedCandidateKeys, ["new"]);
  assert.equal(input.continuation, undefined);
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

test("a bilingual source consolidates pre-existing monolingual groups", () => {
  const englishTitle = "How I Ended Up With an Older Sister 2";
  const japaneseTitle = "Totsuzen Dekita Ane to no Hanashi 2";
  const english = buildMergeSource(
    englishTitle,
    "en",
    "https://example.test/english",
    "https://example.test/english.jpg",
  );
  const japanese = buildMergeSource(
    japaneseTitle,
    "ja",
    "https://example.test/japanese",
    "https://example.test/japanese.jpg",
  );
  const bilingual = buildMergeSource(
    `${japaneseTitle}｜${englishTitle}`,
    "en",
    "https://example.test/bilingual",
    "https://example.test/bilingual.jpg",
  );
  const merged = mergeMultiSearchResults([english, japanese, bilingual], {
    enableRomajiPhoneticMerge: false,
    preferredTitleLanguageCodes: ["en", "ja"],
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].sources.length, 3);
});
