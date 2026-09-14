const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");
const { parseHTML } = require("linkedom");

const source = `
  export { extractScraperSearchPageFromDocumentWithImageFallbacks } from "@/renderer/utils/scraperRuntime/searchExtraction";
  export {
    buildScraperLatestCursorCheckpointRequest,
    resolveScraperLatestCheckpointCursor,
  } from "@/renderer/utils/scraperLatestCheckpoints";
  export { shouldGenerateScraperLatestPerformanceReport } from "@/renderer/utils/scraperLatestDiagnostics";
  export { resolveScraperLatestSourcePageLimit } from "@/renderer/backgroundSearch/backgroundListingExecution";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "scraper-latest-engine-parity-test.ts" },
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
  buildScraperLatestCursorCheckpointRequest,
  extractScraperSearchPageFromDocumentWithImageFallbacks,
  resolveScraperLatestCheckpointCursor,
  resolveScraperLatestSourcePageLimit,
  shouldGenerateScraperLatestPerformanceReport,
} = bundledModule.exports;

test("foreground and background latest searches call the same engine", () => {
  const foregroundSource = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperLatest/useScraperLatestRuns.ts"),
    "utf8",
  );
  const listingEngine = fs.readFileSync(
    path.resolve("src/renderer/searchEngines/listingSearchEngine.ts"),
    "utf8",
  );
  const engineRegistry = fs.readFileSync(
    path.resolve("src/renderer/searchEngines/searchEngineRegistry.ts"),
    "utf8",
  );
  const executionWorker = fs.readFileSync(
    path.resolve("src/electron/workers/searchExecutionWorker.ts"),
    "utf8",
  );
  assert.match(foregroundSource, /runForegroundListingSearchWorker\s*\(/);
  assert.match(executionWorker, /runScraperLatestSearch\s*\(/);
  assert.match(engineRegistry, /return runScraperLatestSearch\(input, signal, onSnapshot/);
  assert.match(listingEngine, /export const runScraperLatestSearch/);
  assert.equal((foregroundSource.match(/fetchHomepagePageWithRetry/g) ?? []).length, 0);
});

test("every search with foreground and background execution calls one canonical engine", () => {
  const sources = {
    registry: fs.readFileSync(path.resolve("src/renderer/searchEngines/searchEngineRegistry.ts"), "utf8"),
    multi: fs.readFileSync(path.resolve("src/renderer/components/MultiSearch/useMultiSearch.ts"), "utf8"),
    browser: fs.readFileSync(path.resolve("src/renderer/components/ScraperBrowser/hooks/useScraperBrowserSearch.ts"), "utf8"),
    authors: fs.readFileSync(path.resolve("src/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns.ts"), "utf8"),
    worker: fs.readFileSync(path.resolve("src/electron/workers/searchExecutionWorker.ts"), "utf8"),
  };

  assert.match(sources.multi, /runForegroundMultiSearchWorker\s*\(/);
  assert.match(sources.worker, /runMultiSearchEngine\s*\(/);
  assert.match(sources.registry, /multiSearch:\s*\(\) => runMultiSearchEngine\s*\(/);
  assert.match(sources.browser, /runForegroundListingSearchWorker\s*\(/);
  assert.match(sources.worker, /runScraperAuthorSearchEngine\s*\(/);
  assert.match(sources.registry, /scraperAuthor:\s*\(\) => runScraperAuthorSearchEngine\s*\(/);
  assert.match(sources.authors, /runForegroundListingSearchWorker/);
  assert.match(sources.worker, /runLatestAuthorsSearchEngine/);
  assert.match(sources.registry, /latestAuthors:\s*\(\) => runLatestAuthorsSearchEngine\s*\(/);
  assert.match(sources.worker, /runAuthorFavoriteRefreshSearchEngine/);
  assert.match(sources.registry, /authorFavoriteRefresh:\s*\(\) => runAuthorFavoriteRefreshSearchEngine\s*\(/);
});

test("foreground and background launches build the same canonical inputs", () => {
  const latestView = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperLatest/ScraperLatestView.tsx"),
    "utf8",
  );
  const latestHook = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperLatest/useScraperLatestRuns.ts"),
    "utf8",
  );
  const authorHook = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns.ts"),
    "utf8",
  );
  const authorFavoritesView = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperAuthorFavorites/ScraperAuthorFavoritesView.tsx"),
    "utf8",
  );
  const browser = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperBrowser/ScraperBrowser.tsx"),
    "utf8",
  );
  const browserHook = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperBrowser/hooks/useScraperBrowserSearch.ts"),
    "utf8",
  );

  for (const source of [latestView, latestHook]) {
    assert.match(source, /buildLatestSourceListingSources\s*\(/);
    assert.match(source, /buildLatestSourceSearchInput\s*\(/);
  }
  assert.match(latestView, /buildAuthorListingSearchInput\s*\(/);
  assert.match(authorHook, /buildAuthorListingSearchInput\s*\(/);
  assert.match(authorFavoritesView, /buildAuthorListingSearchInput\s*\(/);
  assert.match(browser, /buildScraperAuthorListingSearchInput\s*\(/);
  assert.match(browserHook, /buildScraperAuthorListingSearchInput\s*\(/);
});

test("foreground and background searches keep the shared runtime boundaries", () => {
  const browserSource = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperBrowser/hooks/useScraperBrowserSearch.ts"),
    "utf8",
  );
  const foregroundMultiSearch = fs.readFileSync(
    path.resolve("src/renderer/components/MultiSearch/useMultiSearch.ts"),
    "utf8",
  );
  const executionWorker = fs.readFileSync(
    path.resolve("src/electron/workers/searchExecutionWorker.ts"),
    "utf8",
  );
  const engineRegistry = fs.readFileSync(
    path.resolve("src/renderer/searchEngines/searchEngineRegistry.ts"),
    "utf8",
  );
  const multiEngine = fs.readFileSync(
    path.resolve("src/renderer/searchEngines/multiSearchEngine.ts"),
    "utf8",
  );
  const listingEngine = fs.readFileSync(
    path.resolve("src/renderer/searchEngines/listingSearchEngine.ts"),
    "utf8",
  );
  const authorFavorites = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns.ts"),
    "utf8",
  );
  const tagFavorites = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperTagFavorites/useTagFavoriteRuns.ts"),
    "utf8",
  );
  const authorExtraction = fs.readFileSync(
    path.resolve("src/renderer/components/MultiSearch/multiSearchAuthors.ts"),
    "utf8",
  );
  const workspaceAuthor = fs.readFileSync(
    path.resolve("src/renderer/components/Workspace/WorkspaceScraperAuthorPanel.tsx"),
    "utf8",
  );
  const workspaceTag = fs.readFileSync(
    path.resolve("src/renderer/components/Workspace/WorkspaceScraperTagPanel.tsx"),
    "utf8",
  );

  assert.match(browserSource, /fetchResolvedScraperListingPage\s*\(/);
  assert.match(foregroundMultiSearch, /runForegroundMultiSearchWorker\s*\(/);
  assert.match(executionWorker, /runMultiSearchEngine\s*\(/);
  assert.doesNotMatch(foregroundMultiSearch, /executeMultiSearchTermPage\s*\(/);
  assert.match(multiEngine, /executeMultiSearchTermPage\s*\(/);
  assert.match(listingEngine, /processScraperListingPage\s*\(/);
  assert.doesNotMatch(authorFavorites, /processScraperListingPage\s*\(/);
  assert.match(tagFavorites, /runForegroundListingSearchWorker\s*\(/);
  assert.match(executionWorker, /runTagFavoriteSearchEngine\s*\(/);
  assert.match(authorExtraction, /resolveScraperCardDetails\s*\(/);
  assert.doesNotMatch(authorExtraction, /extractScraperDetailsFromDocumentWithImageFallbacks/);
  assert.match(workspaceAuthor, /fetchResolvedScraperListingPage\s*\(/);
  assert.match(workspaceTag, /fetchResolvedScraperListingPage\s*\(/);
});

test("heavy search orchestration stays in backend workers", () => {
  const rendererSources = [
    "src/renderer/backgroundSearch/BackgroundSearchRunner.tsx",
    "src/renderer/components/MultiSearch/useMultiSearch.ts",
    "src/renderer/components/ScraperLatest/useScraperLatestRuns.ts",
    "src/renderer/components/ScraperAuthorFavorites/useAuthorFavoriteRuns.ts",
    "src/renderer/components/ScraperTagFavorites/useTagFavoriteRuns.ts",
  ].map((filePath) => fs.readFileSync(path.resolve(filePath), "utf8"));
  const executionWorker = fs.readFileSync(
    path.resolve("src/electron/workers/searchExecutionWorker.ts"),
    "utf8",
  );
  const searchWorkerHandler = fs.readFileSync(
    path.resolve("src/electron/handlers/searchWorker.ts"),
    "utf8",
  );
  const mergeWorker = fs.readFileSync(
    path.resolve("src/electron/workers/multiSearchMergeWorker.ts"),
    "utf8",
  );
  const potentialMatchWorker = fs.readFileSync(
    path.resolve("src/electron/workers/potentialMatchWorker.ts"),
    "utf8",
  );
  const listingPageExecution = fs.readFileSync(
    path.resolve("src/renderer/utils/scraperRuntime/listingPageExecution.ts"),
    "utf8",
  );
  const adaptiveListProcessing = fs.readFileSync(
    path.resolve("src/renderer/components/MultiSearch/useAdaptiveMultiSearchListProcessing.ts"),
    "utf8",
  );
  const listProcessing = fs.readFileSync(
    path.resolve("src/renderer/components/MultiSearch/multiSearchListProcessing.ts"),
    "utf8",
  );
  const mergeWorkerHandler = fs.readFileSync(
    path.resolve("src/electron/handlers/multiSearchMergeWorker.ts"),
    "utf8",
  );
  const authorCombinedResults = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperAuthorFavorites/ScraperAuthorCombinedResults.tsx"),
    "utf8",
  );
  const authorSeriesCoverages = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperAuthorFavorites/useAuthorSeriesChapterCoverages.ts"),
    "utf8",
  );
  const visualFingerprints = fs.readFileSync(
    path.resolve("src/renderer/hooks/useVisualImageFingerprints.ts"),
    "utf8",
  );
  const potentialMatches = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches.ts"),
    "utf8",
  );
  const quickReviewDetails = fs.readFileSync(
    path.resolve("src/renderer/components/QuickReview/useQuickReviewDetails.ts"),
    "utf8",
  );

  rendererSources.forEach((sourceText) => {
    assert.doesNotMatch(sourceText, /from ["']@\/renderer\/searchEngines\/(?:multiSearchEngine|listingSearchEngine|searchEngineRegistry)/);
  });
  assert.match(executionWorker, /executeBackgroundSearch\s*\(/);
  assert.match(executionWorker, /runForegroundListingSearch/);
  assert.match(executionWorker, /runVisualFingerprinting/);
  assert.match(executionWorker, /property === "runSearchListingPageWorker"/);
  assert.match(searchWorkerHandler, /case "getScraperLatestCheckpoints"/);
  assert.match(searchWorkerHandler, /case "saveScraperLatestCheckpoint"/);
  assert.match(mergeWorker, /mergeMultiSearchSourceIntoState\s*\(/);
  assert.match(mergeWorker, /mergeMultiSearchResultsByVisualFingerprint\s*\(/);
  assert.match(mergeWorker, /processMultiSearchLists\s*\(/);
  assert.match(adaptiveListProcessing, /LIST_WORKER_RESULT_THRESHOLD = 400/);
  assert.match(adaptiveListProcessing, /const stableRuns = runs\.length \? runs : EMPTY_MULTI_SEARCH_RUNS/);
  assert.match(adaptiveListProcessing, /runMultiSearchListWorker/);
  assert.match(listProcessing, /filterMultiSearchMergedResultsByLanguage\s*\(/);
  assert.match(listProcessing, /sortByScraperViewHistoryNewState\s*\(/);
  assert.match(listProcessing, /filterBlacklistedMultiSearchResults\s*\(/);
  assert.match(mergeWorkerHandler, /getMergeWorker\("merge"\)/);
  assert.match(mergeWorkerHandler, /getMergeWorker\("visual"\)/);
  assert.match(mergeWorkerHandler, /getMergeWorker\("list"\)/);
  assert.match(authorCombinedResults, /AUTHOR_SERIES_DEEP_ANALYSIS_LIMIT = 300/);
  assert.match(authorSeriesCoverages, /\(\) => !disposed/);
  assert.match(visualFingerprints, /cancelSearchWorker\?\.\(executionId\)/);
  assert.match(potentialMatchWorker, /processPotentialMatchRequest/);
  assert.match(potentialMatches, /runPotentialMatchWorker/);
  assert.match(quickReviewDetails, /scheduleQuickReviewIdleTask/);
  assert.match(quickReviewDetails, /QUICK_REVIEW_IMAGE_PRELOAD_CONCURRENCY = 2/);
  assert.match(quickReviewDetails, /preloadController\.abort\(\)/);
  assert.match(listingPageExecution, /runSearchListingPageWorker/);
});

test("the search worker exposes the DOM constructors required by scraper extraction", () => {
  const executionWorker = fs.readFileSync(
    path.resolve("src/electron/workers/searchExecutionWorker.ts"),
    "utf8",
  );

  assert.match(executionWorker, /const \{ DOMParser, Document, Element \} = require\("linkedom"\)/);
  assert.match(executionWorker, /workerGlobal\.DOMParser = DOMParser/);
  assert.match(executionWorker, /workerGlobal\.Document = Document/);
  assert.match(executionWorker, /workerGlobal\.Element = Element/);
});

test("all paginated engines share execution context preloading, diagnostics and checkpoint fingerprints", () => {
  const registry = fs.readFileSync(path.resolve("src/renderer/searchEngines/searchEngineRegistry.ts"), "utf8");
  const listing = fs.readFileSync(path.resolve("src/renderer/searchEngines/listingSearchEngine.ts"), "utf8");
  const multi = fs.readFileSync(path.resolve("src/renderer/searchEngines/multiSearchEngine.ts"), "utf8");
  const manga = fs.readFileSync(path.resolve("src/renderer/searchEngines/mangaCorrespondenceSearchEngine.ts"), "utf8");
  const author = fs.readFileSync(path.resolve("src/renderer/searchEngines/authorCorrespondenceSearchEngine.ts"), "utf8");
  const settings = fs.readFileSync(path.resolve("src/renderer/components/Modal/modales/SettingsModalContent.tsx"), "utf8");

  assert.match(registry, /createSearchExecutionContext\s*\(/);
  assert.match(registry, /expectedExecutionFingerprint/);
  assert.match(registry, /scraperPerformanceReportsEnabled/);
  for (const engine of [listing, multi, manga, author]) {
    assert.match(engine, /getPagePrefetchCache/);
    assert.match(engine, /executionContext\.fetchDocument/);
  }
  assert.match(manga, /runAuthorCorrespondenceSearch\([\s\S]*executionContext/);
  assert.match(settings, /scraperPerformanceReportsEnabled/);
});

test("manga correspondence prefilters cards before shared detail enrichment", () => {
  const engine = fs.readFileSync(
    path.resolve("src/renderer/searchEngines/mangaCorrespondenceSearchEngine.ts"),
    "utf8",
  );
  const listingLoaders = engine.slice(
    engine.indexOf("const loadSearch = async"),
    engine.indexOf("await emit();", engine.indexOf("const loadSearch = async")),
  );

  assert.match(engine, /shouldFetchMangaCorrespondenceCandidateDetails\s*\(/);
  assert.match(engine, /enrichScraperListingSourcesWithCardDetails\s*\(/);
  assert.ok((engine.match(/scrapeDetailsWithCards:\s*false/g) ?? []).length >= 3);
  assert.doesNotMatch(listingLoaders, /scrapeDetailsWithCards:\s*input\.scrapeDetailsWithCards/);
});

test("latest listing thumbnails keep fallbacks without validating images during scraping", async () => {
  const { document } = parseHTML(`
    <section class="results">
      <article class="card">
        <a class="title" href="/gallery/1">Gallery 1</a>
        <img class="thumb" data-images='["/missing.jpg", "/cover.jpg"]'>
      </article>
    </section>
  `);
  let imageValidationRequestCount = 0;
  const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(
    document,
    {
      resultListSelector: ".results",
      resultItemSelector: ".card",
      titleSelector: { kind: "css", value: ".title" },
      detailUrlSelector: { kind: "css", value: ".title@href" },
      thumbnailSelector: { kind: "css", value: ".thumb@data-images" },
      languageDetection: { detectFromTitle: false },
    },
    { requestedUrl: "https://example.test/latest" },
    async () => {
      imageValidationRequestCount += 1;
      return { ok: false, requestedUrl: "" };
    },
  );

  assert.equal(imageValidationRequestCount, 0);
  assert.equal(page.items[0].thumbnailUrl, "https://example.test/missing.jpg");
  assert.deepEqual(page.items[0].thumbnailCandidates, [
    "https://example.test/missing.jpg",
    "https://example.test/cover.jpg",
  ]);
});

test("listing extraction rejects cards missing their configured details link", async () => {
  const { document } = parseHTML(`
    <section class="results">
      <article class="card">
        <div class="title">Popular gallery without a details link</div>
        <img class="thumb" src="/popular.jpg">
      </article>
      <article class="card">
        <a class="details" href="/gallery/2">
          <span class="title">Real author result</span>
        </a>
        <img class="thumb" src="/real.jpg">
      </article>
    </section>
  `);
  const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(
    document,
    {
      resultListSelector: ".results",
      resultItemSelector: ".card",
      titleSelector: { kind: "css", value: ".title" },
      detailUrlSelector: { kind: "css", value: ".details@href" },
      thumbnailSelector: { kind: "css", value: ".thumb@src" },
      languageDetection: { detectFromTitle: false },
    },
    { requestedUrl: "https://example.test/author/example" },
  );

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].title, "Real author result");
  assert.equal(page.items[0].detailUrl, "https://example.test/gallery/2");
});

test("image fallback selectors keep the current image source first", async () => {
  const { document } = parseHTML(`
    <section class="results">
      <article class="card">
        <a class="title" href="/gallery/1">Gallery 1</a>
        <img
          class="thumb"
          src="/cover.webp"
          data-images='["/missing.jpg", "/fallback.webp"]'
        >
      </article>
    </section>
  `);
  const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(
    document,
    {
      resultListSelector: ".results",
      resultItemSelector: ".card",
      titleSelector: { kind: "css", value: ".title" },
      detailUrlSelector: { kind: "css", value: ".title@href" },
      thumbnailSelector: { kind: "css", value: ".thumb@data-images" },
      languageDetection: { detectFromTitle: false },
    },
    { requestedUrl: "https://example.test/latest" },
  );

  assert.equal(page.items[0].thumbnailUrl, "https://example.test/cover.webp");
  assert.deepEqual(page.items[0].thumbnailCandidates, [
    "https://example.test/cover.webp",
    "https://example.test/missing.jpg",
    "https://example.test/fallback.webp",
  ]);
});

test("image fallback selectors ignore lazy-loading data placeholders", async () => {
  const { document } = parseHTML(`
    <section class="results">
      <article class="card">
        <a class="title" href="/gallery/1">Gallery 1</a>
        <img
          class="thumb"
          src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E"
          data-src="https://cdn.example.test/cover.jpg"
        >
      </article>
    </section>
  `);
  const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(
    document,
    {
      resultListSelector: ".results",
      resultItemSelector: ".card",
      titleSelector: { kind: "css", value: ".title" },
      detailUrlSelector: { kind: "css", value: ".title@href" },
      thumbnailSelector: { kind: "css", value: ".thumb@data-src" },
      languageDetection: { detectFromTitle: false },
    },
    { requestedUrl: "https://example.test/latest" },
  );

  assert.equal(page.items[0].thumbnailUrl, "https://cdn.example.test/cover.jpg");
  assert.equal(page.items[0].thumbnailCandidates, undefined);
});

test("exact checkpoints resume at the next fully unprocessed page", () => {
  const checkpoint = {
    id: "checkpoint",
    scraperId: "source-a",
    module: "homepage",
    query: "",
    includedLanguageCodes: [],
    pageIndex: 7,
    cursorVersion: 2,
    nextPageIndex: 8,
    currentPageUrl: "https://example.test/page/8",
    nextPageUrl: "https://example.test/page/9",
    updatedAt: new Date(0).toISOString(),
  };
  assert.deepEqual(resolveScraperLatestCheckpointCursor(checkpoint), {
    loadedPages: 8,
    currentPageUrl: "https://example.test/page/8",
    nextPageUrl: "https://example.test/page/9",
  });
});

test("legacy anchor checkpoints replay their page for backward compatibility", () => {
  const checkpoint = {
    id: "legacy",
    scraperId: "source-a",
    module: "homepage",
    query: "",
    includedLanguageCodes: [],
    pageIndex: 7,
    currentPageUrl: "https://example.test/page/8",
    anchorCardId: "card",
    anchorIdentity: { scraperId: "source-a", sourceUrl: "https://example.test/gallery/1" },
    updatedAt: new Date(0).toISOString(),
  };
  assert.deepEqual(resolveScraperLatestCheckpointCursor(checkpoint), {
    loadedPages: 7,
    currentPageUrl: "https://example.test/page/8",
    nextPageUrl: "https://example.test/page/8",
  });
});

test("cursor checkpoint requests do not depend on finding an accepted card", () => {
  const request = buildScraperLatestCursorCheckpointRequest({
    scraper: { id: "source-a", updatedAt: "2026-08-05T00:00:00.000Z" },
    module: "tag",
    query: "https://example.test/tag/glasses",
    includedLanguageCodes: ["en"],
    pageIndex: 3,
    page: {
      currentPageUrl: "https://example.test/tag/glasses?page=4",
      nextPageUrl: "https://example.test/tag/glasses?page=5",
      items: [],
    },
  });

  assert.equal(request.cursorVersion, 2);
  assert.equal(request.nextPageIndex, 4);
  assert.equal(request.anchorIdentity, null);
});

test("deep scans use a 50-page default safety cap", () => {
  assert.equal(resolveScraperLatestSourcePageLimit(null), 50);
  assert.equal(resolveScraperLatestSourcePageLimit(12), 12);
  assert.equal(resolveScraperLatestSourcePageLimit(0), 1);
});

test("performance reports require an explicit developer opt-in", () => {
  assert.equal(shouldGenerateScraperLatestPerformanceReport(true), true);
  assert.equal(shouldGenerateScraperLatestPerformanceReport(false), false);
  assert.equal(shouldGenerateScraperLatestPerformanceReport(undefined), false);
});
