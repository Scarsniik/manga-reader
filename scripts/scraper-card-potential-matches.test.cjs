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
  export {
    getScraperBookmarkKey,
  } from "@/renderer/stores/scraperBookmarks";
  export {
    buildQuickReviewPotentialMatchInputs,
  } from "@/renderer/components/QuickReview/quickReviewPotentialMatches";
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
  getScraperBookmarkKey,
  buildQuickReviewPotentialMatchInputs,
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

test("bookmark identity ignores a trailing slash on the same source URL", () => {
  assert.equal(
    getScraperBookmarkKey(
      "593d981d-c15b-4c15-b8d1-f5eb533097f7",
      "https://hentaihere.com/m/S71527/",
    ),
    getScraperBookmarkKey(
      "593d981d-c15b-4c15-b8d1-f5eb533097f7",
      "https://hentaihere.com/m/S71527",
    ),
  );
});

test("quick review preloads potential matches with the configured upcoming cards", () => {
  const scraper = { id: "scraper" };
  const buildItem = (id) => ({
    id,
    primarySource: {
      scraper,
      result: {
        title: `Listing ${id}`,
        detailUrl: `https://example.test/${id}`,
        authorNames: [`Listing author ${id}`],
      },
    },
    availableSources: [],
  });
  const items = ["first", "current", "next", "later"].map(buildItem);
  const detailsByItemId = new Map([
    ["next", {
      title: "Detailed next title",
      requestedUrl: "https://example.test/next/requested",
      finalUrl: "https://example.test/next/final",
      authors: ["Detailed author"],
    }],
  ]);

  const inputs = buildQuickReviewPotentialMatchInputs({
    currentIndex: 1,
    detailsByItemId,
    items,
    prefetchCount: 1,
  });

  assert.deepEqual(inputs.map((input) => input.key), ["current", "next"]);
  assert.match(inputs[1].title, /^Detailed next title/);
  assert.equal(inputs[1].sourceUrl, "https://example.test/next/final");
  assert.ok(inputs[1].authorNames.includes("Detailed author"));
});

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
  scraperId: overrides.scraperId || "other-scraper",
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
  chapterLabel: overrides.chapterLabel,
  readingStatus: overrides.readingStatus,
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

test("an alternate title from another scraper is recognized as an existing bookmark", () => {
  const hentaiHereInput = {
    key: "hentaihere-stepmother",
    scraperId: "hentaihere",
    title: "If A Stepmother And Her Stepson Lived Together, It Would Be Something Like This!",
    sourceUrl: "https://hentaihere.test/manga/stepmother",
    authorNames: ["Shimipan"],
  };
  const nhentaiBookmark = candidate({
    id: "nhentai-stepmother-bookmark",
    category: "bookmark",
    scraperId: "nhentai",
    sourceUrl: "https://nhentai.test/g/633575/",
    title: "[Pentacle (Shimipan)] Giri no Oyako ga Doukyou Shitereba Kitto kou | If a stepmother and her stepson lived together, it would be something like this. [English] [WaterKujo]",
    authorNames: ["Shimipan"],
  });
  const matches = matchScraperCardPotentialMatchInput(
    hentaiHereInput,
    buildScraperPotentialMatchable(hentaiHereInput),
    [],
    [nhentaiBookmark],
    [],
    options,
  );

  assert.deepEqual(
    matches.bookmarkMatches.map((match) => match.id),
    ["nhentai-stepmother-bookmark"],
  );
});

test("a completed chapter range matches a chapter contained in that range", () => {
  const chapterInput = {
    ...currentInput,
    title: "Shared Series Chapter 3",
  };
  const chapter = buildScraperPotentialMatchable(chapterInput);
  const matches = matchScraperCardPotentialMatchInput(
    chapterInput,
    chapter,
    [candidate({
      id: "read-range",
      category: "reading",
      title: "Shared Series Chapter 1-8",
      sourceUrl: "https://read.test/range",
      readingStatus: "read",
    })],
    [],
    [],
    options,
  );

  assert.deepEqual(matches.readingMatches.map((match) => match.id), ["read-range"]);
  assert.equal(matches.seriesReadingWarning, null);

  const nextChapterInput = {
    ...chapterInput,
    title: "Shared Series Chapter 9",
  };
  const nextChapterMatches = matchScraperCardPotentialMatchInput(
    nextChapterInput,
    buildScraperPotentialMatchable(nextChapterInput),
    [candidate({
      id: "read-range",
      category: "reading",
      title: "Shared Series Chapter 1-8",
      sourceUrl: "https://read.test/range",
      readingStatus: "read",
    })],
    [],
    [],
    options,
  );

  assert.equal(nextChapterMatches.seriesProgress.previousSequenceLabel, "chapitre 8");
});

test("correspondence title analysis powers series checks for noisy scraper titles", () => {
  const yunaTitle = [
    "[Yuna] Asa Okitara Imouto ga Hadaka Apron Sugata datta node Hamete Mita",
    "| I Woke Up to my Naked Apron Sister and Tried Fucking Her Ch. 12",
    "[English] [1 2 Translations]",
  ].join(" ");
  const yunaRangeTitle = yunaTitle.replace("Ch. 12", "Ch. 1-18");
  const yunaInput = {
    ...currentInput,
    title: yunaTitle,
    authorNames: ["Yuna"],
  };
  const yunaMatches = matchScraperCardPotentialMatchInput(
    yunaInput,
    buildScraperPotentialMatchable(yunaInput),
    [],
    [candidate({
      id: "yuna-range",
      category: "bookmark",
      title: yunaRangeTitle,
      authorNames: ["Yuna"],
      sourceUrl: "https://bookmark.test/yuna-range",
    })],
    [],
    options,
  );

  assert.deepEqual(yunaMatches.bookmarkMatches.map((match) => match.id), ["yuna-range"]);
  assert.equal(yunaMatches.seriesReadingWarning.sequenceLabel, "chapitre 12");

  const noisySeriesTitles = [
    {
      title: "(C104) [M-ya (Mikoyan)] Ogre tai Dark Elf III | Ogre Vs Dark Elf 3 [English]",
      sequenceLabel: "chapitre 3",
    },
    {
      title: "[DISTANCE] Joshi Luck! ~2 Years Later~ Ch. 6 (COMIC ExE 09) [English] [cedr777] [Digital]",
      sequenceLabel: "chapitre 6",
    },
  ];

  noisySeriesTitles.forEach(({ title, sequenceLabel }) => {
    const input = { ...currentInput, title, authorNames: [] };
    const matches = matchScraperCardPotentialMatchInput(
      input,
      buildScraperPotentialMatchable(input),
      [],
      [],
      [],
      options,
    );

    assert.equal(matches.seriesReadingWarning.sequenceLabel, sequenceLabel);
  });
});

test("series warning requires a completed current or earlier chapter", () => {
  const chapterInput = {
    ...currentInput,
    title: "Shared Series Chapter 3",
  };
  const chapter = buildScraperPotentialMatchable(chapterInput);
  const incompletePreviousChapter = candidate({
    id: "chapter-2-in-progress",
    category: "reading",
    title: "Shared Series Chapter 2",
    sourceUrl: "https://read.test/chapter-2",
    readingStatus: "inProgress",
  });
  const warningMatches = matchScraperCardPotentialMatchInput(
    chapterInput,
    chapter,
    [incompletePreviousChapter],
    [],
    [],
    options,
  );

  assert.deepEqual(warningMatches.seriesReadingWarning, {
    sequenceLabel: "chapitre 3",
    seriesTitle: "Shared Series",
  });
  assert.deepEqual(warningMatches.seriesProgress, {
    currentSequenceLabel: "chapitre 3",
    previousSequenceLabel: "chapitre 2",
    readingStatus: "inProgress",
    seriesTitle: "Shared Series",
  });

  const completedPreviousChapter = {
    ...incompletePreviousChapter,
    id: "chapter-2-read",
    readingStatus: "read",
  };
  const completedMatches = matchScraperCardPotentialMatchInput(
    chapterInput,
    chapter,
    [completedPreviousChapter],
    [],
    [],
    options,
  );

  assert.equal(completedMatches.seriesReadingWarning, null);
  assert.deepEqual(completedMatches.seriesProgress, {
    currentSequenceLabel: "chapitre 3",
    previousSequenceLabel: "chapitre 2",
    readingStatus: "read",
    seriesTitle: "Shared Series",
  });
});

test("named chapters do not trigger global series alerts", () => {
  const namedChapterInput = {
    ...currentInput,
    title: "[Ailail (Ail)] Boku ni SeFri ga Dekita Riyuu ~Beit Saki no JK Hen~ [English]",
    authorNames: ["Ail"],
  };
  const matches = matchScraperCardPotentialMatchInput(
    namedChapterInput,
    buildScraperPotentialMatchable(namedChapterInput),
    [candidate({
      id: "boku-chapter-2",
      category: "reading",
      title: "[Ailail (Ail)] Boku ni SeFri ga Dekita Riyuu Ch. 2 [English]",
      authorNames: ["Ail"],
      sourceUrl: "https://read.test/boku-chapter-2",
      readingStatus: "read",
    })],
    [],
    [],
    options,
  );

  assert.equal(matches.seriesReadingWarning, null);
  assert.equal(matches.seriesProgress, null);
  assert.deepEqual(matches.readingMatches, []);
});

test("series warning reads chapter labels stored separately from scraper titles", () => {
  const chapterInput = {
    ...currentInput,
    title: "Shared Series Chapter 3",
  };
  const matches = matchScraperCardPotentialMatchInput(
    chapterInput,
    buildScraperPotentialMatchable(chapterInput),
    [candidate({
      id: "separate-chapter-label",
      category: "reading",
      title: "Shared Series",
      chapterLabel: "Chapter 2",
      sourceUrl: "https://read.test/series",
      readingStatus: "read",
    })],
    [],
    [],
    options,
  );

  assert.equal(matches.seriesReadingWarning, null);
  assert.equal(matches.seriesProgress.previousSequenceLabel, "chapitre 2");
});

test("series comparison honors configured source title parsers", () => {
  const config = {
    enabled: true,
    manualTestTitles: [],
    suffixMappings: [],
    variants: [{
      id: "custom-series",
      name: "Custom series",
      enabled: true,
      blocks: [
        {
          id: "series",
          kind: "bracket",
          enabled: true,
          optional: false,
          field: "title",
          validation: "none",
          onValidationFailure: "rejectVariant",
        },
        {
          id: "extra",
          kind: "title",
          enabled: true,
          optional: false,
          field: "extra",
          validation: "none",
          onValidationFailure: "rejectVariant",
        },
        {
          id: "sequence",
          kind: "suffixes",
          enabled: true,
          optional: false,
          validation: "none",
          onValidationFailure: "rejectVariant",
        },
      ],
    }],
  };
  const chapterInput = {
    ...currentInput,
    title: "[Custom Series] Alice [Chapter 3]",
  };
  const matches = matchScraperCardPotentialMatchInput(
    chapterInput,
    buildScraperPotentialMatchable(chapterInput),
    [candidate({
      id: "configured-chapter-2",
      category: "reading",
      title: "[Custom Series] Bob [Chapter 2]",
      sourceUrl: "https://read.test/configured-chapter-2",
      readingStatus: "read",
    })],
    [],
    [],
    options,
    new Map([
      ["current-scraper", config],
      ["other-scraper", config],
    ]),
  );

  assert.equal(matches.seriesReadingWarning, null);
  assert.equal(matches.seriesProgress.seriesTitle, "Custom Series");
  assert.equal(matches.seriesProgress.previousSequenceLabel, "chapitre 2");
});

test("chapter one does not trigger a missing previous reading warning", () => {
  const chapterInput = {
    ...currentInput,
    title: "Shared Series Chapter 1",
  };
  const matches = matchScraperCardPotentialMatchInput(
    chapterInput,
    buildScraperPotentialMatchable(chapterInput),
    [],
    [],
    [],
    options,
  );

  assert.equal(matches.seriesReadingWarning, null);
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
