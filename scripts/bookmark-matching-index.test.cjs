const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export { getMangaMergeMatchKind } from "@/renderer/utils/mangaMatching/titleProfiles";
  export {
    collectIndexedMangaMatchCandidates,
    createMangaMatchCandidateIndex,
  } from "@/renderer/utils/mangaMatching/matchCandidateIndex";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "bookmark-matching-index-test.ts" },
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
  collectIndexedMangaMatchCandidates,
  createMangaMatchCandidateIndex,
  getMangaMergeMatchKind,
} = bundledModule.exports;

const OPTIONS = { enableRomajiPhoneticMerge: false };

const getPairKey = (leftIndex, rightIndex) => `${leftIndex}:${rightIndex}`;

const findExhaustiveMatches = (records) => {
  const matches = new Set();
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      if (getMangaMergeMatchKind(records[leftIndex], records[rightIndex], OPTIONS)) {
        matches.add(getPairKey(leftIndex, rightIndex));
      }
    }
  }
  return matches;
};

const findIndexedMatches = (records) => {
  const index = createMangaMatchCandidateIndex(records, OPTIONS);
  const matches = new Set();
  let comparisons = 0;

  records.forEach((record, leftIndex) => {
    collectIndexedMangaMatchCandidates(index, record).forEach((candidate) => {
      const rightIndex = index.candidateIndexes.get(candidate);
      if (rightIndex === undefined || rightIndex <= leftIndex) return;
      comparisons += 1;
      if (getMangaMergeMatchKind(record, candidate, OPTIONS)) {
        matches.add(getPairKey(leftIndex, rightIndex));
      }
    });
  });

  return { comparisons, matches };
};

test("the candidate index preserves exact, fuzzy, URL and author match decisions", () => {
  const records = [
    { title: "Shared title", sourceUrl: "https://one.test/a", authorNames: ["Author A"] },
    { title: "Shared title", sourceUrl: "https://two.test/b", authorNames: ["Author A"] },
    { title: "Shared title", sourceUrl: "https://three.test/c", authorNames: ["Author B"] },
    {
      title: "A sufficiently long manga title with five tokens",
      sourceUrl: "https://one.test/fuzzy-a",
      authorNames: ["Author C"],
    },
    {
      title: "A sufficiently long manga title with five tokenz",
      sourceUrl: "https://two.test/fuzzy-b",
      authorNames: ["Author C"],
    },
    { title: "Unrelated source title", sourceUrl: "https://shared.test/item", authorNames: [] },
    { title: "Another unrelated title", sourceUrl: "https://shared.test/item", authorNames: [] },
  ];

  const exhaustiveMatches = findExhaustiveMatches(records);
  const indexed = findIndexedMatches(records);
  assert.deepEqual(indexed.matches, exhaustiveMatches);
});

test("the candidate index avoids exhaustive comparisons for large unrelated collections", () => {
  const records = Array.from({ length: 2000 }, (_, index) => ({
    title: `Distinct title ${index.toString(36)}`,
    sourceUrl: `https://source.test/${index}`,
    authorNames: [`Author ${index}`],
  }));
  records.push({
    title: "Known duplicate",
    sourceUrl: "https://source-a.test/duplicate",
    authorNames: ["Known Author"],
  });
  records.push({
    title: "Known duplicate",
    sourceUrl: "https://source-b.test/duplicate",
    authorNames: ["Known Author"],
  });

  const indexed = findIndexedMatches(records);
  const exhaustiveComparisonCount = (records.length * (records.length - 1)) / 2;

  assert.equal(indexed.matches.size, 1);
  assert.ok(indexed.comparisons < exhaustiveComparisonCount * 0.01);
});

test("the candidate index includes chapters contained in a saved range", () => {
  const records = [
    { title: "Shared Series Chapter 1-8", authorNames: ["Known Author"] },
    { title: "Shared Series Chapter 3", authorNames: ["Known Author"] },
    { title: "Shared Series Chapter 9", authorNames: ["Known Author"] },
  ];
  const indexed = findIndexedMatches(records);

  assert.deepEqual(indexed.matches, new Set([getPairKey(0, 1)]));
  assert.equal(
    getMangaMergeMatchKind(records[0], records[1], OPTIONS),
    "base",
  );
  assert.equal(getMangaMergeMatchKind(records[0], records[2], OPTIONS), null);
});
