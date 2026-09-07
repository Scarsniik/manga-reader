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
    filterAuthorCorrespondenceNameSearchSources,
    isAuthorCorrespondenceNameSearchSourceVerified,
  } from "@/renderer/searchEngines/authorCorrespondenceNameSearchSources";
  export {
    buildAuthorCorrespondenceManualMangaSources,
    buildAuthorCorrespondenceAdvancedMangaInput,
    buildAuthorCorrespondenceAdvancedProgressSummary,
    collectEvidenceBackedAdvancedAuthorAliases,
    filterIncompatibleAdvancedAuthorMatches,
    isAuthorCorrespondenceAdvancedSeedActive,
  } from "@/renderer/searchEngines/authorCorrespondenceAdvancedSearch";
  export {
    readAuthorCorrespondenceInvalidations,
    writeAuthorCorrespondenceInvalidations,
  } from "@/renderer/backgroundSearch/authorCorrespondenceInvalidations";
  export {
    analyzeAdvancedAuthorAliases,
    mergeAuthorCorrespondenceRejectedAuthorCandidates,
  } from "@/renderer/backgroundSearch/authorCorrespondenceRejectedAuthors";
  export {
    resolveAuthorCorrespondenceAdvancedBatchSize,
    selectAuthorCorrespondenceAdvancedSeeds,
  } from "@/renderer/searchEngines/authorCorrespondenceAdvancedSelection";
  export { collectMangaCorrespondenceAuthors } from "@/renderer/searchEngines/authorCorrespondenceMangaDiscovery";
  export { findCompatibleMangaAuthorName } from "@/renderer/utils/mangaMatching/titleProfiles";
  export { mergeAuthorCorrespondenceSessionResults } from "@/renderer/backgroundSearch/authorCorrespondenceSessionResults";
  export { buildMultiSearchSourceIdentityKey, mergeMultiSearchResults } from "@/renderer/components/MultiSearch/multiSearchMerge";
  export { createSearchExecutionContext } from "@/renderer/searchEngines/searchExecutionContext";
  export { resolveMangaCorrespondenceManualDiscovery } from "@/renderer/backgroundSearch/mangaCorrespondenceManualDiscoveries";
  export {
    buildAuthorCorrespondenceReplayInput,
    buildInitialAuthorCorrespondenceDiscoveries,
  } from "@/renderer/backgroundSearch/authorCorrespondenceDiscoveries";
  export {
    createAuthorCorrespondenceSessionCacheSnapshot,
    mergeAuthorCorrespondenceSessionCacheSnapshots,
    recordAuthorCorrespondenceAdvancedDiscoveries,
    startAuthorCorrespondenceAdvancedDiscoveryBatch,
  } from "@/renderer/backgroundSearch/authorCorrespondenceSessionCache";
  export {
    buildReusableAuthorSearchCandidates,
    selectAutomaticReusableAuthorSearch,
  } from "@/renderer/backgroundSearch/reusableAuthorSearches";
  export { importLinkedAuthorSearchIntoManga } from "@/renderer/backgroundSearch/linkedAuthorSearchOrchestration";
  export { filterMangaCorrespondenceRejectedCandidatesByText } from "@/renderer/components/MangaCorrespondence/mangaCorrespondenceRejectedFilters";
  export {
    buildAuthorCorrespondenceRejectedMangaTargets,
    buildAuthorCorrespondenceRejectedOpenTargets,
  } from "@/renderer/components/AuthorCorrespondence/authorCorrespondenceRejectedOpenTargets";
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
  analyzeAdvancedAuthorAliases,
  buildAuthorCorrespondenceManualMangaSources,
  buildAuthorCorrespondenceAdvancedMangaInput,
  buildAuthorCorrespondenceAdvancedProgressSummary,
  buildAuthorCorrespondenceRejectedMangaTargets,
  buildAuthorCorrespondenceRejectedOpenTargets,
  buildAuthorCorrespondenceReplayInput,
  buildReusableAuthorSearchCandidates,
  buildInitialAuthorCorrespondenceDiscoveries,
  buildMultiSearchSourceIdentityKey,
  collectEvidenceBackedAdvancedAuthorAliases,
  collectMangaCorrespondenceAuthors,
  createAuthorCorrespondenceSessionCacheSnapshot,
  createSearchExecutionContext,
  filterAuthorCorrespondenceNameSearchSources,
  filterIncompatibleAdvancedAuthorMatches,
  filterMangaCorrespondenceRejectedCandidatesByText,
  findCompatibleMangaAuthorName,
  isAuthorCorrespondenceNameSearchSourceVerified,
  isAuthorCorrespondenceAdvancedSeedActive,
  importLinkedAuthorSearchIntoManga,
  mergeAuthorCorrespondenceSessionResults,
  mergeAuthorCorrespondenceSessionCacheSnapshots,
  mergeAuthorCorrespondenceRejectedAuthorCandidates,
  mergeMultiSearchResults,
  resolveAuthorCorrespondenceAdvancedBatchSize,
  resolveMangaCorrespondenceManualDiscovery,
  readAuthorCorrespondenceInvalidations,
  recordAuthorCorrespondenceAdvancedDiscoveries,
  runAuthorCorrespondenceSearch,
  runAuthorCorrespondenceWorkflow,
  runMangaCorrespondenceSearch,
  selectAutomaticReusableAuthorSearch,
  selectAuthorCorrespondenceAdvancedSeeds,
  startAuthorCorrespondenceAdvancedDiscoveryBatch,
  writeAuthorCorrespondenceInvalidations,
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

const buildReusableSearchMetadata = (id, kind, primaryTerm, resultCount, updatedAt) => ({
  id,
  schemaVersion: 1,
  kind,
  title: `${kind} · ${primaryTerm}`,
  primaryTerm,
  status: "completed",
  storageMode: "temporaryFile",
  retentionHours: 24,
  createdAt: updatedAt,
  updatedAt,
  revision: 1,
  progress: { completedUnits: 1, resultCount },
  inputAvailable: true,
  resultAvailable: true,
});

const buildReusableAuthorJob = ({
  id,
  name,
  resultCount,
  processedMangaCount = 0,
  safetyBlocked = false,
  updatedAt = "2026-08-27T00:00:00.000Z",
}) => ({
  metadata: buildReusableSearchMetadata(id, "authorCorrespondence", name, resultCount, updatedAt),
  input: {
    referenceName: name,
    names: [name],
    referenceSources: [],
    scraperFilterValues: [],
    scrapers: [scraper],
    maxPages: 6,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: false,
  },
  result: {
    referenceName: name,
    matches: [],
    searchedNames: [name],
    advancedSearch: {
      completedBatchCount: 1,
      lastBatchMangaCount: processedMangaCount,
      processedMangaCount,
      discoveredMangaSourceCount: resultCount,
      discoveredAuthorPageCount: resultCount,
      remainingCandidateCount: 0,
      automaticMangaReplayBlocked: safetyBlocked,
    },
  },
});

const buildReusableMangaJob = (linkedAuthorImports = []) => ({
  metadata: buildReusableSearchMetadata(
    "manga-yuzuriha",
    "mangaCorrespondence",
    "InCha na Ore dake ga Shitteiru Seitokaichou no Uragawa.",
    12,
    "2026-08-27T12:00:00.000Z",
  ),
  input: buildCorrespondenceInput({
    reference: {
      ...buildCorrespondenceInput().reference,
      title: "InCha na Ore dake ga Shitteiru Seitokaichou no Uragawa.",
      authors: ["Yuzuriha"],
    },
    linkedAuthorImports,
  }),
  result: {
    matches: [],
    rejectedCandidates: [],
    passNumber: 1,
    trace: [],
    searchedTitles: [],
    searchedAuthors: ["Yuzuriha"],
    discoveries: [],
  },
});

test("automatic reuse selects the richest exact author corpus", () => {
  const shallow = buildReusableAuthorJob({
    id: "author-yuzuriha-shallow",
    name: "Yuzuriha",
    resultCount: 3,
    processedMangaCount: 2,
  });
  const deep = buildReusableAuthorJob({
    id: "author-yuzuriha-deep",
    name: "YUZURIHA",
    resultCount: 18,
    processedMangaCount: 40,
  });
  const unrelated = buildReusableAuthorJob({
    id: "author-unrelated",
    name: "Another Author",
    resultCount: 50,
    processedMangaCount: 100,
  });
  const mangaJob = buildReusableMangaJob();

  const candidates = buildReusableAuthorSearchCandidates(mangaJob, [unrelated, shallow, deep]);
  const selected = selectAutomaticReusableAuthorSearch(mangaJob, [unrelated, shallow, deep]);

  assert.equal(candidates[0].job.metadata.id, deep.metadata.id);
  assert.deepEqual(candidates[0].matchedNames, ["Yuzuriha"]);
  assert.equal(selected.job.metadata.id, deep.metadata.id);
});

test("automatic reuse respects safeguards and an existing imported author link", () => {
  const blocked = buildReusableAuthorJob({
    id: "author-yuzuriha-blocked",
    name: "Yuzuriha",
    resultCount: 30,
    processedMangaCount: 80,
    safetyBlocked: true,
  });
  const candidates = buildReusableAuthorSearchCandidates(buildReusableMangaJob(), [blocked]);
  const blockedSelection = selectAutomaticReusableAuthorSearch(buildReusableMangaJob(), [blocked]);
  const alreadyLinkedSelection = selectAutomaticReusableAuthorSearch(buildReusableMangaJob([{
    authorJobId: "author-yuzuriha-previous",
    sourceCacheRevision: 4,
    importedCacheRevision: 2,
    importedAt: "2026-08-27T11:00:00.000Z",
    names: ["Yuzuriha"],
    referenceSources: [],
  }]), [buildReusableAuthorJob({
    id: "author-yuzuriha-other",
    name: "Yuzuriha",
    resultCount: 10,
  })]);

  assert.equal(candidates[0].automaticImportBlocked, true);
  assert.equal(blockedSelection, undefined);
  assert.equal(alreadyLinkedSelection, undefined);
});

test("a standalone author search can be linked to a manga without changing its origin", async () => {
  const authorJob = buildReusableAuthorJob({
    id: "standalone-author-yuzuriha",
    name: "Yuzuriha",
    resultCount: 20,
    processedMangaCount: 50,
  });
  const mangaJob = buildReusableMangaJob();
  const sourceCache = createAuthorCorrespondenceSessionCacheSnapshot({
    revision: 7,
    processedMangaKeys: ["processed-work"],
  });
  const emptyCache = createAuthorCorrespondenceSessionCacheSnapshot();
  let replayRequest;
  let publishedCache;
  let relationUpdateCount = 0;
  global.window = {
    setTimeout,
    api: {
      getBackgroundSearchJob: async (jobId) => (
        jobId === authorJob.metadata.id ? authorJob : mangaJob
      ),
      getAuthorCorrespondenceSessionCache: async (jobId) => (
        jobId === authorJob.metadata.id ? sourceCache : emptyCache
      ),
      setAuthorCorrespondenceSessionCache: async (_jobId, cache) => {
        publishedCache = cache;
      },
      replayBackgroundSearch: async (request) => {
        replayRequest = request;
        return mangaJob.metadata;
      },
      updateBackgroundSearchRelation: async () => {
        relationUpdateCount += 1;
      },
    },
  };

  const outcome = await importLinkedAuthorSearchIntoManga({
    authorJobId: authorJob.metadata.id,
    mangaJobId: mangaJob.metadata.id,
    automatic: false,
    autoRefreshOnCompletion: true,
    blockAutomaticImportOnSafetyWarning: true,
  });

  assert.equal(outcome, "replayed");
  assert.equal(relationUpdateCount, 0);
  assert.deepEqual(publishedCache.processedMangaKeys, ["processed-work"]);
  assert.equal(replayRequest.jobId, mangaJob.metadata.id);
  assert.equal(replayRequest.input.linkedAuthorImports[0].authorJobId, authorJob.metadata.id);
  assert.equal(replayRequest.input.linkedAuthorImports[0].sourceCacheRevision, 7);
  assert.equal(replayRequest.input.linkedAuthorImports[0].autoRefreshOnCompletion, true);
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

test("anthology matches keep their credits but only propagate corresponding authors", async () => {
  const anthologyScraper = {
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
            html: '<article class="card"><a class="title" href="/details/anthology">Series One</a></article>',
          };
        }
        return {
          ok: true,
          requestedUrl: targetUrl,
          finalUrl: targetUrl,
          html: `
            <h1 class="details-title">Series One</h1>
            <span class="author">Mika Sayaki</span>
            <span class="author">Punchin Namatamago</span>
            <span class="author">Towai Raito</span>
          `,
        };
      },
    },
  };

  const result = await runMangaCorrespondenceSearch(buildCorrespondenceInput({
    request: "sameManga",
    reference: {
      scraperId: anthologyScraper.id,
      sourceUrl: "https://example.test/details/reference",
      rawTitle: "Series One",
      title: "Series One",
      alternativeTitles: [],
      authors: ["Punching Namatamago"],
      authorUrls: [],
    },
    authorPropagationReferenceNames: ["Punching Namatamago"],
    scrapers: [anthologyScraper],
    maxPages: 1,
    scrapeDetailsWithCards: true,
  }), new AbortController().signal, async () => {});

  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0].authors, [
    "Mika Sayaki",
    "Punchin Namatamago",
    "Towai Raito",
  ]);
  assert.deepEqual(
    result.discoveries.filter((entry) => entry.kind === "author").map((entry) => entry.value),
    ["Punchin Namatamago", "Punching Namatamago"],
  );
  assert.ok(!result.searchedAuthors.includes("Mika Sayaki"));
  assert.ok(!result.searchedAuthors.includes("Towai Raito"));
});

test("an exact title from a distant explicit author is rejected before propagation", async () => {
  global.window = {
    setTimeout,
    api: {
      fetchScraperDocument: async (request) => ({
        ok: true,
        requestedUrl: request.targetUrl,
        finalUrl: request.targetUrl,
        html: `
          <article class="card">
            <a class="title" href="/details/motsuaki">[Motsuaki] Tomodachi no Imouto</a>
          </article>
        `,
      }),
    },
  };

  const result = await runMangaCorrespondenceSearch(buildCorrespondenceInput({
    request: "sameManga",
    reference: {
      scraperId: scraper.id,
      sourceUrl: "https://example.test/details/poriuretan",
      rawTitle: "[Poriuretan] Tomodachi no Imouto",
      title: "Tomodachi no Imouto",
      alternativeTitles: [],
      authors: ["Poriuretan"],
      authorUrls: [],
    },
    maxPages: 1,
  }), new AbortController().signal, async () => {});

  assert.equal(result.matches.length, 0);
  const rejected = result.rejectedCandidates.find((candidate) => (
    candidate.source.result.detailUrl.endsWith("/details/motsuaki")
  ));
  assert.ok(rejected);
  assert.equal(rejected.rejectionReason, "authorMismatch");
  assert.ok(result.discoveries.every((discovery) => discovery.value !== "Motsuaki"));
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
  assert.deepEqual(urlDiscovery.mangaReference, {
    scraperId: scraper.id,
    sourceUrl: "https://example.test/details/two",
    rawTitle: "Series Two 2",
    title: "Series Two",
    alternativeTitles: [],
    authors: ["YD"],
    authorUrls: ["https://example.test/authors/yd"],
    chapter: "2",
  });
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
  assert.ok(snapshots.some((label) => label?.includes("Source A · page 1/1")));
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

test("author correspondence keeps name-search cards even with a reliable direct author page", async () => {
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
            <article class="card"><a class="title" href="/details/one">[Author A] Series One</a></article>
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

  assert.deepEqual(requests, [
    "https://example.test/search?q=Author%20A&page=1",
    "https://example.test/search?q=Author%20A&page=2",
    "https://example.test/search?q=Author%20A&page=3",
    "https://example.test/search?q=Author%20A&page=4",
    "https://example.test/search?q=Author%20A&page=5",
    "https://example.test/authors/a",
  ]);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].previewSources.length, 1);
  assert.deepEqual(result.matches[0].discoveryMethods, ["reference"]);
  assert.equal(result.nameSearchSources.length, 1);
  assert.equal(result.nameSearchSources[0].result.detailUrl, "https://example.test/details/one");
  assert.deepEqual(result.nameSearchSources[0].contextualAuthorNames, ["Author A"]);
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

test("author correspondence replay keeps active manually added manga pages", () => {
  const mangaReference = {
    scraperId: scraper.id,
    sourceUrl: "https://example.test/details/manual-work",
    rawTitle: "Manual Work 4",
    title: "Manual Work",
    alternativeTitles: [],
    authors: ["Author A"],
    authorUrls: ["https://example.test/authors/a"],
    chapter: "4",
  };
  const input = {
    referenceName: "Author A",
    names: ["Author A"],
    referenceSources: [],
    mangaReferences: [mangaReference],
    scraperFilterValues: [],
    scrapers: [scraper],
    maxPages: 1,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: false,
  };
  const discoveries = buildInitialAuthorCorrespondenceDiscoveries(input);
  const mangaDiscovery = discoveries.find((discovery) => discovery.kind === "title");
  assert.equal(mangaDiscovery.value, "Manual Work");
  assert.equal(mangaDiscovery.sourceUrl, mangaReference.sourceUrl);

  const replayInput = buildAuthorCorrespondenceReplayInput(input, discoveries);
  assert.deepEqual(replayInput.mangaReferences, [mangaReference]);

  const invalidatedInput = buildAuthorCorrespondenceReplayInput(
    input,
    discoveries.map((discovery) => discovery.kind === "title"
      ? { ...discovery, status: "invalidated" }
      : discovery),
  );
  assert.deepEqual(invalidatedInput.mangaReferences, []);
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

test("rejected manga text filtering checks titles, authors, sources, reasons and scores", () => {
  const buildRejectedCandidate = ({ id, title, author, reason, score }) => ({
    key: id,
    source: {
      ...buildAdvancedSource(id, title, `https://${id}.test/work/${id}`),
      tentativeAuthorNames: [author],
    },
    analyzedTitle: title,
    alternativeTitles: [],
    authors: [author],
    chapterConfidence: "medium",
    rejectionReason: reason,
    score,
    scoreReasons: reason === "authorMismatch"
      ? ["Auteur explicite trop éloigné de la référence"]
      : ["Version dérivée ou contenu annexe détecté"],
    discoveredByStepIds: [],
    decision: "pending",
    useAsSearchSeed: false,
  });
  const authorCandidate = buildRejectedCandidate({
    id: "source-yuzuriha",
    title: "InCha Side Story",
    author: "Yuzuriha",
    reason: "authorMismatch",
    score: 82,
  });
  const derivativeCandidate = buildRejectedCandidate({
    id: "source-derivative",
    title: "Unrelated Animation",
    author: "Another Author",
    reason: "derivative",
    score: 34,
  });
  const candidates = [authorCandidate, derivativeCandidate];

  assert.deepEqual(
    filterMangaCorrespondenceRejectedCandidatesByText(candidates, "Yuzuriha 82"),
    [authorCandidate],
  );
  assert.deepEqual(
    filterMangaCorrespondenceRejectedCandidatesByText(candidates, "source yuzuriha"),
    [authorCandidate],
  );
  assert.deepEqual(
    filterMangaCorrespondenceRejectedCandidatesByText(candidates, "auteur différent"),
    [authorCandidate],
  );
  assert.deepEqual(
    filterMangaCorrespondenceRejectedCandidatesByText(candidates, "dérivée"),
    [derivativeCandidate],
  );
  assert.deepEqual(
    filterMangaCorrespondenceRejectedCandidatesByText(candidates, "Yuzuriha, dérivée"),
    candidates,
  );
});

test("author identity matching reuses normalized variants and a conservative typo fallback", () => {
  assert.deepEqual(
    findCompatibleMangaAuthorName("Ooshima Aki", ["Oshima Aki"]),
    { referenceName: "Oshima Aki", kind: "normalized" },
  );
  assert.deepEqual(
    findCompatibleMangaAuthorName("Punchin Namatamago", ["Punching Namatamago"]),
    { referenceName: "Punching Namatamago", kind: "singleEdit" },
  );
  assert.deepEqual(
    findCompatibleMangaAuthorName(
      "LIME&MINT (Punching Namatamago)",
      ["Punching Namatamago"],
    ),
    { referenceName: "Punching Namatamago", kind: "embeddedLabel" },
  );
  assert.equal(findCompatibleMangaAuthorName("Towai Raito", ["Punching Namatamago"]), undefined);
  assert.equal(
    findCompatibleMangaAuthorName(
      "Punching Namatamago Mika Sayaki",
      ["Punching Namatamago"],
    ),
    undefined,
  );
});

test("advanced manga discovery does not export unrelated anthology coauthors", () => {
  const source = {
    ...buildAdvancedSource("source-a", "Anthology", "https://source-a.test/work/anthology"),
    result: {
      title: "Anthology",
      detailUrl: "https://source-a.test/work/anthology",
      authorUrl: "https://source-a.test/authors/mika",
      authorUrls: [
        "https://source-a.test/authors/mika",
        "https://source-a.test/authors/punching",
        "https://source-a.test/authors/towai",
      ],
      authorNames: ["Mika Sayaki", "Punchin Namatamago", "Towai Raito"],
    },
  };
  const result = {
    matches: [{
      source,
      authors: ["Mika Sayaki", "Punchin Namatamago", "Towai Raito"],
    }],
    discoveries: [{
      kind: "author",
      status: "active",
      value: "LIME&MINT (Punching Namatamago)",
      scraperId: "source-a",
      authorPageUrl: "https://source-a.test/authors/lime-and-mint",
    }],
  };

  const discovered = collectMangaCorrespondenceAuthors(result, {
    referenceNames: ["Punching Namatamago"],
  });

  assert.deepEqual(discovered.names, [
    "LIME&MINT (Punching Namatamago)",
    "Punchin Namatamago",
  ]);
  assert.deepEqual(discovered.referenceSources.map((entry) => entry.authorUrl).sort(), [
    "https://source-a.test/authors/lime-and-mint",
    "https://source-a.test/authors/punching",
  ]);
  assert.deepEqual(discovered.rejectedAuthors.map((entry) => ({
    name: entry.name,
    sourceTitle: entry.sourceTitle,
  })).sort((left, right) => left.name.localeCompare(right.name)), [{
    name: "Mika Sayaki",
    sourceTitle: "Anthology",
  }, {
    name: "Towai Raito",
    sourceTitle: "Anthology",
  }]);
});

test("advanced author aliases can be promoted by repeated single-author manga evidence", () => {
  const buildAliasSource = (scraperId, detailId, authorName) => ({
    ...buildAdvancedSource(
      scraperId,
      `[${authorName}] Work ${detailId}`,
      `https://${scraperId}.test/work/${detailId}`,
    ),
    tentativeAuthorNames: [authorName],
  });
  const limeSource = buildAliasSource(
    "source-a",
    "lime",
    "LIME&MINT (Punching Namatamago)",
  );
  const japaneseOneA = buildAliasSource("source-a", "japanese-1-a", "パンチング生卵");
  const japaneseOneB = buildAliasSource("source-b", "japanese-1-b", "パンチング生卵");
  const japaneseTwo = buildAliasSource("source-a", "japanese-2", "パンチング生卵");
  const anthologySources = ["source-a", "source-b", "source-c"].map((scraperId) => (
    buildAliasSource(scraperId, `anthology-${scraperId}`, "Omiyaback (Various)")
  ));
  const buildEnrichment = (seedKey, sources) => ({
    seedKey,
    anchorSourceKeys: sources.map(buildMultiSearchSourceIdentityKey),
    sources: [],
  });
  const authorSources = [
    limeSource,
    japaneseOneA,
    japaneseOneB,
    japaneseTwo,
    ...anthologySources,
  ];

  const aliases = collectEvidenceBackedAdvancedAuthorAliases({
    enrichments: [
      buildEnrichment("lime", [limeSource]),
      buildEnrichment("japanese-1", [japaneseOneA, japaneseOneB]),
      buildEnrichment("japanese-2", [japaneseTwo]),
      buildEnrichment("anthology", anthologySources),
    ],
    authorSources,
    referenceNames: ["Punching Namatamago"],
  });

  assert.deepEqual(aliases, [{
    name: "LIME&MINT (Punching Namatamago)",
    mangaCount: 1,
    scraperCount: 1,
    evidence: "compatibleName",
  }, {
    name: "パンチング生卵",
    mangaCount: 2,
    scraperCount: 2,
    evidence: "repeatedManga",
  }]);

  const analysis = analyzeAdvancedAuthorAliases({
    enrichments: [
      buildEnrichment("lime", [limeSource]),
      buildEnrichment("japanese-1", [japaneseOneA, japaneseOneB]),
      buildEnrichment("japanese-2", [japaneseTwo]),
      buildEnrichment("anthology", anthologySources),
    ],
    authorSources,
    referenceNames: ["Punching Namatamago"],
  });
  assert.deepEqual(analysis.rejectedCandidates.map((candidate) => ({
    name: candidate.name,
    reason: candidate.reason,
    mangaCount: candidate.mangaCount,
    scraperCount: candidate.scraperCount,
  })), [{
    name: "Omiyaback (Various)",
    reason: "insufficientMangaEvidence",
    mangaCount: 1,
    scraperCount: 3,
  }]);
});

test("rejected author evidence keeps anthology coauthors available for manual validation", () => {
  const anthologySources = ["source-a", "source-b"].map((scraperId) => ({
    ...buildAdvancedSource(
      scraperId,
      "Anthology",
      `https://${scraperId}.test/work/anthology`,
    ),
    result: {
      title: "Anthology",
      detailUrl: `https://${scraperId}.test/work/anthology`,
      authorNames: ["Punching Namatamago", "Towai Raito", "Sakura Pochi"],
      authorUrls: [
        `https://${scraperId}.test/authors/punching`,
        `https://${scraperId}.test/authors/towai`,
        `https://${scraperId}.test/authors/sakura`,
      ],
    },
    tentativeAuthorNames: [],
  }));
  const analysis = analyzeAdvancedAuthorAliases({
    enrichments: [{
      seedKey: "anthology",
      anchorSourceKeys: anthologySources.map(buildMultiSearchSourceIdentityKey),
      sources: [],
    }],
    authorSources: anthologySources,
    referenceNames: ["Punching Namatamago"],
  });

  assert.deepEqual(analysis.acceptedAliases, []);
  assert.deepEqual(analysis.rejectedCandidates.map((candidate) => ({
    name: candidate.name,
    reason: candidate.reason,
    pageCount: candidate.referenceSources.length,
  })), [{
    name: "Sakura Pochi",
    reason: "multipleAuthorsOnly",
    pageCount: 2,
  }, {
    name: "Towai Raito",
    reason: "multipleAuthorsOnly",
    pageCount: 2,
  }]);
});

test("manual author validation decisions survive evidence refreshes", () => {
  const buildCandidate = (decision, scraperId) => ({
    key: "rejected-author::towai raito",
    name: "Towai Raito",
    reason: "multipleAuthorsOnly",
    decision,
    mangaCount: 1,
    soleAuthorMangaCount: 0,
    scraperCount: 1,
    evidenceMangaKeys: ["anthology"],
    scraperIds: [scraperId],
    scraperNames: [scraperId],
    sampleTitles: ["Anthology"],
    referenceSources: [],
  });
  const merged = mergeAuthorCorrespondenceRejectedAuthorCandidates([
    buildCandidate("accepted", "source-a"),
    buildCandidate("pending", "source-b"),
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].decision, "accepted");
  assert.deepEqual(merged[0].scraperIds, ["source-a", "source-b"]);
});

test("rejected authors only expose author pages extracted from source details", () => {
  const buildAuthorScraper = (id, name, config) => ({
    ...scraper,
    id,
    name,
    baseUrl: `https://${id}.test/`,
    features: [{
      kind: "author",
      label: "Author",
      description: "",
      status: "validated",
      config: {
        resultItemSelector: ".card",
        titleSelector: ".title",
        ...config,
      },
    }],
  });
  const templateScraper = buildAuthorScraper("template", "Template", {
    urlStrategy: "template",
    urlTemplate: "/artists/{{query}}",
    testValue: "sample-author",
  });
  const prefixScraper = buildAuthorScraper("prefix", "Prefix", {
    urlStrategy: "template",
    urlTemplate: "/search?f={{query}}",
    testValue: "artist:sample_author",
  });
  const contextScraper = buildAuthorScraper("context", "Context", {
    urlStrategy: "template",
    urlTemplate: "/artists/{{raw:artistSlug}}/{{page}}",
  });
  const resultUrlScraper = buildAuthorScraper("result-url", "Result URL", {
    urlStrategy: "result_url",
    testUrl: "https://result-url.test/author/sample",
  });
  const excludedScraper = buildAuthorScraper("excluded", "Excluded", {
    urlStrategy: "template",
    urlTemplate: "/author/{{query}}",
  });
  const candidate = {
    key: "rejected-author::towai raito",
    name: "Towai Raito",
    reason: "multipleAuthorsOnly",
    decision: "pending",
    mangaCount: 1,
    soleAuthorMangaCount: 0,
    scraperCount: 2,
    evidenceMangaKeys: ["anthology"],
    scraperIds: ["template", "prefix", "context", "result-url"],
    scraperNames: ["Template", "Prefix", "Context", "Result URL"],
    sampleTitles: ["Anthology"],
    referenceSources: [{
      scraperId: "template",
      authorUrl: "https://template.test/artists/towai-raito",
      name: "Towai Raito",
    }],
  };

  const targets = buildAuthorCorrespondenceRejectedOpenTargets({
    candidate,
    input: {
      referenceName: "Punching Namatamago",
      names: ["Punching Namatamago"],
      referenceSources: [],
      scraperFilterValues: ["__include_filter_excluded__:excluded"],
      scrapers: [templateScraper, prefixScraper, contextScraper, resultUrlScraper, excludedScraper],
      maxPages: null,
      paceMode: "fast",
      scrapingConcurrency: 2,
      scrapeDetailsWithCards: true,
    },
  });

  assert.deepEqual(targets.map(({ scraperId, scraperName, authorUrl, templateContext }) => ({
    scraperId,
    scraperName,
    authorUrl,
    templateContext,
  })), [{
    scraperId: "template",
    scraperName: "Template",
    authorUrl: "https://template.test/artists/towai-raito",
    templateContext: undefined,
  }]);

  assert.deepEqual(buildAuthorCorrespondenceRejectedOpenTargets({
    candidate: {
      ...candidate,
      referenceSources: [],
    },
    input: {
      referenceName: "Punching Namatamago",
      names: ["Punching Namatamago"],
      referenceSources: [],
      scraperFilterValues: [],
      scrapers: [templateScraper, prefixScraper, contextScraper, resultUrlScraper],
      maxPages: null,
      paceMode: "fast",
      scrapingConcurrency: 2,
      scrapeDetailsWithCards: true,
    },
  }), []);
});

test("rejected authors without an author page expose their evidence manga", () => {
  const firstSource = buildAdvancedSource(
    "source-a",
    "First anthology",
    "https://source-a.test/manga/first",
  );
  const secondSource = buildAdvancedSource(
    "source-b",
    "Second anthology",
    "https://source-b.test/manga/second",
  );
  const firstSourceKey = buildMultiSearchSourceIdentityKey(firstSource);
  const secondSourceKey = buildMultiSearchSourceIdentityKey(secondSource);
  const targets = buildAuthorCorrespondenceRejectedMangaTargets({
    candidate: {
      key: "rejected-author::guest",
      name: "Guest",
      reason: "multipleAuthorsOnly",
      decision: "pending",
      mangaCount: 2,
      soleAuthorMangaCount: 0,
      scraperCount: 2,
      evidenceMangaKeys: [firstSourceKey, secondSourceKey],
      scraperIds: ["source-a", "source-b"],
      scraperNames: ["source-a", "source-b"],
      sampleTitles: ["First anthology", "Second anthology"],
      referenceSources: [],
    },
    cache: createAuthorCorrespondenceSessionCacheSnapshot({
      runs: [{
        results: [firstSource, secondSource],
      }],
      mangaEnrichments: [{
        seedKey: firstSourceKey,
        anchorSourceKeys: [firstSourceKey],
        sources: [],
      }, {
        seedKey: secondSourceKey,
        anchorSourceKeys: [secondSourceKey],
        sources: [],
      }],
    }),
  });

  assert.deepEqual(targets, [{
    scraperId: "source-a",
    scraperName: "source-a",
    sourceUrl: "https://source-a.test/manga/first",
    title: "First anthology",
  }, {
    scraperId: "source-b",
    scraperName: "source-b",
    sourceUrl: "https://source-b.test/manga/second",
    title: "Second anthology",
  }]);

  const originSource = buildAdvancedSource(
    "source-origin",
    "(Publication type) [Real Author] First anthology",
    "https://source-origin.test/manga/first",
  );
  const originSourceKey = buildMultiSearchSourceIdentityKey(originSource);
  const originTargets = buildAuthorCorrespondenceRejectedMangaTargets({
    candidate: {
      key: "rejected-author::publication type",
      name: "Publication type",
      reason: "multipleAuthorsOnly",
      decision: "pending",
      mangaCount: 1,
      soleAuthorMangaCount: 0,
      scraperCount: 1,
      evidenceMangaKeys: [firstSourceKey],
      scraperIds: ["source-origin"],
      scraperNames: ["source-origin"],
      sampleTitles: ["[Real Author] First anthology"],
      referenceSources: [],
    },
    cache: createAuthorCorrespondenceSessionCacheSnapshot({
      runs: [{
        results: [firstSource, originSource],
      }],
      mangaEnrichments: [{
        seedKey: firstSourceKey,
        anchorSourceKeys: [firstSourceKey, originSourceKey],
        sources: [],
      }],
    }),
  });

  assert.deepEqual(originTargets, [{
    scraperId: "source-origin",
    scraperName: "source-origin",
    sourceUrl: "https://source-origin.test/manga/first",
    title: "(Publication type) [Real Author] First anthology",
  }]);
});

test("a continued advanced pass removes previously discovered coauthor pages", () => {
  const buildMatch = (authorName, matchedName, authorUrl) => ({
    key: `source-a::${authorUrl}`,
    scraperId: "source-a",
    scraperName: "Source A",
    authorName,
    authorUrl,
    matchedName,
    discoveryMethods: ["search"],
    previewSources: [],
  });
  const originalMatch = buildMatch(
    "LIME&MINT",
    "Punching Namatamago",
    "https://source-a.test/authors/lime-and-mint",
  );
  const typoMatch = buildMatch(
    "Punchin Namatamago",
    "Punchin Namatamago",
    "https://source-a.test/authors/punchin",
  );
  const coauthorMatch = buildMatch(
    "Mika Sayaki",
    "Mika Sayaki",
    "https://source-a.test/authors/mika",
  );

  const filtered = filterIncompatibleAdvancedAuthorMatches({
    matches: [originalMatch, typoMatch, coauthorMatch],
    discoveredMatchKeys: [typoMatch.key, coauthorMatch.key],
    referenceNames: ["Punching Namatamago"],
  });

  assert.deepEqual(filtered, [originalMatch, typoMatch]);
});

test("author name-search results require actual author evidence and follow invalidations", () => {
  const verifiedAuthorSource = {
    ...buildAdvancedSource("source-a", "[ie] Verified work", "https://source-a.test/work/ie"),
    searchTerm: "ie",
    tentativeAuthorNames: ["ie"],
  };
  const titleOnlyMatch = {
    ...buildAdvancedSource(
      "source-a",
      "[Hakaba] Kedamono no Ie (Gekan)",
      "https://source-a.test/work/hakaba",
    ),
    searchTerm: "ie",
    tentativeAuthorNames: ["Hakaba"],
  };
  const invalidatedDiscoveredAuthorSource = {
    ...buildAdvancedSource("source-b", "[TER] Another work", "https://source-b.test/work/ter"),
    searchTerm: "ter",
    tentativeAuthorNames: ["TER"],
  };
  const discoveredAuthorMatch = {
    key: "source-b::ter",
    scraperId: "source-b",
    scraperName: "source-b",
    authorName: "TER",
    authorUrl: "https://source-b.test/authors/ter",
    matchedName: "ter",
    discoveryMethods: ["search"],
    previewSources: [],
  };

  assert.equal(isAuthorCorrespondenceNameSearchSourceVerified(verifiedAuthorSource), true);
  assert.equal(isAuthorCorrespondenceNameSearchSourceVerified(titleOnlyMatch), false);
  assert.deepEqual(filterAuthorCorrespondenceNameSearchSources({
    sources: [verifiedAuthorSource, titleOnlyMatch, invalidatedDiscoveredAuthorSource],
    requestedNames: ["ie"],
    matches: [discoveredAuthorMatch],
    invalidatedMatchKeys: new Set([discoveredAuthorMatch.key]),
  }), [verifiedAuthorSource]);
  assert.deepEqual(filterAuthorCorrespondenceNameSearchSources({
    sources: [verifiedAuthorSource, titleOnlyMatch, invalidatedDiscoveredAuthorSource],
    requestedNames: ["ie"],
    matches: [discoveredAuthorMatch],
    invalidatedMatchKeys: new Set(),
  }), [verifiedAuthorSource, invalidatedDiscoveredAuthorSource]);
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

test("live author invalidation removes only seeds no longer backed by an active page", () => {
  const sourceA = buildAdvancedSource(
    "source-a",
    "Shared Work",
    "https://source-a.test/work/shared",
  );
  const sourceB = buildAdvancedSource(
    "source-b",
    "Shared Work",
    "https://source-b.test/work/shared",
  );
  const [mergedResult] = mergeMultiSearchResults([sourceA, sourceB]);
  const seed = {
    key: buildMultiSearchSourceIdentityKey(sourceA),
    anchorSourceKeys: [
      buildMultiSearchSourceIdentityKey(sourceA),
      buildMultiSearchSourceIdentityKey(sourceB),
    ],
    result: mergedResult,
    referenceSource: sourceA,
  };
  const matchA = {
    key: "match-a",
    scraperId: "source-a",
    scraperName: "Source A",
    authorName: "Author A",
    authorUrl: "https://source-a.test/authors/a",
    matchedName: "Author A",
    discoveryMethods: ["reference"],
    previewSources: [],
  };
  const matchB = {
    ...matchA,
    key: "match-b",
    scraperId: "source-b",
    scraperName: "Source B",
    authorUrl: "https://source-b.test/authors/a",
  };
  const cache = {
    revision: 1,
    runs: [{
      key: `${matchA.scraperId}::${matchA.authorUrl}`,
      results: [sourceA],
    }, {
      key: `${matchB.scraperId}::${matchB.authorUrl}`,
      results: [sourceB],
    }],
    mangaEnrichments: [],
    processedMangaKeys: [],
    discoveredAuthorMatchKeys: [],
  };

  assert.equal(isAuthorCorrespondenceAdvancedSeedActive({
    seed,
    cache,
    matches: [matchA, matchB],
    invalidatedMatchKeys: new Set([matchA.key]),
  }), true);
  assert.equal(isAuthorCorrespondenceAdvancedSeedActive({
    seed,
    cache,
    matches: [matchA, matchB],
    invalidatedMatchKeys: new Set([matchA.key, matchB.key]),
  }), false);
});

test("manually added manga pages become active advanced-search sources", () => {
  const input = {
    referenceName: "Author A",
    names: ["Author A"],
    referenceSources: [],
    mangaReferences: [{
      scraperId: scraper.id,
      sourceUrl: "https://example.test/details/manual-work",
      rawTitle: "Manual Work 4",
      title: "Manual Work",
      alternativeTitles: [],
      authors: ["Author A"],
      authorUrls: ["https://example.test/authors/a"],
      chapter: "4",
    }],
    scraperFilterValues: [],
    scrapers: [scraper],
    maxPages: 1,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: false,
  };
  const [source] = buildAuthorCorrespondenceManualMangaSources(input);
  assert.equal(source.result.title, "Manual Work 4");
  assert.equal(source.result.detailUrl, "https://example.test/details/manual-work");
  assert.deepEqual(source.contextualAuthorNames, ["Author A"]);

  const [mergedResult] = mergeMultiSearchResults([source]);
  const sourceKey = buildMultiSearchSourceIdentityKey(source);
  const [seed] = selectAuthorCorrespondenceAdvancedSeeds(
    [mergedResult],
    new Set([sourceKey]),
    new Set(),
    1,
  );
  assert.equal(isAuthorCorrespondenceAdvancedSeedActive({
    seed,
    cache: createAuthorCorrespondenceSessionCacheSnapshot(),
    matches: [],
    invalidatedMatchKeys: new Set(),
    additionalActiveSourceKeys: new Set([sourceKey]),
  }), true);
});

test("a running renderer shares author invalidations even when local storage is unavailable", () => {
  global.window = {
    localStorage: {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("storage unavailable"); },
      removeItem: () => { throw new Error("storage unavailable"); },
    },
  };
  const jobId = "live-author-invalidation-test";
  writeAuthorCorrespondenceInvalidations(jobId, new Set(["match-a", "match-b"]));
  assert.deepEqual(
    Array.from(readAuthorCorrespondenceInvalidations(jobId)).sort(),
    ["match-a", "match-b"],
  );
  writeAuthorCorrespondenceInvalidations(jobId, new Set());
  assert.deepEqual(Array.from(readAuthorCorrespondenceInvalidations(jobId)), []);
});

test("advanced author search accepts a different manga count for every continuation", () => {
  assert.equal(resolveAuthorCorrespondenceAdvancedBatchSize({
    batchSize: 0,
    cachedMangaCount: 21,
    requestedBatchCount: 8,
    requestedProcessedMangaCount: 21,
  }), Number.MAX_SAFE_INTEGER);
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

test("zero advanced depth selects every remaining manga", () => {
  const sources = [
    buildAdvancedSource("source-a", "First Work", "https://source-a.test/work/1"),
    buildAdvancedSource("source-a", "Second Work", "https://source-a.test/work/2"),
    buildAdvancedSource("source-a", "Third Work", "https://source-a.test/work/3"),
  ];
  const merged = mergeMultiSearchResults(sources);
  const authorSourceKeys = new Set(sources.map(buildMultiSearchSourceIdentityKey));

  assert.equal(selectAuthorCorrespondenceAdvancedSeeds(
    merged,
    authorSourceKeys,
    new Set(),
    0,
  ).length, 3);
});

test("a new advanced pass resets only the transient new-author markers", () => {
  const previousSnapshot = createAuthorCorrespondenceSessionCacheSnapshot({
    discoveredAuthorMatchKeys: ["source-a::old"],
    newAuthorMatchKeys: ["source-a::old"],
  });
  const startedSnapshot = startAuthorCorrespondenceAdvancedDiscoveryBatch(
    previousSnapshot,
    ["source-b::older"],
  );

  assert.deepEqual(startedSnapshot.discoveredAuthorMatchKeys, [
    "source-a::old",
    "source-b::older",
  ]);
  assert.deepEqual(startedSnapshot.newAuthorMatchKeys, []);

  const updatedSnapshot = recordAuthorCorrespondenceAdvancedDiscoveries(
    startedSnapshot,
    ["source-c::new", "source-c::new"],
  );
  assert.deepEqual(updatedSnapshot.discoveredAuthorMatchKeys, [
    "source-a::old",
    "source-b::older",
    "source-c::new",
  ]);
  assert.deepEqual(updatedSnapshot.newAuthorMatchKeys, ["source-c::new"]);
});

test("cancelling an advanced author pass validates completed manga and keeps pending discoveries", () => {
  const pendingSource = {
    scraperId: "source-a",
    authorUrl: "https://source-a.test/authors/new",
    name: "New Author",
  };
  const summary = buildAuthorCorrespondenceAdvancedProgressSummary({
    batchCompleted: false,
    completedBatchCount: 2,
    requestedBatchCount: 3,
    completedSeedCount: 15,
    processedMangaCount: 35,
    discoveredMangaSourceCount: 12,
    discoveredAuthorMatchKeys: ["source-a::new"],
    remainingCandidateCount: 5,
    pendingAuthorNames: ["New Author", "new author"],
    pendingAuthorReferenceSources: [pendingSource, pendingSource],
  });

  assert.equal(summary.completedBatchCount, 2);
  assert.equal(summary.lastBatchMangaCount, 15);
  assert.equal(summary.processedMangaCount, 35);
  assert.deepEqual(summary.pendingAuthorNames, ["New Author"]);
  assert.deepEqual(summary.pendingAuthorReferenceSources, [pendingSource]);
});

test("advanced author safeguards block an automatic manga replay", () => {
  const summary = buildAuthorCorrespondenceAdvancedProgressSummary({
    batchCompleted: true,
    completedBatchCount: 0,
    requestedBatchCount: 1,
    completedSeedCount: 1,
    processedMangaCount: 1,
    discoveredMangaSourceCount: 3,
    discoveredAuthorMatchKeys: [],
    remainingCandidateCount: 0,
    pendingAuthorNames: [],
    pendingAuthorReferenceSources: [],
    safetyWarnings: [{
      seedKey: "seed-a",
      seedTitle: "Runaway Work",
      code: "taskExpansion",
      message: "Task expansion stopped.",
    }],
  });

  assert.equal(summary.automaticMangaReplayBlocked, true);
  assert.equal(summary.safetyWarnings.length, 1);
});

test("linked author corpus snapshots merge listings and manga enrichments without losing sources", () => {
  const firstSource = buildAdvancedSource(
    "source-a",
    "First Work",
    "https://source-a.test/work/first",
  );
  const secondSource = buildAdvancedSource(
    "source-a",
    "Second Work",
    "https://source-a.test/work/second",
  );
  const current = createAuthorCorrespondenceSessionCacheSnapshot({
    revision: 2,
    runs: [{
      key: "source-a::https://source-a.test/authors/example",
      name: "Example",
      scraper,
      query: "https://source-a.test/authors/example",
      status: "done",
      results: [firstSource],
      loadedPages: 1,
      hasNextPage: true,
    }],
    processedMangaKeys: ["first"],
  });
  const incoming = createAuthorCorrespondenceSessionCacheSnapshot({
    revision: 5,
    runs: [{
      key: "source-a::https://source-a.test/authors/example",
      name: "Example",
      scraper,
      query: "https://source-a.test/authors/example",
      status: "done",
      results: [firstSource, secondSource],
      loadedPages: 3,
      hasNextPage: false,
    }],
    mangaEnrichments: [{
      seedKey: "first",
      anchorSourceKeys: [buildMultiSearchSourceIdentityKey(firstSource)],
      sources: [secondSource],
    }],
    processedMangaKeys: ["second"],
  });

  const merged = mergeAuthorCorrespondenceSessionCacheSnapshots(current, incoming);
  assert.equal(merged.runs.length, 1);
  assert.equal(merged.runs[0].results.length, 2);
  assert.equal(merged.runs[0].loadedPages, 3);
  assert.equal(merged.runs[0].hasNextPage, false);
  assert.deepEqual(merged.processedMangaKeys.sort(), ["first", "second"]);
  assert.equal(merged.mangaEnrichments.length, 1);
});

test("a manga replay analyzes an imported author corpus without loading its author page again", async () => {
  const authorUrl = "https://source-a.test/authors/author-a";
  const importedSource = buildAdvancedSource(
    "source-a",
    "Series One 2",
    "https://source-a.test/work/series-one-2",
  );
  importedSource.scraper = {
    ...scraper,
    id: "source-a",
    name: "Source A",
    baseUrl: "https://source-a.test/",
  };
  importedSource.result = {
    ...importedSource.result,
    authorUrl,
    authorUrls: [authorUrl],
    authorNames: ["Author A"],
    detailsMetadataFetched: true,
    detailsTitle: "Series One 2",
  };
  const cache = createAuthorCorrespondenceSessionCacheSnapshot({
    revision: 4,
    runs: [{
      key: `source-a::${authorUrl}`,
      name: "Author A",
      scraper: importedSource.scraper,
      query: authorUrl,
      status: "done",
      results: [importedSource],
      loadedPages: 2,
      hasNextPage: false,
    }],
  });
  const requestedUrls = [];
  global.window = {
    setTimeout,
    api: {
      getAuthorCorrespondenceSessionCache: async () => cache,
      fetchScraperDocument: async (request) => {
        requestedUrls.push(String(request.targetUrl));
        return {
          ok: true,
          requestedUrl: String(request.targetUrl),
          finalUrl: String(request.targetUrl),
          html: "<html><body></body></html>",
        };
      },
    },
  };
  const executionContext = createSearchExecutionContext({
    kind: "mangaCorrespondence",
    backgroundJobId: "linked-manga-job",
  });
  const result = await runMangaCorrespondenceSearch(buildCorrespondenceInput({
    reference: {
      ...buildCorrespondenceInput().reference,
      chapter: "1",
      authors: ["Author A"],
      authorUrls: [],
    },
    maxPages: 1,
    linkedAuthorImports: [{
      authorJobId: "linked-author-job",
      sourceCacheRevision: 4,
      importedCacheRevision: 1,
      importedAt: "2026-08-27T00:00:00.000Z",
      names: ["Author A"],
      referenceSources: [{
        scraperId: "source-a",
        authorUrl,
        name: "Author A",
      }],
    }],
  }), new AbortController().signal, async () => {}, undefined, executionContext);

  assert.ok(result.matches.some((match) => (
    match.source.result.detailUrl === importedSource.result.detailUrl
  )));
  assert.ok(!requestedUrls.some((url) => url.includes("/authors/")));
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

test("advanced anthology input only seeds corresponding author names and URLs", () => {
  const referenceSource = {
    ...buildAdvancedSource(
      "source-a",
      "Anthology Work",
      "https://source-a.test/work/anthology",
    ),
    result: {
      title: "Anthology Work",
      detailUrl: "https://source-a.test/work/anthology",
      authorUrl: "https://source-a.test/authors/mika",
      authorUrls: [
        "https://source-a.test/authors/mika",
        "https://source-a.test/authors/punching",
        "https://source-a.test/authors/towai",
      ],
      authorNames: ["Mika Sayaki", "Punchin Namatamago", "Towai Raito"],
    },
    tentativeAuthorNames: ["Mika Sayaki", "Punchin Namatamago", "Towai Raito"],
  };
  const [mergedResult] = mergeMultiSearchResults([referenceSource]);
  const mangaInput = buildAuthorCorrespondenceAdvancedMangaInput({
    referenceName: "Punching Namatamago",
    names: ["Punching Namatamago"],
    scraperFilterValues: [],
    scrapers: [referenceSource.scraper],
    maxPages: 2,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: false,
  }, {
    key: buildMultiSearchSourceIdentityKey(referenceSource),
    anchorSourceKeys: [buildMultiSearchSourceIdentityKey(referenceSource)],
    result: mergedResult,
    referenceSource,
  });

  assert.deepEqual(mangaInput.reference.authors, ["Punchin Namatamago"]);
  assert.deepEqual(mangaInput.reference.authorUrls, [
    "https://source-a.test/authors/punching",
  ]);
  assert.deepEqual(mangaInput.authorPropagationReferenceNames, ["Punching Namatamago"]);
});

test("advanced author references infer chapter one from parsed titles", () => {
  const referenceSource = buildAdvancedSource(
    "source-a",
    "[ie] Kouseinou AI Sexaroid | High-performance AI sexdroid [English]",
    "https://source-a.test/work/sexaroid",
  );
  const [mergedResult] = mergeMultiSearchResults([referenceSource]);
  const mangaInput = buildAuthorCorrespondenceAdvancedMangaInput({
    scraperFilterValues: [],
    scrapers: [referenceSource.scraper],
    maxPages: 2,
    paceMode: "fast",
    scrapingConcurrency: 2,
    scrapeDetailsWithCards: false,
  }, {
    key: buildMultiSearchSourceIdentityKey(referenceSource),
    anchorSourceKeys: [buildMultiSearchSourceIdentityKey(referenceSource)],
    result: mergedResult,
    referenceSource,
  });

  assert.equal(mangaInput.reference.title, "Kouseinou AI Sexaroid");
  assert.equal(mangaInput.reference.chapter, "1");
  assert.deepEqual(mangaInput.reference.alternativeTitles, ["High-performance AI sexdroid"]);
});

test("cached advanced matches with another chapter return to their own card", () => {
  const anchor = buildAdvancedSource(
    "source-a",
    "[ie] Kouseinou AI Sexaroid | High-performance AI sexdroid [English]",
    "https://source-a.test/work/sexaroid",
  );
  const sequel = buildAdvancedSource(
    "source-b",
    "[ie] Kouseinou AI Sexaroid 2",
    "https://source-b.test/work/sexaroid-2",
  );
  const results = mergeAuthorCorrespondenceSessionResults(
    [anchor],
    [{
      seedKey: buildMultiSearchSourceIdentityKey(anchor),
      anchorSourceKeys: [buildMultiSearchSourceIdentityKey(anchor)],
      sources: [sequel],
    }],
    { enableRomajiPhoneticMerge: false, preferredTitleLanguageCodes: [] },
  );

  assert.equal(results.length, 2);
  assert.ok(results.some((result) => result.sources.length === 1 && result.sources[0] === anchor));
  assert.ok(results.some((result) => result.sources.length === 1 && result.sources[0] === sequel));
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
  const favoriteView = fs.readFileSync(
    path.resolve("src/renderer/components/ScraperAuthorFavorites/ScraperAuthorFavoritesView.tsx"),
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
  const backgroundRunner = fs.readFileSync(
    path.resolve("src/renderer/backgroundSearch/BackgroundSearchRunner.tsx"),
    "utf8",
  );

  assert.match(advancedEngine, /runMangaCorrespondenceSearch\s*\(/);
  assert.match(advancedEngine, /request:\s*"sameManga"/);
  assert.doesNotMatch(advancedEngine, /purpose:\s*"authorDiscovery"/);
  assert.match(advancedEngine, /runAuthorCorrespondenceSearch\s*\(/);
  assert.match(advancedEngine, /await flushAuthorDiscoveries\([\s\S]*seedIndex \+ 1/);
  assert.match(advancedEngine, /readLiveInvalidatedMatchKeys\(\)/);
  assert.match(sessionListings, /buildAuthorListingSearchInput\s*\(/);
  assert.match(sessionListings, /runAuthorFavoriteRefreshSearchEngine\s*\(/);
  assert.match(resultView, /is-advanced-discovery/);
  assert.match(resultView, /Nouveau · recherche poussée/);
  assert.match(resultView, /favoriteOverrideNameSearchSources=\{nameSearchSources\}/);
  assert.match(favoriteView, /Hors pages auteur ·/);
  assert.match(favoriteView, /showFavoriteOverrideNameSearchSources/);
  assert.match(advancedStatus, /role="progressbar"/);
  assert.match(advancedButton, /<ScraperPageAppendControl/);
  assert.match(advancedButton, /requestedProcessedMangaCount/);
  assert.match(backgroundRunner, /authorResultChanged/);
});
