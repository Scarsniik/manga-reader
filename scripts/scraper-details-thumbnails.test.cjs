const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const esbuild = require("esbuild");
const { DOMParser } = require("linkedom");

global.DOMParser = DOMParser;

const source = `
  export {
    autoLoadInitialScraperDetailsThumbnails,
    shouldAutoLoadScraperDetailsThumbnails,
  } from "@/renderer/utils/scraperDetailsThumbnails";
`;
const built = esbuild.buildSync({
  stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "scraper-details-thumbnails-test.ts" },
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
  autoLoadInitialScraperDetailsThumbnails,
  shouldAutoLoadScraperDetailsThumbnails,
} = bundledModule.exports;

const createDetails = (overrides = {}) => ({
  requestedUrl: "https://example.test/manga/1",
  authors: [],
  authorUrls: [],
  tags: [],
  tagUrls: [],
  sources: [],
  sourceUrls: [],
  thumbnails: [],
  languageCodes: [],
  derivedValues: {},
  ...overrides,
});

test("empty thumbnails with a continuation URL are eligible for automatic loading", () => {
  assert.equal(shouldAutoLoadScraperDetailsThumbnails(createDetails()), false);
  assert.equal(shouldAutoLoadScraperDetailsThumbnails(createDetails({
    thumbnailsNextPageUrl: "https://example.test/thumbs/1",
  })), true);
  assert.equal(shouldAutoLoadScraperDetailsThumbnails(createDetails({
    thumbnails: [{ kind: "image", url: "https://cdn.test/1.jpg" }],
    thumbnailsNextPageUrl: "https://example.test/thumbs/2",
  })), false);
});

test("automatic loading fetches the first external thumbnail page once", async () => {
  const requestedUrls = [];
  const details = createDetails({
    thumbnailsNextPageUrl: "https://example.test/thumbs/1",
  });
  const result = await autoLoadInitialScraperDetailsThumbnails({
    scraper: { baseUrl: "https://example.test" },
    details,
    detailsConfig: {
      thumbnailsMode: "image",
      thumbnailsSelector: { kind: "css", value: "img.thumb@src" },
      thumbnailsNextPageSelector: { kind: "css", value: "a.next@href" },
    },
    pagesConfig: null,
    fetchDocument: async ({ targetUrl }) => {
      requestedUrls.push(targetUrl);
      return {
        ok: true,
        requestedUrl: targetUrl,
        finalUrl: targetUrl,
        html: `
          <img class="thumb" src="/images/1.jpg">
          <img class="thumb" src="/images/2.jpg">
          <a class="next" href="?page=2">Next</a>
        `,
      };
    },
  });

  assert.deepEqual(requestedUrls, ["https://example.test/thumbs/1"]);
  assert.deepEqual(result.thumbnails, [
    { kind: "image", url: "https://example.test/images/1.jpg" },
    { kind: "image", url: "https://example.test/images/2.jpg" },
  ]);
  assert.equal(result.thumbnailsNextPageUrl, "https://example.test/thumbs/1?page=2");
});
