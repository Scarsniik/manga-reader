const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");

const source = `
  export {
    buildScraperCheckpointEntries,
    buildTagCheckpointEntries,
    getScraperLatestCheckpointCount,
  } from "@/renderer/components/ScraperLatest/scraperLatestCheckpointManagement";
  export { matchesScraperLatestCheckpointResetTarget } from "@/shared/scraper";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "scraper-latest-checkpoint-management-test.ts" },
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
  buildScraperCheckpointEntries,
  buildTagCheckpointEntries,
  getScraperLatestCheckpointCount,
  matchesScraperLatestCheckpointResetTarget,
} = bundledModule.exports;

const scrapers = [
  {
    id: "source-a",
    name: "Source A",
    baseUrl: "https://a.test",
    globalConfig: { latest: { enabled: true, module: "homepage" } },
  },
  {
    id: "source-b",
    name: "Source B",
    baseUrl: "https://b.test",
    globalConfig: {
      latest: { enabled: true, module: "search" },
      homeSearch: { query: "Latest" },
    },
  },
];
const tagFavorites = [{
  id: "muscle",
  name: "Muscle",
  sources: [
    { scraperId: "source-a", tagUrl: "https://a.test/tags/muscle", name: "Muscle A" },
    { scraperId: "source-b", tagUrl: "https://b.test/tag/MUSCLE", name: "Muscle B" },
  ],
}];

const checkpoint = (overrides) => ({
  id: overrides.id,
  scraperId: overrides.scraperId,
  module: overrides.module,
  query: overrides.query ?? "",
  includedLanguageCodes: overrides.includedLanguageCodes ?? [],
  pageIndex: overrides.pageIndex ?? 4,
  cursorVersion: 2,
  nextPageIndex: overrides.nextPageIndex ?? 5,
  reachedEnd: overrides.reachedEnd ?? false,
  updatedAt: "2026-09-05T10:00:00.000Z",
});

const checkpoints = [
  checkpoint({ id: "home-all", scraperId: "source-a", module: "homepage" }),
  checkpoint({ id: "home-en", scraperId: "source-a", module: "homepage", includedLanguageCodes: ["en"] }),
  checkpoint({ id: "tag-a", scraperId: "source-a", module: "tag", query: "https://a.test/tags/muscle" }),
  checkpoint({ id: "tag-b", scraperId: "source-b", module: "tag", query: "https://b.test/tag/muscle", reachedEnd: true }),
];

test("checkpoint entries separate scraper scans from tag sources and language variants", () => {
  const scraperEntries = buildScraperCheckpointEntries(scrapers, checkpoints);
  const sourceA = scraperEntries.find((entry) => entry.key === "scraper:source-a");
  assert.equal(getScraperLatestCheckpointCount(sourceA), 2);
  assert.deepEqual(sourceA.sections[0].checkpoints.map((item) => item.id), ["home-all", "home-en"]);

  const tagEntries = buildTagCheckpointEntries(tagFavorites, scrapers, checkpoints);
  assert.equal(tagEntries.length, 1);
  assert.equal(tagEntries[0].sections.length, 2);
  assert.deepEqual(tagEntries[0].sections.map((section) => section.checkpoints[0].id), ["tag-a", "tag-b"]);
});

test("scraper reset leaves tag checkpoints untouched", () => {
  const target = { kind: "scraper", scraperId: "source-a" };
  assert.equal(matchesScraperLatestCheckpointResetTarget(checkpoints[0], target), true);
  assert.equal(matchesScraperLatestCheckpointResetTarget(checkpoints[2], target), false);
});

test("tag and nested source resets target every language variant in their exact scope", () => {
  const tagTarget = buildTagCheckpointEntries(tagFavorites, scrapers, checkpoints)[0].target;
  assert.equal(matchesScraperLatestCheckpointResetTarget(checkpoints[2], tagTarget), true);
  assert.equal(matchesScraperLatestCheckpointResetTarget(checkpoints[3], tagTarget), true);
  assert.equal(matchesScraperLatestCheckpointResetTarget(checkpoints[0], tagTarget), false);

  const sourceTarget = buildTagCheckpointEntries(tagFavorites, scrapers, checkpoints)[0].sections[0].target;
  assert.equal(matchesScraperLatestCheckpointResetTarget(checkpoints[2], sourceTarget), true);
  assert.equal(matchesScraperLatestCheckpointResetTarget(checkpoints[3], sourceTarget), false);

  const scraperSectionTarget = buildScraperCheckpointEntries(scrapers, checkpoints)[0].sections[0].target;
  assert.equal(matchesScraperLatestCheckpointResetTarget(checkpoints[0], scraperSectionTarget), true);
  assert.equal(matchesScraperLatestCheckpointResetTarget(checkpoints[1], scraperSectionTarget), true);
  assert.equal(matchesScraperLatestCheckpointResetTarget(checkpoints[2], scraperSectionTarget), false);
});
