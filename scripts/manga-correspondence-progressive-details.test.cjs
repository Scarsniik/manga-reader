const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");
const { parseHTML } = require("linkedom");

const source = `
  export { runMangaCorrespondenceSearch } from "@/renderer/searchEngines/mangaCorrespondenceSearchEngine";
  export { runAuthorCorrespondenceSearch } from "@/renderer/searchEngines/authorCorrespondenceSearchEngine";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "manga-correspondence-progressive-details-test.ts" },
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

const { runAuthorCorrespondenceSearch, runMangaCorrespondenceSearch } = bundledModule.exports;

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
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
  globalConfig: {
    defaultTagIds: [],
    sourceLanguages: ["en"],
    contentTypes: ["Manga"],
  },
  features: [{
    kind: "search",
    label: "Search",
    description: "",
    status: "validated",
    config: {
      urlTemplate: "/search?q={{query}}&page={{page}}",
      resultItemSelector: ".card",
      titleSelector: ".title",
      detailUrlSelector: ".title@href",
    },
  }, {
    kind: "details",
    label: "Details",
    description: "",
    status: "validated",
    config: {
      urlTemplate: "{{url}}",
      titleSelector: ".details-title",
    },
  }],
};

test("manga correspondence only fetches details for matches and possible candidates", async () => {
  const detailRequests = [];
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => {
        const targetUrl = String(request.targetUrl);
        if (targetUrl.includes("/search?")) {
          return {
            ok: true,
            requestedUrl: targetUrl,
            finalUrl: targetUrl,
            html: `
              <article class="card"><a class="title" href="/details/exact">Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta 2</a></article>
              <article class="card"><a class="title" href="/details/possible">Kinjo Yuuwaku Shiro Soubi Extra</a></article>
              <article class="card"><a class="title" href="/details/distant">A Completely Unrelated Work</a></article>
            `,
          };
        }
        detailRequests.push(targetUrl);
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html: `<h1 class="details-title">Loaded ${targetUrl}</h1>`,
        };
      },
    },
  };

  const result = await runMangaCorrespondenceSearch({
    request: "otherChapters",
    strategy: "titleFirst",
    reference: {
      scraperId: scraper.id,
      sourceUrl: "https://example.test/details/reference",
      rawTitle: "Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta",
      title: "Kinjo Yuuwaku Shiro Soubi Oba-san no Himeta",
      alternativeTitles: [],
      authors: [],
      authorUrls: [],
    },
    scraperFilterValues: [],
    scrapers: [scraper],
    maxPages: 1,
    paceMode: "fast",
    scrapingConcurrency: 3,
    scrapeDetailsWithCards: true,
    enableRomajiPhoneticMerge: false,
  }, new AbortController().signal, async () => {});

  assert.deepEqual(detailRequests.sort(), [
    "https://example.test/details/exact",
    "https://example.test/details/possible",
  ]);
  assert.ok(result.matches.some((match) => match.source.result.detailUrl.endsWith("/exact")));
  assert.ok(result.rejectedCandidates.some((candidate) => (
    candidate.source.result.detailUrl.endsWith("/distant")
    && candidate.source.result.detailsMetadataFetched !== true
  )));
  assert.ok(result.trace.some((step) => step.detail?.includes("2 fiche(s) vérifiée(s)")));
});

test("a replay removes invalidated title branches and reapplies surviving manual overrides", async () => {
  const searchedUrls = [];
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => {
        const targetUrl = String(request.targetUrl);
        searchedUrls.push(targetUrl);
        const decoded = decodeURIComponent(targetUrl);
        const title = decoded.includes("Series Two") || decoded.includes("Series+Two")
          ? "Series Two 2"
          : "Series One 2";
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html: `<article class="card"><a class="title" href="/details/${title.includes("Two") ? "two" : "one"}">${title}</a></article>`,
        };
      },
    },
  };
  const input = {
    request: "otherChapters",
    strategy: "titleFirst",
    reference: {
      scraperId: scraper.id,
      sourceUrl: "https://example.test/details/reference",
      rawTitle: "Series One",
      title: "Series One",
      alternativeTitles: ["Series Two"],
      authors: [],
      authorUrls: [],
    },
    scraperFilterValues: [],
    scrapers: [scraper],
    maxPages: 1,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: false,
    enableRomajiPhoneticMerge: false,
  };
  const first = await runMangaCorrespondenceSearch(
    input,
    new AbortController().signal,
    async () => {},
  );
  assert.equal(first.matches.length, 2);
  const one = first.matches.find((match) => match.source.result.detailUrl.endsWith("/one"));
  one.chapterOverride = { value: "2.5", scope: "match", updatedAt: "2026-08-08T00:00:00.000Z" };
  const decisions = first.discoveries.map((discovery) => ({
    key: discovery.key,
    status: discovery.kind === "title" && discovery.normalizedValue === "series two"
      ? "invalidated"
      : discovery.status,
  }));
  searchedUrls.length = 0;

  const replayed = await runMangaCorrespondenceSearch(
    { ...input, replay: { revision: 1, discoveryDecisions: decisions } },
    new AbortController().signal,
    async () => {},
    first,
  );

  assert.equal(replayed.matches.length, 1);
  assert.ok(replayed.matches[0].source.result.detailUrl.endsWith("/one"));
  assert.equal(replayed.matches[0].chapterOverride.value, "2.5");
  assert.ok(replayed.searchedTitles.every((title) => title !== "Series Two"));
  assert.ok(searchedUrls.every((url) => !decodeURIComponent(url).includes("Series Two")));
});

test("author correspondence uses a reliable direct page once and reuses it as its preview", async () => {
  const authorScraper = {
    ...scraper,
    features: [...scraper.features, {
      kind: "author",
      label: "Author",
      description: "",
      status: "validated",
      config: {
        urlStrategy: "result_url",
        resultItemSelector: ".card",
        titleSelector: ".title",
        detailUrlSelector: ".title@href",
        authorNameSelector: ".author-name",
        languageDetection: { detectFromTitle: false },
      },
    }],
  };
  const requests = [];
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => {
        requests.push(request.targetUrl);
        return {
          ok: true,
          requestedUrl: request.targetUrl,
          finalUrl: request.targetUrl,
          html: `
            <h1 class="author-name">Author A</h1>
            <article class="card"><a class="title" href="/details/one">Series One</a></article>
          `,
        };
      },
    },
  };

  const result = await runAuthorCorrespondenceSearch({
    referenceName: "Author A",
    names: ["Author A"],
    referenceSources: [{
      scraperId: authorScraper.id,
      authorUrl: "https://example.test/authors/a",
      name: "Author A",
    }],
    scraperFilterValues: [],
    scrapers: [authorScraper],
    maxPages: 5,
    authorPageCount: 5,
    paceMode: "fast",
    scrapingConcurrency: 3,
    scrapeDetailsWithCards: false,
  }, new AbortController().signal, async () => {});

  assert.deepEqual(requests, ["https://example.test/authors/a"]);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].previewSources.length, 1);
  assert.deepEqual(result.matches[0].discoveryMethods, ["reference"]);
});
