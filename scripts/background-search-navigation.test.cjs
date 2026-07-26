const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    buildBackgroundSearchWorkspaceTarget,
    getBackgroundSearchViewId,
    isRestorableBackgroundSearchJob,
  } from "@/renderer/backgroundSearch/backgroundSearchNavigation";
  export {
    clearScraperRouteState,
    parseScraperRouteState,
    writeScraperRouteState,
  } from "@/renderer/utils/scraperBrowserNavigation";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "background-search-navigation-test.ts" },
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
  buildBackgroundSearchWorkspaceTarget,
  clearScraperRouteState,
  getBackgroundSearchViewId,
  isRestorableBackgroundSearchJob,
  parseScraperRouteState,
  writeScraperRouteState,
} = bundledModule.exports;

const makeJob = (kind) => ({
  metadata: { id: `job-${kind}`, kind, title: kind },
  input: {},
});

test("every background search opens in the dedicated result view", () => {
  const kinds = [
    "multiSearch",
    "mangaCorrespondence",
    "scraperAuthor",
    "latestSources",
    "latestAuthors",
    "authorFavoriteRefresh",
  ];

  for (const kind of kinds) {
    const job = makeJob(kind);
    assert.equal(getBackgroundSearchViewId(job), "background-search-results");
    assert.deepEqual(buildBackgroundSearchWorkspaceTarget(job), {
      kind: "manga-manager.view",
      viewId: "background-search-results",
      title: kind,
      locationState: { backgroundSearchJobId: `job-${kind}` },
    });
  }
});

test("background search routes persist the job id across a restart", () => {
  const search = writeScraperRouteState("?sort=date-desc", {
    scraperId: "background-search-results",
    mode: "search",
    backgroundSearchJobId: "job-persisted",
    searchActive: false,
    searchQuery: "",
    searchPage: 1,
    authorActive: false,
    authorQuery: "",
    authorPage: 1,
    mangaQuery: "",
  });

  assert.equal(parseScraperRouteState(search).backgroundSearchJobId, "job-persisted");
  assert.equal(new URLSearchParams(search).get("sort"), "date-desc");
  assert.equal(new URLSearchParams(search).get("backgroundSearchJob"), "job-persisted");
  assert.equal(new URLSearchParams(clearScraperRouteState(search)).has("backgroundSearchJob"), false);
});

test("only available, non-expired jobs can be restored", () => {
  const job = makeJob("multiSearch");
  job.metadata.status = "completed";

  assert.equal(isRestorableBackgroundSearchJob(job), true);
  assert.equal(isRestorableBackgroundSearchJob({ ...job, input: null }), false);
  assert.equal(isRestorableBackgroundSearchJob({
    ...job,
    metadata: { ...job.metadata, status: "expired" },
  }), false);
  assert.equal(isRestorableBackgroundSearchJob(null), false);
});
