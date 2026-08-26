const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    buildScraperCardPotentialMatchInput,
    buildScraperPotentialMatchable,
    getScraperCardPotentialMatchInputSignature,
    matchScraperCardPotentialMatchInput,
    retainScraperCardPotentialMatches,
  } from "@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches";
  export {
    buildScraperDetailsPotentialMatchInput,
  } from "@/renderer/components/ScraperBrowser/hooks/useScraperPotentialMangaMatches";
  export {
    getPotentialMatchReadHistoryRevision,
    shouldReloadPotentialMatchCandidatesForHistoryUpdate,
  } from "@/renderer/components/ScraperBrowser/hooks/usePotentialMangaMatchCandidates";
  export {
    buildPotentialMatchEntries,
  } from "@/renderer/components/ScraperBrowser/utils/potentialMatchDisplay";
  export {
    mergeScraperCardWithDetails,
  } from "@/renderer/utils/scraperRuntime/cardDetailsEnrichment";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "scraper-card-potential-matches-test.ts" },
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
  buildScraperCardPotentialMatchInput,
  buildScraperDetailsPotentialMatchInput,
  buildScraperPotentialMatchable,
  getScraperCardPotentialMatchInputSignature,
  getPotentialMatchReadHistoryRevision,
  shouldReloadPotentialMatchCandidatesForHistoryUpdate,
  matchScraperCardPotentialMatchInput,
  retainScraperCardPotentialMatches,
  buildPotentialMatchEntries,
  mergeScraperCardWithDetails,
} = bundledModule.exports;
const options = { enableRomajiPhoneticMerge: false };
const currentInput = {
  key: "current",
  scraperId: "current-scraper",
  title: "A Shared Manga Title",
  sourceUrl: "https://current.test/manga",
  authorNames: ["Known Author"],
};
const current = {
  title: currentInput.title,
  sourceUrl: currentInput.sourceUrl,
  authorNames: currentInput.authorNames,
};

test("card cache fingerprints ignore presentation-only rerenders and input ordering", () => {
  const reorderedInput = {
    ...currentInput,
    authorNames: ["Second Author", "Known Author"],
    sourceIdentities: [
      { scraperId: "second", sourceUrl: "https://second.test/manga/" },
      { scraperId: "current-scraper", sourceUrl: "https://current.test/manga" },
    ],
  };
  const equivalentInput = {
    ...reorderedInput,
    authorNames: [" known author ", "SECOND AUTHOR"],
    sourceIdentities: [...reorderedInput.sourceIdentities].reverse(),
  };

  assert.equal(
    getScraperCardPotentialMatchInputSignature(reorderedInput),
    getScraperCardPotentialMatchInputSignature(equivalentInput),
  );
  assert.notEqual(
    getScraperCardPotentialMatchInputSignature(reorderedInput),
    getScraperCardPotentialMatchInputSignature({
      ...reorderedInput,
      title: "A genuinely different title",
    }),
  );
});

test("enriched cards and details use the same canonical matching input", () => {
  const details = {
    requestedUrl: "https://source.test/redirect",
    finalUrl: "https://source.test/canonical",
    title: "Canonical Manga Title",
    authors: ["Canonical Author"],
    authorUrls: [],
    tags: [],
    tagUrls: [],
    languageCodes: [],
    derivedValues: {},
  };
  const card = mergeScraperCardWithDetails({
    title: "Noisy listing title that does not match",
    detailUrl: details.requestedUrl,
  }, details);
  const cardInput = buildScraperCardPotentialMatchInput("source", card);
  const detailsInput = buildScraperDetailsPotentialMatchInput("source", details);

  assert.equal(card.title, "Noisy listing title that does not match");
  assert.equal(card.detailsTitle, details.title);
  assert.equal(card.detailsSourceUrl, details.finalUrl);
  assert.equal(cardInput.title, detailsInput.title);
  assert.equal(cardInput.sourceUrl, detailsInput.sourceUrl);
  assert.deepEqual(cardInput.authorNames, detailsInput.authorNames);
  assert.deepEqual(
    buildScraperPotentialMatchable(cardInput),
    buildScraperPotentialMatchable(detailsInput),
  );

  const canonicalBookmark = candidate({
    id: "canonical-bookmark",
    category: "bookmark",
    scraperId: "other-source",
    sourceUrl: "https://other.test/canonical",
    title: details.title,
    authorNames: details.authors,
  });
  const cardMatches = matchScraperCardPotentialMatchInput(
    cardInput,
    buildScraperPotentialMatchable(cardInput),
    [],
    [canonicalBookmark],
    [],
    options,
  );

  assert.deepEqual(cardMatches.bookmarkMatches.map((match) => match.id), ["canonical-bookmark"]);
});

test("seen-only card history does not invalidate potential-reading candidates", () => {
  const readRecord = {
    id: "read-card",
    scraperId: "scraper",
    sourceUrl: "https://example.test/read",
    firstSeenAt: "2026-08-11T10:00:00.000Z",
    readAt: "2026-08-11T10:01:00.000Z",
  };
  const initialRevision = getPotentialMatchReadHistoryRevision([readRecord]);
  const seenOnlyRevision = getPotentialMatchReadHistoryRevision([
    {
      id: "seen-card",
      scraperId: "scraper",
      sourceUrl: "https://example.test/seen",
      firstSeenAt: "2026-08-11T10:02:00.000Z",
    },
    readRecord,
  ]);

  assert.equal(seenOnlyRevision, initialRevision);
  assert.notEqual(
    getPotentialMatchReadHistoryRevision([{ ...readRecord, readAt: null }]),
    initialRevision,
  );
});

test("details and search history writes do not invalidate card matching", () => {
  assert.equal(shouldReloadPotentialMatchCandidatesForHistoryUpdate({ kind: "details" }), false);
  assert.equal(shouldReloadPotentialMatchCandidatesForHistoryUpdate({ kind: "search" }), false);
  assert.equal(shouldReloadPotentialMatchCandidatesForHistoryUpdate({ kind: "reading" }), true);
  assert.equal(shouldReloadPotentialMatchCandidatesForHistoryUpdate(undefined), true);
});

const candidate = (overrides) => ({
  id: overrides.id,
  category: overrides.category,
  title: overrides.title || current.title,
  sourceUrl: overrides.sourceUrl,
  authorNames: overrides.authorNames || current.authorNames,
  sourceLabel: "Test source",
  detailLabel: "Test",
  target: {
    kind: "scraperDetails",
    scraperId: overrides.scraperId || "other-scraper",
    sourceUrl: overrides.sourceUrl,
    title: overrides.title || current.title,
  },
});

test("card matching reports bookmarks, reading records and reading lists", () => {
  const matches = matchScraperCardPotentialMatchInput(
    currentInput,
    current,
    [candidate({ id: "read", category: "reading", sourceUrl: "https://read.test/manga" })],
    [candidate({ id: "bookmark", category: "bookmark", sourceUrl: "https://bookmark.test/manga" })],
    [candidate({ id: "list", category: "readingList", sourceUrl: "https://list.test/manga" })],
    options,
  );

  assert.equal(matches.readingMatches.length, 1);
  assert.equal(matches.bookmarkMatches.length, 1);
  assert.equal(matches.readingListMatches.length, 1);
  assert.equal(matches.bookmarkMatches[0].matchKind, "base");
});

test("card matching hides the current exact reading and bookmark source", () => {
  const exactReading = candidate({
    id: "exact-read",
    category: "reading",
    scraperId: currentInput.scraperId,
    sourceUrl: currentInput.sourceUrl,
  });
  const exactBookmark = candidate({
    id: "exact-bookmark",
    category: "bookmark",
    scraperId: currentInput.scraperId,
    sourceUrl: currentInput.sourceUrl,
  });
  const exactList = candidate({
    id: "exact-list",
    category: "readingList",
    scraperId: currentInput.scraperId,
    sourceUrl: currentInput.sourceUrl,
  });

  const matches = matchScraperCardPotentialMatchInput(
    currentInput,
    current,
    [exactReading],
    [exactBookmark],
    [exactList],
    options,
  );

  assert.equal(matches.readingMatches.length, 0);
  assert.equal(matches.bookmarkMatches.length, 0);
  assert.equal(matches.readingListMatches.length, 1);
});

test("merged card matching hides every exact source but keeps an equivalent other source", () => {
  const mergedInput = {
    ...currentInput,
    sourceIdentities: [
      { scraperId: currentInput.scraperId, sourceUrl: currentInput.sourceUrl },
      { scraperId: "second-scraper", sourceUrl: "https://second.test/manga" },
    ],
  };
  const exactSecondSource = candidate({
    id: "exact-second-source",
    category: "bookmark",
    scraperId: "second-scraper",
    sourceUrl: "https://second.test/manga",
  });
  const equivalentOtherSource = candidate({
    id: "equivalent-other-source",
    category: "bookmark",
    scraperId: "third-scraper",
    sourceUrl: "https://third.test/manga",
  });

  const matches = matchScraperCardPotentialMatchInput(
    mergedInput,
    current,
    [],
    [exactSecondSource, equivalentOtherSource],
    [],
    options,
  );

  assert.deepEqual(matches.bookmarkMatches.map((match) => match.id), ["equivalent-other-source"]);
});

test("virtualized card recalculation retains matches for cards that remain visible", () => {
  const firstMatches = {
    readingMatches: [],
    bookmarkMatches: [candidate({
      id: "retained-bookmark",
      category: "bookmark",
      sourceUrl: "https://bookmark.test/retained",
    })],
    readingListMatches: [],
  };
  const previous = new Map([
    ["still-visible", firstMatches],
    ["outside-viewport", firstMatches],
  ]);

  const retained = retainScraperCardPotentialMatches(previous, [{
    ...currentInput,
    key: "still-visible",
  }]);

  assert.equal(retained.size, 1);
  assert.equal(retained.get("still-visible"), firstMatches);
  assert.equal(retained.has("outside-viewport"), false);
});

test("combined card display deduplicates one target and exposes all optional categories", () => {
  const sharedSourceUrl = "https://shared.test/manga";
  const bookmark = candidate({
    id: "shared-bookmark",
    category: "bookmark",
    scraperId: "shared-scraper",
    sourceUrl: sharedSourceUrl,
  });
  const readingList = candidate({
    id: "shared-list",
    category: "readingList",
    scraperId: "shared-scraper",
    sourceUrl: sharedSourceUrl,
  });

  const entries = buildPotentialMatchEntries([
    { category: "bookmark", matches: [bookmark] },
    { category: "readingList", matches: [readingList] },
  ]);

  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].categories, ["bookmark", "readingList"]);
});
