const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");
const { parseHTML } = require("linkedom");

const source = `
  export { runScraperLatestSearch } from "@/renderer/searchEngines/listingSearchEngine";
  export {
    buildScraperLatestCheckpointId,
    buildScraperViewHistoryCardId,
  } from "@/shared/scraper";
  export { buildSearchResultViewHistoryIdentity } from "@/renderer/utils/scraperViewHistory";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "scraper-latest-deep-scan-test.ts" },
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
  buildScraperLatestCheckpointId,
  buildScraperViewHistoryCardId,
  buildSearchResultViewHistoryIdentity,
  runScraperLatestSearch,
} = bundledModule.exports;

global.DOMParser = class DOMParser {
  parseFromString(html) {
    return parseHTML(html).document;
  }
};

const scraper = {
  id: "source-a",
  kind: "site",
  name: "Source A",
  baseUrl: "https://example.test/",
  status: "validated",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  validation: null,
  globalConfig: {
    defaultTagIds: [],
    sourceLanguages: ["en"],
    contentTypes: ["Manga"],
    latest: { enabled: true, module: "homepage" },
  },
  features: [{
    kind: "homepage",
    label: "Homepage",
    description: "",
    status: "validated",
    validation: null,
    config: {
      urlTemplate: "/latest?page={{page}}",
      resultItemSelector: ".card",
      titleSelector: ".title",
      detailUrlSelector: ".title@href",
      languageDetection: { detectFromTitle: false },
    },
  }],
};

const buildCardHtml = (slug, title) => (
  `<article class="card"><a class="title" href="/details/${slug}">${title}</a></article>`
);

const buildHistoryId = (slug, title) => buildScraperViewHistoryCardId(
  buildSearchResultViewHistoryIdentity(scraper.id, {
    title,
    detailUrl: `https://example.test/details/${slug}`,
  }),
);

const buildCheckpoint = () => {
  const key = {
    scraperId: scraper.id,
    module: "homepage",
    query: "",
    includedLanguageCodes: [],
  };
  return {
    ...key,
    id: buildScraperLatestCheckpointId(key),
    scraperUpdatedAt: scraper.updatedAt,
    pageIndex: 9,
    cursorVersion: 2,
    nextPageIndex: 10,
    currentPageUrl: "https://example.test/latest?page=10",
    nextPageUrl: "https://example.test/latest?page=11",
    anchorCardId: null,
    anchorIdentity: null,
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
};

const buildInput = (resultLimit) => ({
  sources: [{
    id: `scraper:${scraper.id}`,
    name: scraper.name,
    scraper,
    query: "",
    mode: "homepage",
  }],
  maxPages: 50,
  resultLimit,
  tagResultLimit: resultLimit,
  resultLimitMode: "perSource",
  paceMode: "fast",
  concurrency: 1,
  includedLanguageCodes: [],
  scrapeDetailsWithCards: false,
  searchMode: "deep",
  quickConsecutiveSeenStopThreshold: 2,
  languageRejectLimit: 60,
  performanceReportsEnabled: false,
});

const runDeepScan = async ({
  resultLimit,
  pages,
  historyIds = [],
  checkpoint = buildCheckpoint(),
  initialRuns,
  mode = "foreground",
}) => {
  const requestedPages = [];
  global.window = {
    setTimeout,
    api: {
      getScraperViewHistory: async () => historyIds.map((id) => ({ id })),
      getScraperLatestCheckpoints: async () => checkpoint ? [checkpoint] : [],
      saveScraperLatestCheckpoint: async (request) => {
        if (checkpoint && request.pageIndex < checkpoint.pageIndex) return checkpoint;
        return {
          ...request,
          id: checkpoint?.id ?? buildScraperLatestCheckpointId(request),
          query: request.query ?? "",
          includedLanguageCodes: request.includedLanguageCodes ?? [],
          updatedAt: "2026-08-20T00:00:00.000Z",
        };
      },
      fetchScraperDocument: async (request) => {
        const targetUrl = String(request.targetUrl);
        const pageNumber = Number(new URL(targetUrl).searchParams.get("page"));
        requestedPages.push(pageNumber);
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html: pages.get(pageNumber) ?? "",
        };
      },
    },
  };

  const result = await runScraperLatestSearch(
    buildInput(resultLimit),
    new AbortController().signal,
    async () => {},
    { mode, initialRuns },
  );
  return { requestedPages, run: result.runs[0] };
};

for (const mode of ["foreground", "background"]) {
  test(`deep ${mode} scans recent pages before resuming its checkpoint`, async () => {
    const knownHistoryId = buildHistoryId("known", "Known card");
    const { requestedPages, run } = await runDeepScan({
      mode,
      resultLimit: 2,
      historyIds: [knownHistoryId],
      pages: new Map([
        [1, buildCardHtml("recent", "Recent card")],
        [2, buildCardHtml("known", "Known card")],
        [11, buildCardHtml("deep", "Deep card")],
      ]),
    });

    assert.deepEqual(requestedPages, [1, 2, 11]);
    assert.deepEqual(run.results.map((source) => source.result.title), ["Recent card", "Deep card"]);
    assert.equal(run.checkpointUsed, true);
    assert.equal(run.deepScanPhaseStarted, true);
  });
}

test("deep scans do not resume the checkpoint when recent results fill the quota", async () => {
  const { requestedPages, run } = await runDeepScan({
    resultLimit: 1,
    pages: new Map([
      [1, buildCardHtml("recent", "Recent card")],
      [11, buildCardHtml("deep", "Deep card")],
    ]),
  });

  assert.deepEqual(requestedPages, [1]);
  assert.deepEqual(run.results.map((source) => source.result.title), ["Recent card"]);
  assert.equal(run.checkpointUsed, false);
  assert.equal(run.deepScanPhaseStarted, false);
});

test("deep scans defer the checkpoint when a boundary page completes the quota", async () => {
  const knownCards = [
    ["known-a", "Known card A"],
    ["known-b", "Known card B"],
    ["known-c", "Known card C"],
  ];
  const checkpoint = buildCheckpoint();
  const { requestedPages, run } = await runDeepScan({
    resultLimit: 2,
    historyIds: knownCards.map(([slug, title]) => buildHistoryId(slug, title)),
    checkpoint,
    pages: new Map([
      [1, buildCardHtml("recent-a", "Recent card A")],
      [2, [
        buildCardHtml("recent-b", "Recent card B"),
        ...knownCards.map(([slug, title]) => buildCardHtml(slug, title)),
      ].join("")],
      [11, buildCardHtml("deep", "Deep card")],
    ]),
  });

  assert.deepEqual(requestedPages, [1, 2]);
  assert.deepEqual(run.results.map((source) => source.result.title), ["Recent card A", "Recent card B"]);
  assert.equal(run.checkpointUsed, false);
  assert.equal(run.deepScanPhaseStarted, true);
  assert.equal(run.deepScanCheckpointPending, true);

  const continuation = await runDeepScan({
    resultLimit: 1,
    checkpoint,
    initialRuns: [{
      ...run,
      status: "waiting",
      results: [],
      checkedPages: 0,
      checkpointUsed: false,
    }],
    pages: new Map([
      [11, buildCardHtml("deep", "Deep card")],
    ]),
  });

  assert.deepEqual(continuation.requestedPages, [11]);
  assert.deepEqual(continuation.run.results.map((source) => source.result.title), ["Deep card"]);
  assert.equal(continuation.run.checkpointUsed, true);
  assert.equal(continuation.run.deepScanCheckpointPending, false);
});

test("deep scans continue normal pagination after the recent phase when no checkpoint exists", async () => {
  const knownHistoryId = buildHistoryId("known", "Known card");
  const { requestedPages, run } = await runDeepScan({
    resultLimit: 1,
    historyIds: [knownHistoryId],
    checkpoint: null,
    pages: new Map([
      [1, buildCardHtml("known", "Known card")],
      [2, buildCardHtml("deep", "Deep card")],
    ]),
  });

  assert.deepEqual(requestedPages, [1, 2]);
  assert.deepEqual(run.results.map((source) => source.result.title), ["Deep card"]);
  assert.equal(run.checkpointUsed, false);
  assert.equal(run.deepScanPhaseStarted, true);
});
