const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export { doesCorrespondenceTitleContainKnownTitle } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
  export { extractCorrespondenceBareHashChapter } from "@/renderer/backgroundSearch/mangaCorrespondenceMatching";
  export { extractTitleSequenceMarkers } from "@/renderer/utils/scraperTitleAnalysis/sequence";
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
