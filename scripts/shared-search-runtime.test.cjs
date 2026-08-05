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
  } from "@/renderer/utils/scraperRuntime";
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

test("the common listing loader fetches, parses and returns cards", async () => {
  const requests = [];
  window.api.fetchScraperDocument = async (request) => {
    requests.push(request);
    return {
      ok: true,
      requestedUrl: request.targetUrl,
      finalUrl: request.targetUrl,
      html: '<main><article><a class="title" href="/manga/1">Manga 1</a></article></main>',
    };
  };
  const page = await fetchResolvedScraperListingPage({
    scraper,
    config: {
      resultListSelector: "main",
      resultItemSelector: "article",
      titleSelector: { kind: "css", value: ".title" },
      detailUrlSelector: { kind: "css", value: ".title@href" },
      languageDetection: { detectFromTitle: false },
    },
    targetUrl: "https://example.test/search?q=manga",
    pageIndex: 0,
    usesTemplatePaging: false,
    responseLabel: "La recherche",
    failureMessage: "Impossible de charger la recherche.",
  });

  assert.equal(requests.length, 1);
  assert.equal(page.items[0].title, "Manga 1");
  assert.equal(page.items[0].detailUrl, "https://example.test/manga/1");
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
        <img class="cover" src="/cover.jpg">
      `,
    };
  };
  const detailsConfig = {
    urlTemplate: "{{url}}",
    titleSelector: { kind: "css", value: ".title" },
    authorsSelector: { kind: "css", value: ".author" },
    authorUrlSelector: { kind: "css", value: ".author@href" },
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
  assert.deepEqual(second, first);
});
