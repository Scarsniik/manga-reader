#!/usr/bin/env node

const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");
const { isDeepStrictEqual } = require("util");

const repoRoot = path.resolve(__dirname, "..");
const defaultCorpusDir = path.join(repoRoot, "temp", "search-regression-corpus");
const args = process.argv.slice(2);

const readOption = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : fallback;
};

const phase = readOption("--phase", "baseline");
const transportMode = readOption("--transport", "live");
const corpusDir = path.resolve(readOption("--dir", defaultCorpusDir));
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const sourceDataDir = path.join(localAppData, "scaramanga-userdata", "data");
const planPath = path.join(corpusDir, "plan.json");
const snapshotDataDir = path.join(corpusDir, "snapshot-data");
const runtimeDir = path.join(corpusDir, "runtime");
const responseCacheDir = path.join(corpusDir, "responses", transportMode === "replay" ? "baseline" : phase);
const outputPath = path.join(corpusDir, "results", `${phase}-${transportMode}.json`);

const VOLATILE_RESULT_KEYS = new Set([
  "checkedAt",
  "createdAt",
  "discoveredByStepIds",
  "durationMs",
  "elapsedMs",
  "generatedAt",
  "lastProgress",
  "snapshotCount",
  "transport",
  "trace",
  "updatedAt",
]);

const readJson = (filePath, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const canonicalizeResult = (value) => {
  if (Array.isArray(value)) return value.map(canonicalizeResult);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !VOLATILE_RESULT_KEYS.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalizeResult(item)]));
};

const compareWithBaseline = (candidateOutput) => {
  if (phase === "baseline") return null;
  const baselinePath = path.join(corpusDir, "results", "baseline-live.json");
  const baseline = readJson(baselinePath, null);
  if (!baseline) return { ok: false, error: `Référence introuvable : ${baselinePath}` };
  const byId = (items) => new Map((items || []).map((item) => [item.id, item]));
  const compareGroup = (name) => {
    const baselineItems = byId(baseline[name]);
    const candidateItems = byId(candidateOutput[name]);
    return [...new Set([...baselineItems.keys(), ...candidateItems.keys()])].sort().map((id) => ({
      id,
      equal: isDeepStrictEqual(
        canonicalizeResult(baselineItems.get(id)),
        canonicalizeResult(candidateItems.get(id)),
      ),
    }));
  };
  const cases = compareGroup("cases");
  const probes = compareGroup("probes");
  return {
    ok: [...cases, ...probes].every((item) => item.equal),
    baselinePath,
    candidatePath: outputPath,
    cases,
    probes,
  };
};

const copyIfExists = (source, target) => {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
};

const latestCompletedJobByKind = (jobs, kind) => jobs
  .filter((job) => job.kind === kind && job.status === "completed" && job.inputAvailable)
  .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0];

const selectFirstFavoriteGroup = (sources, maximum = 3) => {
  const firstFavoriteId = sources.find((source) => source.favoriteId)?.favoriteId;
  const grouped = firstFavoriteId
    ? sources.filter((source) => source.favoriteId === firstFavoriteId)
    : sources;
  return grouped.slice(0, maximum);
};

const selectTagGroups = (sources) => {
  const selected = [];
  const favoriteIds = [];
  for (const source of sources) {
    const group = source.favoriteId || source.resultTag || source.id;
    if (!favoriteIds.includes(group)) favoriteIds.push(group);
    if (favoriteIds.indexOf(group) >= 2) continue;
    if (selected.filter((item) => (item.favoriteId || item.resultTag || item.id) === group).length < 2) {
      selected.push(source);
    }
  }
  return selected;
};

const preparePlan = () => {
  const jobs = readJson(path.join(sourceDataDir, "background-searches.json"), []);
  const inputDir = path.join(sourceDataDir, "background-search-inputs");
  const kinds = [
    "multiSearch",
    "latestSources",
    "latestAuthors",
    "authorFavoriteRefresh",
    "mangaCorrespondence",
    "authorCorrespondence",
  ];
  const sourceJobs = {};
  const inputs = {};
  for (const kind of kinds) {
    const job = latestCompletedJobByKind(jobs, kind);
    if (!job) throw new Error(`Aucune recherche terminée disponible pour ${kind}.`);
    const input = readJson(path.join(inputDir, `${job.id}.json`));
    if (!input) throw new Error(`Entrée introuvable pour ${kind} (${job.id}).`);
    sourceJobs[kind] = job.id;
    inputs[kind] = input;
  }

  const multiScrapers = inputs.multiSearch.scrapers.slice(0, 3);
  const latestSourceSelection = selectTagGroups(inputs.latestSources.sources);
  const latestAuthorSelection = selectFirstFavoriteGroup(inputs.latestAuthors.sources, 3);
  const refreshSelection = selectFirstFavoriteGroup(inputs.authorFavoriteRefresh.sources, 3);
  const correspondenceScrapers = inputs.mangaCorrespondence.scrapers.slice(0, 3);
  const authorCorrespondenceScrapers = inputs.authorCorrespondence.scrapers.slice(0, 3);

  const boundedInputs = {
    multiSearch: {
      ...inputs.multiSearch,
      scrapers: multiScrapers,
      maxPages: 1,
      scrapeDetailsWithCards: true,
    },
    latestSources: {
      ...inputs.latestSources,
      sources: latestSourceSelection,
      maxPages: 2,
      resultLimit: 4,
      tagResultLimit: 4,
      searchMode: "deep",
      performanceReportsEnabled: false,
    },
    latestAuthors: {
      ...inputs.latestAuthors,
      sources: latestAuthorSelection,
      maxPages: 1,
      resultLimit: 0,
      selectedFavoriteIds: [...new Set(latestAuthorSelection.map((source) => source.favoriteId).filter(Boolean))],
      useAuthorFavoriteCache: false,
      performanceReportsEnabled: false,
    },
    authorFavoriteRefresh: {
      ...inputs.authorFavoriteRefresh,
      sources: refreshSelection,
      maxPages: 1,
    },
    scraperAuthor: {
      ...inputs.authorFavoriteRefresh,
      sources: refreshSelection.slice(0, 1),
      maxPages: 1,
      favoriteId: undefined,
      favoriteUpdatedAt: undefined,
    },
    mangaCorrespondence: {
      ...inputs.mangaCorrespondence,
      scrapers: correspondenceScrapers,
      scraperFilterValues: [],
      maxPages: 1,
      scrapingConcurrency: Math.min(6, Number(inputs.mangaCorrespondence.scrapingConcurrency) || 2),
    },
    authorCorrespondence: {
      ...inputs.authorCorrespondence,
      scrapers: authorCorrespondenceScrapers,
      scraperFilterValues: [],
      maxPages: 1,
      authorPageCount: 1,
      scrapingConcurrency: Math.min(6, Number(inputs.authorCorrespondence.scrapingConcurrency) || 2),
    },
  };

  const scrapers = readJson(path.join(sourceDataDir, "scrapers.json"), []);
  const homepageScraper = scrapers.find((scraper) => scraper.features?.some((feature) => (
    feature.kind === "homepage" && feature.status !== "not_configured" && feature.config
  )));
  const tagSource = latestSourceSelection[0];
  const authorSource = latestAuthorSelection[0];

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sourceJobs,
    cases: Object.entries(boundedInputs).map(([kind, input]) => ({ id: kind, kind, input })),
    probes: [
      homepageScraper && { id: "homepage-page", kind: "homepage", scraper: homepageScraper },
      multiScrapers[0] && {
        id: "search-page",
        kind: "search",
        scraper: multiScrapers[0],
        query: inputs.multiSearch.query,
      },
      authorSource && {
        id: "author-page",
        kind: "author",
        scraper: authorSource.scraper,
        query: authorSource.query,
      },
      tagSource && {
        id: "tag-page",
        kind: "tag",
        scraper: tagSource.scraper,
        query: tagSource.query,
      },
    ].filter(Boolean),
  };
};

const prepareSnapshots = () => {
  for (const name of [
    "params.json",
    "scrapers.json",
    "scraper-view-history.json",
    "scraper-latest-checkpoints.json",
  ]) copyIfExists(path.join(sourceDataDir, name), path.join(snapshotDataDir, name));

  const sourceCacheDir = path.join(sourceDataDir, "scraper-author-favorite-cache");
  if (fs.existsSync(sourceCacheDir)) {
    fs.mkdirSync(path.join(snapshotDataDir, "scraper-author-favorite-cache"), { recursive: true });
    for (const entry of fs.readdirSync(sourceCacheDir)) {
      copyIfExists(
        path.join(sourceCacheDir, entry),
        path.join(snapshotDataDir, "scraper-author-favorite-cache", entry),
      );
    }
  }

  const runtimeDataDir = path.join(runtimeDir, "user-data", "data");
  fs.mkdirSync(runtimeDataDir, { recursive: true });
  copyIfExists(path.join(snapshotDataDir, "params.json"), path.join(runtimeDataDir, "params.json"));
  copyIfExists(path.join(snapshotDataDir, "scrapers.json"), path.join(runtimeDataDir, "scrapers.json"));
};

const buildRunner = () => {
  fs.mkdirSync(runtimeDir, { recursive: true });
  esbuild.buildSync({
    entryPoints: [path.join(repoRoot, "scripts", "search-regression-runner.ts")],
    bundle: true,
    outfile: path.join(runtimeDir, "runner.js"),
    platform: "browser",
    format: "iife",
    target: "chrome138",
    tsconfig: path.join(repoRoot, "tsconfig.json"),
    absWorkingDir: repoRoot,
    logLevel: "warning",
  });
  fs.writeFileSync(
    path.join(runtimeDir, "runner.html"),
    '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'"><title>Search corpus</title></head><body><script src="runner.js"></script></body></html>',
    "utf8",
  );
};

const runCommand = (command, commandArgs, options = {}) => new Promise((resolve, reject) => {
  const child = childProcess.spawn(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  child.on("error", reject);
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} a quitté avec le code ${code}.`))));
});

const main = async () => {
  if (!fs.existsSync(planPath)) {
    writeJson(planPath, preparePlan());
    prepareSnapshots();
  } else if (!fs.existsSync(snapshotDataDir)) {
    prepareSnapshots();
  }

  await runCommand(process.execPath, [
    path.join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
    "--project",
    path.join(repoRoot, "tsconfig.electron.json"),
  ]);
  buildRunner();
  fs.mkdirSync(responseCacheDir, { recursive: true });

  const configPath = path.join(runtimeDir, `config-${phase}-${transportMode}.json`);
  writeJson(configPath, {
    repoRoot,
    planPath,
    snapshotDataDir,
    userDataDir: path.join(runtimeDir, "user-data"),
    responseCacheDir: transportMode === "replay"
      ? path.join(corpusDir, "responses", "baseline")
      : responseCacheDir,
    outputPath,
    transportMode,
    runnerHtmlPath: path.join(runtimeDir, "runner.html"),
  });

  const electronPath = require("electron");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  await runCommand(electronPath, [path.join(repoRoot, "scripts", "search-regression-electron.cjs"), configPath], { env });

  const output = readJson(outputPath, {});
  const succeeded = [
    ...(output.cases || []),
    ...(output.probes || []),
  ].filter((item) => item.ok).length;
  const total = (output.cases || []).length + (output.probes || []).length;
  process.stdout.write(`Corpus ${phase}/${transportMode}: ${succeeded}/${total} scénarios réussis.\n${outputPath}\n`);
  const comparison = compareWithBaseline(output);
  if (comparison) {
    const comparisonPath = path.join(corpusDir, "results", `${phase}-${transportMode}-comparison.json`);
    writeJson(comparisonPath, comparison);
    const equalCount = [...comparison.cases, ...comparison.probes].filter((item) => item.equal).length;
    process.stdout.write(`Comparaison fonctionnelle: ${equalCount}/${total} scénarios identiques.\n${comparisonPath}\n`);
  }
  if (!output.ok || comparison?.ok === false) process.exitCode = 2;
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
