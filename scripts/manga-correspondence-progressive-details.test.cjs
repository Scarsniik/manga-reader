const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");
const { parseHTML } = require("linkedom");

const source = `
  export { runMangaCorrespondenceSearch } from "@/renderer/searchEngines/mangaCorrespondenceSearchEngine";
  export { runAuthorCorrespondenceSearch } from "@/renderer/searchEngines/authorCorrespondenceSearchEngine";
  export { runAuthorCorrespondenceWorkflow } from "@/renderer/searchEngines/authorCorrespondenceWorkflow";
  export {
    resolveAuthorCorrespondenceAdvancedBatchSize,
    selectAuthorCorrespondenceAdvancedSeeds,
  } from "@/renderer/searchEngines/authorCorrespondenceAdvancedSelection";
  export { mergeAuthorCorrespondenceSessionResults } from "@/renderer/backgroundSearch/authorCorrespondenceSessionResults";
  export { buildMultiSearchSourceIdentityKey, mergeMultiSearchResults } from "@/renderer/components/MultiSearch/multiSearchMerge";
  export { createSearchExecutionContext } from "@/renderer/searchEngines/searchExecutionContext";
  export { resolveMangaCorrespondenceManualDiscovery } from "@/renderer/backgroundSearch/mangaCorrespondenceManualDiscoveries";
  export {
    buildAuthorCorrespondenceReplayInput,
    buildInitialAuthorCorrespondenceDiscoveries,
  } from "@/renderer/backgroundSearch/authorCorrespondenceDiscoveries";
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

const {
  buildAuthorCorrespondenceReplayInput,
  buildInitialAuthorCorrespondenceDiscoveries,
  buildMultiSearchSourceIdentityKey,
  createSearchExecutionContext,
  mergeAuthorCorrespondenceSessionResults,
  mergeMultiSearchResults,
  resolveAuthorCorrespondenceAdvancedBatchSize,
  resolveMangaCorrespondenceManualDiscovery,
  runAuthorCorrespondenceSearch,
  runAuthorCorrespondenceWorkflow,
  runMangaCorrespondenceSearch,
  selectAuthorCorrespondenceAdvancedSeeds,
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

const buildCorrespondenceInput = (overrides = {}) => ({
  request: "otherChapters",
  strategy: "titleFirst",
  reference: {
    scraperId: scraper.id,
    sourceUrl: "https://example.test/details/reference",
    rawTitle: "Series One",
    title: "Series One",
    alternativeTitles: [],
    authors: [],
    authorUrls: [],
  },
  scraperFilterValues: [],
  scrapers: [scraper],
  maxPages: 6,
  paceMode: "fast",
  scrapingConcurrency: 2,
  scrapeDetailsWithCards: false,
  enableRomajiPhoneticMerge: false,
  ...overrides,
});

test("correspondence stops a paginated source after the configured unproductive streak", async () => {
  let searchRequestCount = 0;
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => {
        searchRequestCount += 1;
        const targetUrl = String(request.targetUrl);
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html: `<article class="card"><a class="title" href="/details/garbage-${searchRequestCount}">Unrelated Garbage Work ${searchRequestCount}</a></article>`,
        };
      },
    },
  };

  const result = await runMangaCorrespondenceSearch(buildCorrespondenceInput({
    safety: {
      enabled: true,
      emptyPageGuardEnabled: true,
      consecutiveUnproductivePageLimit: 2,
      unboundedPageLimitEnabled: true,
      unboundedPageLimit: 50,
      authorExpansionGuardEnabled: true,
      abnormalAuthorLimit: 12,
      autoInvalidateUnproductiveTitles: true,
      autoInvalidateMinCandidateCount: 2,
      taskExpansionGuardEnabled: true,
      maxDiscoveryTaskCount: 40,
      retainedPotentialGuardEnabled: true,
      retainedPotentialCount: 20,
    },
  }), new AbortController().signal, async () => {});

  const warning = result.warnings.find((entry) => entry.code === "unproductivePages");
  assert.ok(warning);
  assert.equal(warning.evidence.scannedCandidateCount, 2);
  assert.ok(searchRequestCount <= 3, `expected two pages plus at most one preload, got ${searchRequestCount}`);
});

test("disabling correspondence safeguards preserves the requested page depth", async () => {
  let searchRequestCount = 0;
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => {
        searchRequestCount += 1;
        const targetUrl = String(request.targetUrl);
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html: `<article class="card"><a class="title" href="/details/disabled-${searchRequestCount}">Unrelated Disabled Work ${searchRequestCount}</a></article>`,
        };
      },
    },
  };

  const result = await runMangaCorrespondenceSearch(buildCorrespondenceInput({
    maxPages: 4,
    safety: { enabled: false },
  }), new AbortController().signal, async () => {});

  assert.equal(searchRequestCount, 4);
  assert.ok(!(result.warnings ?? []).some((entry) => entry.code === "unproductivePages"));
});

test("correspondence stops an unlimited search redirected to an already visited page", async () => {
  const requestedUrls = [];
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => {
        const requestedUrl = String(request.targetUrl);
        requestedUrls.push(requestedUrl);
        const parsedUrl = new URL(requestedUrl);
        const requestedPage = Number(parsedUrl.searchParams.get("page") ?? "1");
        const returnedPage = requestedPage >= 3 ? 1 : requestedPage;
        parsedUrl.searchParams.set("page", String(returnedPage));
        return {
          ok: true,
          requestedUrl,
          finalUrl: parsedUrl.toString(),
          html: `<article class="card"><a class="title" href="/details/redirect-${returnedPage}">Unrelated Redirect Work ${returnedPage}</a></article>`,
        };
      },
    },
  };

  await runMangaCorrespondenceSearch(buildCorrespondenceInput({
    maxPages: null,
    safety: { enabled: false },
  }), new AbortController().signal, async () => {});

  assert.equal(requestedUrls.length, 3);
  assert.match(requestedUrls[2], /[?&]page=3(?:&|$)/);
});

test("an unproductive discovered title is invalidated but remains available for review", async () => {
  let garbageRequestCount = 0;
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => {
        const targetUrl = String(request.targetUrl);
        const queryValue = targetUrl.match(/[?&]q=([^&]+)/)?.[1] ?? "";
        if (/^Series(?:%20|\+)One$/i.test(queryValue)) {
          return { ok: true, requestedUrl: targetUrl, finalUrl: targetUrl, html: "<main></main>" };
        }
        garbageRequestCount += 1;
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html: `<article class="card"><a class="title" href="/details/noise-${garbageRequestCount}">Completely Different Noise ${garbageRequestCount}</a></article>`,
        };
      },
    },
  };
  const now = "2026-08-08T00:00:00.000Z";
  const referenceDiscovery = {
    key: `title:${scraper.id}:series one`,
    kind: "title",
    value: "Series One",
    normalizedValue: "series one",
    scraperId: scraper.id,
    scraperName: scraper.name,
    origin: "reference",
    sourceUrl: "https://example.test/details/reference",
    parentStepIds: [],
    evidenceCount: 1,
    status: "active",
    propagationConfidence: "reference",
    foundAt: now,
  };
  const noisyDiscovery = {
    ...referenceDiscovery,
    key: `title:${scraper.id}:garbage seed`,
    value: "Garbage Seed",
    normalizedValue: "garbage seed",
    origin: "card",
    sourceUrl: "https://example.test/details/noisy-parent",
    propagationConfidence: "directTitle",
  };
  const previousResult = {
    request: "otherChapters",
    matches: [],
    rejectedCandidates: [],
    rejectedCandidateCount: 0,
    passNumber: 1,
    trace: [],
    searchedTitles: [],
    searchedAuthors: [],
    discoveries: [referenceDiscovery, noisyDiscovery],
  };
  const safety = {
    enabled: true,
    emptyPageGuardEnabled: true,
    consecutiveUnproductivePageLimit: 2,
    unboundedPageLimitEnabled: true,
    unboundedPageLimit: 50,
    authorExpansionGuardEnabled: true,
    abnormalAuthorLimit: 12,
    autoInvalidateUnproductiveTitles: true,
    autoInvalidateMinCandidateCount: 2,
    taskExpansionGuardEnabled: true,
    maxDiscoveryTaskCount: 40,
    retainedPotentialGuardEnabled: true,
    retainedPotentialCount: 20,
  };
  const result = await runMangaCorrespondenceSearch(buildCorrespondenceInput({
    safety,
    replay: {
      revision: 1,
      discoveryDecisions: [referenceDiscovery, noisyDiscovery].map(({ key, status }) => ({ key, status })),
    },
  }), new AbortController().signal, async () => {}, previousResult);

  const invalidated = result.discoveries.find((entry) => entry.key === noisyDiscovery.key);
  assert.equal(invalidated.status, "invalidated");
  assert.equal(invalidated.automaticInvalidation.code, "unproductiveTitle");
  assert.ok(result.warnings.some((entry) => entry.code === "automaticTitleInvalidation"));
});

test("abnormal author expansion is reported and queued automatic author branches are removed", async () => {
  const authorDetailsScraper = {
    ...scraper,
    features: scraper.features.map((feature) => feature.kind === "details"
      ? {
        ...feature,
        config: {
          ...feature.config,
          authorsSelector: { kind: "css", value: ".author" },
        },
      }
      : feature),
  };
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
            html: [1, 2, 3].map((index) => (
              `<article class="card"><a class="title" href="/details/author-${index}">Series One ${index}</a></article>`
            )).join(""),
          };
        }
        const index = targetUrl.match(/author-(\d+)/)?.[1] ?? "0";
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html: `<h1 class="details-title">Series One ${index}</h1><span class="author">Author ${index}</span>`,
        };
      },
    },
  };

  const result = await runMangaCorrespondenceSearch(buildCorrespondenceInput({
    scrapers: [authorDetailsScraper],
    maxPages: 1,
    scrapeDetailsWithCards: true,
    safety: {
      enabled: true,
      emptyPageGuardEnabled: true,
      consecutiveUnproductivePageLimit: 3,
      unboundedPageLimitEnabled: true,
      unboundedPageLimit: 50,
      authorExpansionGuardEnabled: true,
      abnormalAuthorLimit: 3,
      autoInvalidateUnproductiveTitles: true,
      autoInvalidateMinCandidateCount: 40,
      taskExpansionGuardEnabled: true,
      maxDiscoveryTaskCount: 40,
      retainedPotentialGuardEnabled: true,
      retainedPotentialCount: 20,
    },
  }), new AbortController().signal, async () => {});

  const warning = result.warnings.find((entry) => entry.code === "authorExpansion");
  assert.ok(warning);
  assert.equal(warning.evidence.distinctAuthorCount, 3);
  assert.deepEqual(result.searchedAuthors, []);
});

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

test("a repeated author name only creates one discovery event per scraper", async () => {
  const authorScraper = {
    ...scraper,
    features: scraper.features.map((feature) => feature.kind === "details"
      ? {
        ...feature,
        config: {
          ...feature.config,
          authorsSelector: { kind: "css", value: ".author" },
          authorUrlSelector: { kind: "css", value: ".author" },
        },
      }
      : feature),
  };
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
              <article class="card"><a class="title" href="/details/two">Series One 2</a></article>
              <article class="card"><a class="title" href="/details/three">Series One 3</a></article>
            `,
          };
        }
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html: '<h1 class="details-title">Series One</h1><a class="author" href="/authors/yd">YD</a>',
        };
      },
    },
  };

  const result = await runMangaCorrespondenceSearch({
    request: "otherChapters",
    strategy: "titleFirst",
    reference: {
      scraperId: authorScraper.id,
      sourceUrl: "https://example.test/details/reference",
      rawTitle: "Series One",
      title: "Series One",
      alternativeTitles: [],
      authors: [],
      authorUrls: [],
    },
    scraperFilterValues: [],
    scrapers: [authorScraper],
    maxPages: 1,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: true,
    enableRomajiPhoneticMerge: false,
  }, new AbortController().signal, async () => {});

  const authorEvents = result.trace.filter((step) => (
    step.label === "Auteur correspondant trouvé" && step.term === "YD"
  ));
  assert.equal(authorEvents.length, 1);
  const authorDiscoveries = result.discoveries.filter((discovery) => (
    discovery.kind === "author"
    && discovery.scraperId === authorScraper.id
    && discovery.normalizedValue === "yd"
  ));
  assert.equal(authorDiscoveries.length, 1);
  assert.equal(authorDiscoveries[0].authorPageUrl, "https://example.test/authors/yd");
});

test("manual titles accept text and resolve compatible detail URLs before replay", async () => {
  const input = {
    request: "otherChapters",
    strategy: "titleFirst",
    reference: {
      scraperId: scraper.id,
      sourceUrl: "https://example.test/details/reference",
      rawTitle: "Series One",
      title: "Series One",
      alternativeTitles: [],
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
  const [textDiscovery] = await resolveMangaCorrespondenceManualDiscovery({
    kind: "title",
    rawValue: "Series Two",
    input,
  });
  assert.equal(textDiscovery.value, "Series Two");
  assert.equal(textDiscovery.scraperId, "manual");
  assert.equal(textDiscovery.origin, "manual");

  const detailsScraper = {
    ...scraper,
    features: scraper.features.map((feature) => feature.kind === "details"
      ? {
        ...feature,
        config: {
          ...feature.config,
          authorsSelector: { kind: "css", value: ".details-author" },
          authorUrlSelector: { kind: "css", value: ".details-author@href" },
        },
      }
      : feature),
  };
  const urlDiscoveries = await resolveMangaCorrespondenceManualDiscovery({
    kind: "title",
    rawValue: "https://example.test/details/two",
    input: { ...input, scrapers: [detailsScraper] },
    fetchDocument: async (request) => ({
      ok: true,
      requestedUrl: request.targetUrl,
      finalUrl: request.targetUrl,
      html: `
        <h1 class="details-title">Series Two 2</h1>
        <a class="details-author" href="/authors/yd">YD</a>
      `,
    }),
  });
  const urlDiscovery = urlDiscoveries.find((discovery) => discovery.kind === "title");
  const urlAuthorDiscovery = urlDiscoveries.find((discovery) => discovery.kind === "author");
  assert.equal(urlDiscovery.value, "Series Two");
  assert.equal(urlDiscovery.scraperId, scraper.id);
  assert.equal(urlDiscovery.sourceUrl, "https://example.test/details/two");
  assert.equal(urlAuthorDiscovery.value, "YD");
  assert.equal(urlAuthorDiscovery.authorPageUrl, "https://example.test/authors/yd");
  await assert.rejects(() => resolveMangaCorrespondenceManualDiscovery({
    kind: "title",
    rawValue: "https://unknown.test/details/two",
    input,
    fetchDocument: async () => {
      throw new Error("Cette URL ne doit pas être chargée.");
    },
  }), /Aucun scraper actif ne sait ouvrir cette URL de fiche/);
});

test("manual author URLs are validated and keep their direct page target", async () => {
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
      },
    }],
  };
  const input = {
    request: "otherChapters",
    strategy: "titleFirst",
    reference: {
      scraperId: authorScraper.id,
      sourceUrl: "https://example.test/details/reference",
      rawTitle: "Series One",
      title: "Series One",
      alternativeTitles: [],
      authors: [],
      authorUrls: [],
    },
    scraperFilterValues: [],
    scrapers: [authorScraper],
    maxPages: 1,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: false,
    enableRomajiPhoneticMerge: false,
  };
  const [discovery] = await resolveMangaCorrespondenceManualDiscovery({
    kind: "author",
    rawValue: "https://example.test/authors/yd",
    input,
    fetchDocument: async (request) => ({
      ok: true,
      requestedUrl: request.targetUrl,
      finalUrl: request.targetUrl,
      html: `
        <h1 class="author-name">YD</h1>
        <article class="card"><a class="title" href="/details/one">Series One</a></article>
      `,
    }),
  });

  assert.equal(discovery.value, "YD");
  assert.equal(discovery.scraperId, authorScraper.id);
  assert.equal(discovery.authorPageUrl, "https://example.test/authors/yd");
});

test("author correspondence discovers an unknown author from the same manga before searching author pages", async () => {
  const authorScraper = {
    ...scraper,
    features: [
      ...scraper.features.map((feature) => feature.kind === "details"
        ? {
          ...feature,
          config: {
            ...feature.config,
            authorsSelector: { kind: "css", value: ".details-author" },
            authorUrlSelector: { kind: "css", value: ".details-author@href" },
          },
        }
        : feature),
      {
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
        },
      },
    ],
  };
  const snapshots = [];
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => {
        const targetUrl = String(request.targetUrl);
        const decodedUrl = decodeURIComponent(targetUrl);
        const html = targetUrl.endsWith("/authors/yd")
          ? `
            <h1 class="author-name">yd</h1>
            <article class="card"><a class="title" href="/details/two">Series One</a></article>
          `
          : targetUrl.endsWith("/details/two")
            ? `
              <h1 class="details-title">Series One</h1>
              <a class="details-author" href="/authors/yd">YD</a>
            `
            : decodedUrl.includes("/search?")
              ? '<article class="card"><a class="title" href="/details/two">Series One</a></article>'
              : "<main></main>";
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html,
        };
      },
    },
  };
  const result = await runAuthorCorrespondenceWorkflow({
    referenceName: "",
    names: [],
    referenceSources: [],
    scraperFilterValues: [],
    scrapers: [authorScraper],
    maxPages: 1,
    authorPageCount: 1,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: false,
    mangaSeed: {
      reference: {
        scraperId: authorScraper.id,
        sourceUrl: "https://example.test/details/reference",
        rawTitle: "Series One",
        title: "Series One",
        alternativeTitles: [],
        authors: [],
        authorUrls: [],
      },
      enableRomajiPhoneticMerge: false,
    },
  }, new AbortController().signal, async (_partialResult, progress) => {
    snapshots.push(progress.currentLabel);
  }, createSearchExecutionContext({ kind: "authorCorrespondence", mode: "background" }));

  assert.deepEqual(result.searchedNames, ["YD"]);
  assert.equal(result.referenceName, "YD");
  assert.ok(result.matches.some((match) => match.authorUrl === "https://example.test/authors/yd"));
  assert.ok(snapshots.some((label) => label?.startsWith("Recherche du manga")));
});

test("a replay processes manually added manga and author pages as direct targets", async () => {
  const directUrl = "https://example.test/details/manual-two";
  const directAuthorUrl = "https://example.test/authors/yd";
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
      },
    }],
  };
  const requestedUrls = [];
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => {
        const targetUrl = String(request.targetUrl);
        requestedUrls.push(targetUrl);
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html: targetUrl === directUrl
            ? '<h1 class="details-title">Series Manual 2</h1>'
            : targetUrl === directAuthorUrl
              ? `
                <h1 class="author-name">yd</h1>
                <article class="card"><a class="title" href="/details/manual-two">Series Manual 2</a></article>
              `
            : "<main></main>",
        };
      },
    },
  };
  const input = {
    request: "otherChapters",
    strategy: "titleFirst",
    reference: {
      scraperId: authorScraper.id,
      sourceUrl: "https://example.test/details/reference",
      rawTitle: "Series One",
      title: "Series One",
      alternativeTitles: [],
      authors: [],
      authorUrls: [],
    },
    scraperFilterValues: [],
    scrapers: [authorScraper],
    maxPages: 1,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: false,
    enableRomajiPhoneticMerge: false,
  };
  const referenceDiscovery = {
    key: `title:${authorScraper.id}:series one`,
    kind: "title",
    value: "Series One",
    normalizedValue: "series one",
    scraperId: authorScraper.id,
    scraperName: authorScraper.name,
    origin: "reference",
    sourceUrl: input.reference.sourceUrl,
    parentStepIds: [],
    evidenceCount: 1,
    status: "active",
    propagationConfidence: "reference",
    foundAt: "2026-08-08T00:00:00.000Z",
  };
  const manualDiscovery = {
    ...referenceDiscovery,
    key: `title:${authorScraper.id}:series manual`,
    value: "Series Manual",
    normalizedValue: "series manual",
    origin: "manual",
    sourceUrl: directUrl,
    propagationConfidence: "manual",
  };
  const manualAuthorDiscovery = {
    ...referenceDiscovery,
    key: `author:${authorScraper.id}:yd`,
    kind: "author",
    value: "YD",
    normalizedValue: "yd",
    origin: "manual",
    sourceUrl: directAuthorUrl,
    authorPageUrl: directAuthorUrl,
    propagationConfidence: "manual",
  };
  const previousResult = {
    request: input.request,
    matches: [],
    rejectedCandidates: [],
    rejectedCandidateCount: 0,
    passNumber: 1,
    trace: [],
    searchedTitles: [],
    searchedAuthors: [],
    discoveries: [referenceDiscovery, manualDiscovery, manualAuthorDiscovery],
  };
  const replayed = await runMangaCorrespondenceSearch({
    ...input,
    replay: {
      revision: 1,
      discoveryDecisions: [referenceDiscovery, manualDiscovery, manualAuthorDiscovery]
        .map(({ key, status }) => ({ key, status })),
    },
  }, new AbortController().signal, async () => {}, previousResult);

  assert.ok(replayed.matches.some((match) => match.source.result.detailUrl === directUrl));
  assert.ok(requestedUrls.includes(directAuthorUrl));
  assert.deepEqual(
    replayed.trace
      .filter((step) => step.kind === "authorSearch")
      .map((step) => step.term),
    ["YD"],
  );
  assert.deepEqual(replayed.searchedAuthors, ["YD"]);
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

test("an invalidated result demotes closer sibling cards to manual potentials", async () => {
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => ({
        ok: true,
        requestedUrl: String(request.targetUrl),
        finalUrl: String(request.targetUrl),
        html: '<article class="card"><a class="title" href="/details/beta-2">Beta World 2</a></article>',
      }),
    },
  };
  const input = {
    request: "otherChapters",
    strategy: "titleFirst",
    reference: {
      scraperId: scraper.id,
      sourceUrl: "https://example.test/details/reference",
      rawTitle: "Alpha Main Story",
      title: "Alpha Main Story",
      alternativeTitles: [],
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
  const discovery = {
    key: `title:${scraper.id}:alpha main story`,
    kind: "title",
    value: "Alpha Main Story",
    normalizedValue: "alpha main story",
    scraperId: scraper.id,
    scraperName: scraper.name,
    origin: "reference",
    sourceUrl: input.reference.sourceUrl,
    parentStepIds: [],
    evidenceCount: 1,
    status: "active",
    foundAt: "2026-08-08T00:00:00.000Z",
  };
  const negativeDecision = {
    key: `${scraper.id}:https://example.test/details/beta`,
    status: "invalidated",
    title: "Beta World",
    analyzedTitle: "Beta World",
    alternativeTitles: [],
    authors: [],
    scraperId: scraper.id,
    scraperName: scraper.name,
    sourceUrl: "https://example.test/details/beta",
    origin: "match",
  };
  const replayInput = {
    ...input,
    replay: {
      revision: 1,
      discoveryDecisions: [{ key: discovery.key, status: "active" }],
      resultDecisions: [negativeDecision],
    },
  };
  const previousResult = {
    request: input.request,
    matches: [],
    rejectedCandidates: [],
    rejectedCandidateCount: 0,
    passNumber: 1,
    trace: [],
    searchedTitles: [],
    searchedAuthors: [],
    discoveries: [discovery],
    resultDecisions: [negativeDecision],
  };

  const replayed = await runMangaCorrespondenceSearch(
    replayInput,
    new AbortController().signal,
    async () => {},
    previousResult,
  );

  assert.equal(replayed.matches.length, 0);
  assert.equal(replayed.rejectedCandidates.length, 1);
  assert.equal(replayed.rejectedCandidates[0].rejectionReason, "invalidatedResult");
  assert.ok(replayed.rejectedCandidates[0].score >= 50);
  assert.ok(replayed.rejectedCandidates[0].scoreReasons.some((reason) => (
    reason.includes("Correspond davantage au résultat invalidé")
  )));
});

test("a replay does not propagate legacy titles learned through a fuzzy author branch", async () => {
  const searchedUrls = [];
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => {
        searchedUrls.push(decodeURIComponent(String(request.targetUrl)));
        return {
          ok: true,
          requestedUrl: String(request.targetUrl),
          finalUrl: String(request.targetUrl),
          html: "<main></main>",
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
      rawTitle: "Skill Kyouka Kaikin + OrangeMaru Special",
      title: "Skill Kyouka Kaikin + OrangeMaru Special",
      alternativeTitles: [],
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
  const referenceDiscovery = {
    key: `title:${scraper.id}:skill kyouka kaikin + orangemaru special`,
    kind: "title",
    value: input.reference.title,
    normalizedValue: input.reference.title.toLowerCase(),
    scraperId: scraper.id,
    scraperName: scraper.name,
    origin: "reference",
    sourceUrl: input.reference.sourceUrl,
    parentStepIds: [],
    evidenceCount: 1,
    status: "active",
    foundAt: "2026-08-08T00:00:00.000Z",
  };
  const authorStep = {
    id: "author-step",
    kind: "authorSearch",
    label: "Recherche avec l'auteur",
    term: "YD",
    createdAt: "2026-08-08T00:00:01.000Z",
  };
  const pollutedDiscovery = {
    ...referenceDiscovery,
    key: `title:${scraper.id}:orangemaru special`,
    value: "OrangeMaru Special",
    normalizedValue: "orangemaru special",
    origin: "card",
    sourceUrl: "https://example.test/details/sibling",
    parentStepIds: [authorStep.id],
  };
  const previousResult = {
    request: input.request,
    matches: [],
    rejectedCandidates: [],
    rejectedCandidateCount: 0,
    passNumber: 1,
    trace: [authorStep],
    searchedTitles: [],
    searchedAuthors: [],
    discoveries: [referenceDiscovery, pollutedDiscovery],
  };
  const replayed = await runMangaCorrespondenceSearch({
    ...input,
    replay: {
      revision: 1,
      discoveryDecisions: [referenceDiscovery, pollutedDiscovery]
        .map(({ key, status }) => ({ key, status })),
    },
  }, new AbortController().signal, async () => {}, previousResult);

  assert.ok(replayed.searchedTitles.includes(input.reference.title));
  assert.ok(!replayed.searchedTitles.includes("OrangeMaru Special"));
  assert.ok(searchedUrls.every((url) => !url.includes("q=OrangeMaru Special")));
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

test("author correspondence replay searches added aliases and keeps their direct page targets", () => {
  const input = {
    referenceName: "Author A",
    names: ["Author A"],
    referenceSources: [{
      scraperId: scraper.id,
      authorUrl: "https://example.test/authors/a",
      name: "Author A",
    }],
    scraperFilterValues: [],
    scrapers: [scraper],
    maxPages: 1,
    authorPageCount: 1,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: false,
    replay: { revision: 2 },
  };
  const result = {
    referenceName: "Author A",
    searchedNames: ["Author A"],
    matches: [{
      key: `${scraper.id}::https://example.test/authors/b`,
      scraperId: scraper.id,
      scraperName: scraper.name,
      authorName: "Author B",
      authorUrl: "https://example.test/authors/b",
      matchedName: "Author A",
      discoveryMethods: ["search"],
      previewSources: [],
    }],
  };
  const discoveries = buildInitialAuthorCorrespondenceDiscoveries(input, result);
  const revisedDiscoveries = discoveries.map((discovery) => (
    discovery.value === "Author A"
      ? { ...discovery, status: "invalidated" }
      : discovery
  ));
  const replayInput = buildAuthorCorrespondenceReplayInput(input, revisedDiscoveries);

  assert.deepEqual(replayInput.names, ["Author B"]);
  assert.equal(replayInput.referenceName, "Author B");
  assert.deepEqual(replayInput.referenceSources, [{
    scraperId: scraper.id,
    authorUrl: "https://example.test/authors/b",
    name: "Author B",
  }]);
  assert.equal(replayInput.replay.revision, 3);
  assert.deepEqual(input.names, ["Author A"]);
});

const buildAdvancedSource = (scraperId, title, detailUrl) => ({
  scraper: {
    ...scraper,
    id: scraperId,
    name: scraperId,
    baseUrl: `https://${scraperId}.test/`,
  },
  result: { title, detailUrl },
  searchTerm: "Author A",
  pageIndex: 1,
  sourceLanguageCodes: ["en"],
  detectedLanguageCodes: [],
  tentativeAuthorNames: ["Author A"],
  advancedRomanizedTitleVariants: [],
  advancedRomanizedTentativeAuthorNameVariants: [],
  contentTypes: ["Manga"],
  canOpenDetails: true,
});

test("advanced author search selects the most sourced unprocessed manga cards", () => {
  const frequentSources = [
    buildAdvancedSource("source-a", "Frequent Work", "https://source-a.test/work/1"),
    buildAdvancedSource("source-b", "Frequent Work", "https://source-b.test/work/1"),
    buildAdvancedSource("source-c", "Frequent Work", "https://source-c.test/work/1"),
  ];
  const nextSources = [
    buildAdvancedSource("source-a", "Next Work", "https://source-a.test/work/2"),
    buildAdvancedSource("source-b", "Next Work", "https://source-b.test/work/2"),
  ];
  const merged = mergeMultiSearchResults([...nextSources, ...frequentSources]);
  const authorSourceKeys = new Set([...nextSources, ...frequentSources].map(
    buildMultiSearchSourceIdentityKey,
  ));

  const firstBatch = selectAuthorCorrespondenceAdvancedSeeds(
    merged,
    authorSourceKeys,
    new Set(),
    1,
  );
  assert.equal(firstBatch.length, 1);
  assert.equal(firstBatch[0].result.title, "Frequent Work");
  assert.equal(firstBatch[0].result.sources.length, 3);

  const secondBatch = selectAuthorCorrespondenceAdvancedSeeds(
    merged,
    authorSourceKeys,
    new Set(firstBatch[0].anchorSourceKeys),
    1,
  );
  assert.equal(secondBatch.length, 1);
  assert.equal(secondBatch[0].result.title, "Next Work");
});

test("advanced author search accepts a different manga count for every continuation", () => {
  assert.equal(resolveAuthorCorrespondenceAdvancedBatchSize({
    batchSize: 5,
    cachedMangaCount: 21,
    requestedBatchCount: 8,
    requestedProcessedMangaCount: 26,
  }), 5);
  assert.equal(resolveAuthorCorrespondenceAdvancedBatchSize({
    batchSize: 1,
    cachedMangaCount: 21,
    requestedBatchCount: 8,
    requestedProcessedMangaCount: 22,
  }), 1);
  assert.equal(resolveAuthorCorrespondenceAdvancedBatchSize({
    batchSize: 3,
    cachedMangaCount: 21,
    requestedBatchCount: 7,
  }), 0);
});

test("session manga matches stay attached to their originating combined card", () => {
  const anchor = buildAdvancedSource(
    "source-a",
    "Original Work",
    "https://source-a.test/work/original",
  );
  const automaticallyMerged = buildAdvancedSource(
    "source-b",
    "Original Work",
    "https://source-b.test/work/original",
  );
  const correspondenceMatch = buildAdvancedSource(
    "source-c",
    "Completely Different Localized Title",
    "https://source-c.test/work/equivalent",
  );
  const results = mergeAuthorCorrespondenceSessionResults(
    [anchor, automaticallyMerged],
    [{
      seedKey: buildMultiSearchSourceIdentityKey(anchor),
      anchorSourceKeys: [buildMultiSearchSourceIdentityKey(anchor)],
      sources: [correspondenceMatch],
    }],
    { enableRomajiPhoneticMerge: false, preferredTitleLanguageCodes: [] },
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].sources.length, 3);
  assert.ok(results[0].sources.includes(correspondenceMatch));
});

test("advanced author orchestration reuses the canonical search engines", () => {
  const advancedEngine = fs.readFileSync(
    path.resolve("src/renderer/searchEngines/authorCorrespondenceAdvancedSearch.ts"),
    "utf8",
  );
  const sessionListings = fs.readFileSync(
    path.resolve("src/renderer/searchEngines/authorCorrespondenceSessionListings.ts"),
    "utf8",
  );
  const resultView = fs.readFileSync(
    path.resolve("src/renderer/components/AuthorCorrespondence/AuthorCorrespondenceView.tsx"),
    "utf8",
  );
  const advancedStatus = fs.readFileSync(
    path.resolve("src/renderer/components/AuthorCorrespondence/AuthorCorrespondenceAdvancedStatus.tsx"),
    "utf8",
  );
  const advancedButton = fs.readFileSync(
    path.resolve("src/renderer/components/AuthorCorrespondence/AuthorCorrespondenceAdvancedButton.tsx"),
    "utf8",
  );

  assert.match(advancedEngine, /runMangaCorrespondenceSearch\s*\(/);
  assert.match(advancedEngine, /request:\s*"sameManga"/);
  assert.doesNotMatch(advancedEngine, /purpose:\s*"authorDiscovery"/);
  assert.match(advancedEngine, /runAuthorCorrespondenceSearch\s*\(/);
  assert.match(sessionListings, /buildAuthorListingSearchInput\s*\(/);
  assert.match(sessionListings, /runAuthorFavoriteRefreshSearchEngine\s*\(/);
  assert.match(resultView, /is-advanced-discovery/);
  assert.match(resultView, /Nouveau · recherche poussée/);
  assert.match(advancedStatus, /role="progressbar"/);
  assert.match(advancedButton, /<ScraperPageAppendControl/);
  assert.match(advancedButton, /requestedProcessedMangaCount/);
});
