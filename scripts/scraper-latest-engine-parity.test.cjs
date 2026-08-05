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
  const backgroundSource = fs.readFileSync(
    path.resolve("src/renderer/backgroundSearch/backgroundSearchEngine.ts"),
    "utf8",
  );

  assert.match(foregroundSource, /runScraperLatestSearch\s*\(/);
  assert.match(backgroundSource, /return runScraperLatestSearch\(input, signal, onSnapshot/);
  assert.equal((foregroundSource.match(/fetchHomepagePageWithRetry/g) ?? []).length, 0);
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
  const backgroundSource = fs.readFileSync(
    path.resolve("src/renderer/backgroundSearch/backgroundSearchEngine.ts"),
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
  assert.match(foregroundMultiSearch, /executeMultiSearchTermPage\s*\(/);
  assert.match(backgroundSource, /executeMultiSearchTermPage\s*\(/);
  assert.match(backgroundSource, /processScraperListingPage\s*\(/);
  assert.match(authorFavorites, /processScraperListingPage\s*\(/);
  assert.match(tagFavorites, /processScraperListingPage\s*\(/);
  assert.match(authorExtraction, /resolveScraperCardDetails\s*\(/);
  assert.doesNotMatch(authorExtraction, /extractScraperDetailsFromDocumentWithImageFallbacks/);
  assert.match(workspaceAuthor, /fetchResolvedScraperListingPage\s*\(/);
  assert.match(workspaceTag, /fetchResolvedScraperListingPage\s*\(/);
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
