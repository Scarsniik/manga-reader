const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    buildBackgroundSearchWorkspaceTarget,
    getBackgroundSearchViewId,
  } from "@/renderer/backgroundSearch/backgroundSearchNavigation";
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
  getBackgroundSearchViewId,
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
