const path = require("node:path");
const esbuild = require("esbuild");

const rootDirectory = path.resolve(__dirname, "..");

esbuild.buildSync({
  entryPoints: [path.join(rootDirectory, "src/electron/workers/searchExecutionWorker.ts")],
  outfile: path.join(rootDirectory, "dist/electron/workers/searchExecutionWorker.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  alias: {
    "@": path.join(rootDirectory, "src"),
  },
  external: [
    "electron",
    "kuroshiro",
    "kuroshiro-analyzer-kuromoji",
    "sharp",
  ],
});

esbuild.buildSync({
  entryPoints: [path.join(rootDirectory, "src/electron/workers/multiSearchMergeWorker.ts")],
  outfile: path.join(rootDirectory, "dist/electron/workers/multiSearchMergeWorker.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  alias: {
    "@": path.join(rootDirectory, "src"),
  },
});

esbuild.buildSync({
  entryPoints: [path.join(rootDirectory, "src/electron/workers/potentialMatchWorker.ts")],
  outfile: path.join(rootDirectory, "dist/electron/workers/potentialMatchWorker.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  alias: {
    "@": path.join(rootDirectory, "src"),
  },
  external: [
    "kuroshiro",
    "kuroshiro-analyzer-kuromoji",
  ],
});
