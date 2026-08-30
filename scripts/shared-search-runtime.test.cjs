const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");
const { parseHTML } = require("linkedom");

const source = `
  export {
    appendUniqueItemsByIdentity,
    buildScraperSearchResultIdentity,
    filterNewItemsByIdentity,
  } from "@/renderer/utils/scraperSearchResultIdentity";
  export {
    createScraperCardDetailsCache,
    fetchResolvedScraperListingPage,
    resolveScraperCardDetails,
    createScraperCardMetadataRequirements,
    doesScraperCardNeedMetadata,
  } from "@/renderer/utils/scraperRuntime";
  export {
    buildSearchCheckpointFingerprint,
    createSearchExecutionContext,
  } from "@/renderer/searchEngines/searchExecutionContext";
  export {
    hasScraperSourceDetection,
    isScraperResultOriginal,
  } from "@/shared/scraper";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "shared-search-runtime-test.ts" },
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
  appendUniqueItemsByIdentity,
  buildScraperSearchResultIdentity,
  createScraperCardDetailsCache,
  fetchResolvedScraperListingPage,
  filterNewItemsByIdentity,
  resolveScraperCardDetails,
  createScraperCardMetadataRequirements,
  doesScraperCardNeedMetadata,
  createSearchExecutionContext,
  buildSearchCheckpointFingerprint,
  hasScraperSourceDetection,
  isScraperResultOriginal,
} = bundledModule.exports;

global.DOMParser = class DOMParser {
  parseFromString(html) {
    return parseHTML(html).document;
  }
};
global.window = {
  setTimeout,
  api: {},
};

const scraper = {
  id: "source-a",
  name: "Source A",
  baseUrl: "https://example.test/",
  features: [],
};

test("shared identities normalize URLs and preserve URL-less cards when requested", () => {
  const first = { detailUrl: "https://example.test/manga/1", title: "One" };
  const duplicate = { detailUrl: "https://example.test/manga/1", title: "Other title" };
  const withoutUrl = { title: "No URL" };
  const identity = (item) => buildScraperSearchResultIdentity("source-a", item, "none");

  assert.deepEqual(filterNewItemsByIdentity([first], [duplicate, withoutUrl], identity), [withoutUrl]);
  assert.deepEqual(appendUniqueItemsByIdentity([first], [duplicate, withoutUrl], identity), [first, withoutUrl]);
  assert.equal(
    buildScraperSearchResultIdentity("source-a", withoutUrl, "title"),
    "title:source-a:no url",
  );
});

test("one search execution merges identical document requests", async () => {
  let requestCount = 0;
  window.api.fetchScraperDocument = async (request) => {
    requestCount += 1;
    return { ok: true, requestedUrl: request.targetUrl, html: "<main />" };
  };
  const context = createSearchExecutionContext({ kind: "test" });
  const request = { scraperId: "source-a", baseUrl: "https://example.test", targetUrl: "/same" };
  const [first, second] = await Promise.all([
    context.fetchDocument(request),
    context.fetchDocument(request),
  ]);

  assert.equal(requestCount, 1);
  assert.equal(first, second);
});

test("metadata requirements only request fields missing from the card", () => {
  const requirements = createScraperCardMetadataRequirements(["authors", "authorUrls"]);
  assert.equal(doesScraperCardNeedMetadata({ title: "One", authorNames: ["A"], authorUrls: ["/a"] }, requirements), false);
  assert.equal(doesScraperCardNeedMetadata({ title: "One", authorNames: ["A"] }, requirements), true);
  assert.equal(doesScraperCardNeedMetadata({ title: "One", detailsMetadataFetched: true }, requirements), false);
});

test("checkpoint fingerprints are stable by value and change with scraper revisions", () => {
  const first = buildSearchCheckpointFingerprint("multiSearch", {
    query: "manga",
    scrapers: [{ id: "a", updatedAt: "one" }],
  });
  const reordered = buildSearchCheckpointFingerprint("multiSearch", {
    scrapers: [{ updatedAt: "one", id: "a" }],
    query: "manga",
  });
  const changed = buildSearchCheckpointFingerprint("multiSearch", {
    query: "manga",
    scrapers: [{ id: "a", updatedAt: "two" }],
  });

  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test("the common listing loader fetches, parses and returns cards", async () => {
  const requests = [];
  window.api.fetchScraperDocument = async (request) => {
    requests.push(request);
    return {
      ok: true,
      requestedUrl: request.targetUrl,
      finalUrl: request.targetUrl,
      html: '<main><article><a class="title" href="/manga/1">Manga 1</a><a class="source" href="/source/original">Original</a></article></main>',
    };
  };
  const page = await fetchResolvedScraperListingPage({
    scraper,
    config: {
      resultListSelector: "main",
      resultItemSelector: "article",
      titleSelector: { kind: "css", value: ".title" },
      detailUrlSelector: { kind: "css", value: ".title@href" },
      sourceUrlSelector: { kind: "css", value: ".source@href" },
      languageDetection: { detectFromTitle: false },
    },
    targetUrl: "https://example.test/search?q=manga",
    pageIndex: 0,
    usesTemplatePaging: false,
    responseLabel: "La recherche",
    failureMessage: "Impossible de charger la recherche.",
  });

  assert.equal(requests.length, 1);
  assert.equal(page.requestedPageUrl, "https://example.test/search?q=manga");
  assert.equal(page.items[0].title, "Manga 1");
  assert.equal(page.items[0].detailUrl, "https://example.test/manga/1");
  assert.deepEqual(page.items[0].sourceNames, ["Original"]);
  assert.deepEqual(page.items[0].sourceUrls, ["https://example.test/source/original"]);
});

test("original-work detection follows the configured source keyword and keeps safe fallbacks", () => {
  assert.equal(hasScraperSourceDetection(scraper), false);
  assert.equal(isScraperResultOriginal(scraper, { sourceNames: ["Another work"] }), true);

  const scraperWithSourceDetection = {
    ...scraper,
    globalConfig: { originalSourceKeyword: "Original" },
    features: [{
      kind: "search",
      status: "configured",
      config: { sourceUrlSelector: { kind: "css", value: ".source@href" } },
    }],
  };
  assert.equal(hasScraperSourceDetection(scraperWithSourceDetection), true);
  assert.equal(isScraperResultOriginal(scraperWithSourceDetection, { sourceNames: ["Original work"] }), true);
  assert.equal(isScraperResultOriginal(scraperWithSourceDetection, { sourceNames: ["One Piece"] }), false);
  assert.equal(isScraperResultOriginal(scraperWithSourceDetection, {}), true);

  const scraperWithoutOriginalKeyword = {
    ...scraperWithSourceDetection,
    globalConfig: {},
  };
  assert.equal(isScraperResultOriginal(scraperWithoutOriginalKeyword, {}), true);
  assert.equal(isScraperResultOriginal(scraperWithoutOriginalKeyword, { sourceNames: ["One Piece"] }), false);
  assert.equal(isScraperResultOriginal(scraperWithoutOriginalKeyword, { sourceUrls: ["https://example.test/parody/one-piece"] }), false);
});

test("detail metadata is shared in-flight and does not validate cover images", async () => {
  let requestCount = 0;
  const requestShapes = [];
  const fetchDocument = async (request) => {
    requestCount += 1;
    requestShapes.push(request);
    await Promise.resolve();
    return {
      ok: true,
      requestedUrl: request.targetUrl,
      finalUrl: request.targetUrl,
      html: `
        <h1 class="title">Manga 1</h1>
        <a class="author" href="/artist/a">Author A</a>
        <a class="source" href="/source/original">Original</a>
        <img class="cover" src="/cover.jpg">
      `,
    };
  };
  const detailsConfig = {
    urlTemplate: "{{url}}",
    titleSelector: { kind: "css", value: ".title" },
    authorsSelector: { kind: "css", value: ".author" },
    authorUrlSelector: { kind: "css", value: ".author@href" },
    sourcesSelector: { kind: "css", value: ".source" },
    sourceUrlSelector: { kind: "css", value: ".source@href" },
    coverSelector: { kind: "css", value: ".cover@src" },
    languageDetection: { detectFromTitle: false },
    derivedValues: [],
  };
  const cache = createScraperCardDetailsCache();
  const [first, second] = await Promise.all([
    resolveScraperCardDetails({ scraper, detailsConfig, detailUrl: "/manga/1", fetchDocument, detailsCache: cache }),
    resolveScraperCardDetails({ scraper, detailsConfig, detailUrl: "/manga/1", fetchDocument, detailsCache: cache }),
  ]);

  assert.equal(requestCount, 1);
  assert.equal(requestShapes[0].validateImage, undefined);
  assert.equal(first.title, "Manga 1");
  assert.deepEqual(first.authorUrls, ["https://example.test/artist/a"]);
  assert.deepEqual(first.sources, ["Original"]);
  assert.deepEqual(first.sourceUrls, ["https://example.test/source/original"]);
  assert.deepEqual(second, first);
});
