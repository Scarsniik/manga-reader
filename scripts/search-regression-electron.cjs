const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const configPath = process.argv[process.argv.length - 1];
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

app.setPath("userData", config.userDataDir);

const readJson = (filePath, fallback) => {
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

const stableRequest = (request) => ({
  scraperId: request?.scraperId ?? null,
  baseUrl: request?.baseUrl ?? "",
  targetUrl: request?.targetUrl ?? "",
  requestConfig: request?.requestConfig ?? null,
  validateImage: request?.validateImage === true,
});

const requestKey = (request) => crypto
  .createHash("sha256")
  .update(JSON.stringify(stableRequest(request)))
  .digest("hex");

const responseCache = new Map();
const responseInFlight = new Map();
const requestMetrics = [];

const loadCachedResponse = (key) => {
  if (responseCache.has(key)) return responseCache.get(key);
  const filePath = path.join(config.responseCacheDir, `${key}.json`);
  const cached = readJson(filePath, null);
  if (cached) responseCache.set(key, cached);
  return cached;
};

const saveCachedResponse = (key, response) => {
  responseCache.set(key, response);
  writeJson(path.join(config.responseCacheDir, `${key}.json`), response);
};

const getSnapshotPath = (name) => path.join(config.snapshotDataDir, name);

let mainWindow = null;
let runCompleted = false;

const finishRun = (payload) => {
  if (runCompleted) return;
  runCompleted = true;
  writeJson(config.outputPath, {
    ...payload,
    transport: {
      mode: config.transportMode,
      requestCount: requestMetrics.length,
      cacheHits: requestMetrics.filter((item) => item.cacheHit).length,
      totalRequestMs: requestMetrics.reduce((sum, item) => sum + item.elapsedMs, 0),
      requests: requestMetrics,
    },
  });
  setTimeout(() => app.quit(), 50);
};

app.whenReady().then(() => {
  const { fetchScraperDocument } = require(path.join(
    config.repoRoot,
    "dist/electron/handlers/scrapers/documents.js",
  ));
  const { romanizeJapaneseTexts } = require(path.join(
    config.repoRoot,
    "dist/electron/handlers/japaneseRomanization.js",
  ));

  ipcMain.handle("search-corpus:get-plan", () => readJson(config.planPath, { cases: [], probes: [] }));
  ipcMain.handle("search-corpus:get-view-history", () => (
    readJson(getSnapshotPath("scraper-view-history.json"), [])
  ));
  ipcMain.handle("search-corpus:get-latest-checkpoints", (_event, scraperId) => {
    const checkpoints = readJson(getSnapshotPath("scraper-latest-checkpoints.json"), []);
    return scraperId
      ? checkpoints.filter((checkpoint) => checkpoint.scraperId === scraperId)
      : checkpoints;
  });
  ipcMain.handle("search-corpus:save-latest-checkpoint", (_event, request) => ({
    ...request,
    id: `corpus:${request.scraperId}:${request.module}:${request.query ?? ""}`,
    updatedAt: new Date().toISOString(),
  }));
  ipcMain.handle("search-corpus:get-author-cache", (_event, favoriteId) => (
    readJson(path.join(config.snapshotDataDir, "scraper-author-favorite-cache", `${favoriteId}.json`), null)
  ));
  ipcMain.handle("search-corpus:romanize", (_event, request) => romanizeJapaneseTexts(request));
  ipcMain.handle("search-corpus:fetch-document", async (event, request) => {
    const key = requestKey(request);
    const startedAt = Date.now();
    const cached = loadCachedResponse(key);
    if (cached) {
      requestMetrics.push({ key, cacheHit: true, elapsedMs: Date.now() - startedAt, request: stableRequest(request) });
      return cached;
    }
    if (config.transportMode === "replay") {
      throw new Error(`Réponse absente du corpus pour ${request?.targetUrl ?? key}`);
    }
    if (!responseInFlight.has(key)) {
      responseInFlight.set(key, fetchScraperDocument(event, request)
        .then((response) => {
          saveCachedResponse(key, response);
          return response;
        })
        .finally(() => responseInFlight.delete(key)));
    }
    const response = await responseInFlight.get(key);
    requestMetrics.push({ key, cacheHit: false, elapsedMs: Date.now() - startedAt, request: stableRequest(request) });
    return response;
  });
  ipcMain.handle("search-corpus:complete", (_event, payload) => {
    finishRun(payload);
    return true;
  });

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(config.repoRoot, "scripts/search-regression-preload.cjs"),
    },
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    finishRun({ ok: false, error: `Renderer interrompu: ${details.reason}` });
  });
  mainWindow.loadFile(config.runnerHtmlPath);
});

app.on("window-all-closed", () => {
  if (!runCompleted) finishRun({ ok: false, error: "La fenêtre de test a été fermée avant la fin." });
});
