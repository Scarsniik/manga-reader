import "./env";
import { app, BrowserWindow, protocol, shell } from "electron";
import { existsSync, unwatchFile, watchFile } from "node:fs";
import path from "path";
import { configureApplicationIdentity } from "./appIdentity";
import { attachWindowStateListeners } from "./handlers/windowControls";
import { usesRendererBuild } from "./rendererMode";
import { resolveLocalProtocolPath } from "./utils/localProtocol";

let mainWindow: BrowserWindow | null;
let backgroundSearchWorkerWindow: BrowserWindow | null = null;
let backgroundSearchWorkerStartupTimer: NodeJS.Timeout | null = null;
let startupWindowShowTimer: NodeJS.Timeout | null = null;
let developmentRendererReadyPath: string | null = null;
let developmentRendererReloadTimer: NodeJS.Timeout | null = null;
let applicationIsQuitting = false;

// Configure identity and profile paths before Chromium initializes session/cache storage.
configureApplicationIdentity();

const watchDevelopmentRenderer = (rendererDirectoryPath: string) => {
    if (app.isPackaged || process.env.ELECTRON_DEV_RENDERER_BUILD !== "1" || developmentRendererReadyPath) {
        return;
    }

    developmentRendererReadyPath = path.join(rendererDirectoryPath, ".dev-ready");
    watchFile(developmentRendererReadyPath, { interval: 200, persistent: false }, (current, previous) => {
        if (current.mtimeMs <= 0 || current.mtimeMs === previous.mtimeMs) {
            return;
        }

        if (developmentRendererReloadTimer) {
            clearTimeout(developmentRendererReloadTimer);
        }

        developmentRendererReloadTimer = setTimeout(() => {
            developmentRendererReloadTimer = null;
            if (!existsSync(path.join(rendererDirectoryPath, "index.html"))) {
                return;
            }

            console.info("[dev] Renderer rebuilt; reloading application windows");
            const rendererWindows = [mainWindow, backgroundSearchWorkerWindow];
            for (const rendererWindow of rendererWindows) {
                if (rendererWindow && !rendererWindow.isDestroyed()) {
                    rendererWindow.webContents.reloadIgnoringCache();
                }
            }
        }, 250);
    });
};

const showMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return;
    }

    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }

    if (!mainWindow.isVisible()) {
        mainWindow.show();
    }

    mainWindow.focus();
};

const isHttpUrl = (url: string): boolean => {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
        return false;
    }
};

const isSameWindowOrigin = (targetUrl: string, windowUrl: string): boolean => {
    try {
        return new URL(targetUrl).origin === new URL(windowUrl).origin;
    } catch {
        return false;
    }
};

const openExternalNavigation = async (url: string) => {
    if (!isHttpUrl(url)) {
        return false;
    }

    await shell.openExternal(url);
    return true;
};

const startOcrPrewarmInBackground = () => {
    if (!app.isPackaged) {
        console.info("[ocr] Engine prewarm skipped in development");
        return;
    }

    setTimeout(() => {
        const { prewarmOcrEngine } = require("./handlers/ocr/index") as typeof import("./handlers/ocr/index");

        void prewarmOcrEngine()
            .then(() => {
                console.info('[ocr] Engine prewarmed during app startup');
            })
            .catch((error) => {
                console.warn('[ocr] Engine prewarm skipped or failed during startup:', error);
            });
    }, 250);
};

const createBackgroundSearchWorkerWindow = () => {
    if (backgroundSearchWorkerWindow && !backgroundSearchWorkerWindow.isDestroyed()) {
        return backgroundSearchWorkerWindow;
    }

    const basePath = app.getAppPath();
    const preloadPath = path.join(basePath, "dist", "electron", "preload.js");
    const packagedIndexPath = path.join(app.getAppPath(), "dist", "renderer", "index.html");
    const workerWindow = new BrowserWindow({
        width: 320,
        height: 240,
        show: false,
        skipTaskbar: true,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            webSecurity: false,
            sandbox: false,
            backgroundThrottling: false,
        },
    });
    backgroundSearchWorkerWindow = workerWindow;
    let workerCrashed = false;
    workerWindow.setMenuBarVisibility(false);
    workerWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    workerWindow.webContents.on("will-navigate", (event, targetUrl) => {
        const currentUrl = workerWindow.webContents.getURL();
        if (!isSameWindowOrigin(targetUrl, currentUrl)) event.preventDefault();
    });
    workerWindow.webContents.on("render-process-gone", (_event, details) => {
        console.error("backgroundSearchWorkerWindow render-process-gone", details);
        if (workerCrashed || applicationIsQuitting) return;
        workerCrashed = true;
        const backgroundSearch = require("./handlers/backgroundSearch/service") as typeof import("./handlers/backgroundSearch/service");
        void backgroundSearch.requeueRunningBackgroundSearches()
            .catch((error) => {
                console.error("Failed to requeue searches after worker crash", error);
            })
            .finally(() => {
                if (!workerWindow.isDestroyed()) workerWindow.destroy();
            });
    });
    workerWindow.on("closed", () => {
        if (backgroundSearchWorkerWindow === workerWindow) {
            backgroundSearchWorkerWindow = null;
        }
        if (!applicationIsQuitting && mainWindow && !mainWindow.isDestroyed()) {
            setTimeout(() => createBackgroundSearchWorkerWindow(), 500);
        }
    });

    const loadWorkerApplication = () => {
        if (workerWindow.isDestroyed()) return;
        if (usesRendererBuild()) {
            void workerWindow.loadFile(packagedIndexPath, { hash: "/background-search-runner" });
        } else {
            const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:3000";
            void workerWindow.loadURL(`${devServerUrl}/#/background-search-runner`);
        }
    };
    workerWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        if (errorCode === -3 || applicationIsQuitting || workerWindow.isDestroyed()) return;
        console.error("backgroundSearchWorkerWindow did-fail-load", { errorCode, errorDescription });
        setTimeout(loadWorkerApplication, 1000);
    });
    loadWorkerApplication();

    return workerWindow;
};

const scheduleBackgroundSearchWorkerWindow = () => {
    if (backgroundSearchWorkerWindow || backgroundSearchWorkerStartupTimer) {
        return;
    }

    const startupDelayMs = app.isPackaged ? 0 : 5000;
    backgroundSearchWorkerStartupTimer = setTimeout(() => {
        backgroundSearchWorkerStartupTimer = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            createBackgroundSearchWorkerWindow();
        }
    }, startupDelayMs);
};

const createWindow = () => {
    const basePath = app.getAppPath();
    const preloadPath = path.join(basePath, "dist", "electron", "preload.js");
    const packagedIndexPath = path.join(app.getAppPath(), "dist", "renderer", "index.html");

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        backgroundColor: "#121212",
        frame: false,
        show: false,
        webPreferences: {
            // Use the compiled preload in `dist` during development and when packaged.
            preload: preloadPath,
            contextIsolation: true,
            webSecurity: false,
            sandbox: false,
            // Keep the hidden startup renderer responsive while waiting for ready-to-show.
            backgroundThrottling: app.isPackaged,
        },
        autoHideMenuBar: app.isPackaged, // Cache la barre de menu en prod
    });

    attachWindowStateListeners(mainWindow);

    mainWindow.once("ready-to-show", () => {
        if (startupWindowShowTimer) {
            clearTimeout(startupWindowShowTimer);
            startupWindowShowTimer = null;
        }

        showMainWindow();
        scheduleBackgroundSearchWorkerWindow();
    });

    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
        console.error("mainWindow did-fail-load", {
            errorCode,
            errorDescription,
            validatedUrl,
        });
        showMainWindow();
    });

    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        console.error("mainWindow render-process-gone", details);
        showMainWindow();
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void openExternalNavigation(url);
        return { action: "deny" };
    });

    mainWindow.webContents.on("will-navigate", (event, url) => {
        const currentUrl = mainWindow?.webContents.getURL() ?? "";
        if (!isHttpUrl(url) || isSameWindowOrigin(url, currentUrl)) {
            return;
        }

        event.preventDefault();
        void openExternalNavigation(url);
    });

    if (usesRendererBuild()) {
        // Load the Vite bundle from disk in production and in the fast development workflow.
        void mainWindow.loadFile(packagedIndexPath);
        if (app.isPackaged) {
            mainWindow.setMenuBarVisibility(false);
        } else {
            watchDevelopmentRenderer(path.dirname(packagedIndexPath));
        }
    } else {
        // Keep direct Vite server support for standalone renderer debugging.
        const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:3000";
        void mainWindow.loadURL(devServerUrl);
    }

    mainWindow.on("closed", () => {
        if (startupWindowShowTimer) {
            clearTimeout(startupWindowShowTimer);
            startupWindowShowTimer = null;
        }
        mainWindow = null;
        if (backgroundSearchWorkerStartupTimer) {
            clearTimeout(backgroundSearchWorkerStartupTimer);
            backgroundSearchWorkerStartupTimer = null;
        }
        if (backgroundSearchWorkerWindow && !backgroundSearchWorkerWindow.isDestroyed()) {
            backgroundSearchWorkerWindow.destroy();
        }
    });

    startupWindowShowTimer = setTimeout(() => {
        startupWindowShowTimer = null;
        showMainWindow();
        scheduleBackgroundSearchWorkerWindow();
    }, app.isPackaged ? 4000 : 15000);

    if (!app.isPackaged) {
        if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
            mainWindow.webContents.openDevTools();
        }
    } else {
        // En production, bloque toute ouverture des DevTools
        mainWindow.webContents.on("before-input-event", (event, input) => {
            // Bloque Ctrl+Shift+I, F12
            if ((input.control && input.shift && input.key.toLowerCase() === "i") || input.key === "F12") {
                event.preventDefault();
            }
        });
        // Bloque l'ouverture via menu contextuel
        mainWindow.webContents.on("context-menu", (e) => {
            e.preventDefault();
        });
        // Bloque toute ouverture par code
        mainWindow.webContents.on("devtools-opened", () => {
            if (mainWindow) {
                mainWindow.webContents.closeDevTools();
            }
        });
    }
};

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow === null) {
            createWindow();
            return;
        }

        showMainWindow();
    });
}

// Register a custom protocol to serve local files from the filesystem.
// This allows the renderer to use URLs like `local://D:/path/to/file.jpg` safely
// without disabling webSecurity. We register it when the app is ready.
app.whenReady()
    .then(() => {
        const appUpdate = require("./handlers/appUpdate") as typeof import("./handlers/appUpdate");

        protocol.registerFileProtocol("local", (request, callback) => {
            try {
                const filePath = resolveLocalProtocolPath(request.url);
                callback({ path: filePath });
            } catch (error) {
                console.error("registerFileProtocol(local) error:", error);
                callback({ error: -6 }); // FILE_NOT_FOUND
            }
        });
        const remoteThumbnails = require("./handlers/remoteThumbnails") as typeof import("./handlers/remoteThumbnails");
        remoteThumbnails.registerRemoteThumbnailProtocol();
        remoteThumbnails.registerRemoteReaderImageProtocol();

        const collectionsDatabase = require("./database/connection") as typeof import("./database/connection");
        collectionsDatabase.getCollectionsDatabase();
        require("./ipc");
        void appUpdate.initializeAppUpdate();

        createWindow();
        appUpdate.scheduleStartupUpdateCheck(mainWindow);
        startOcrPrewarmInBackground();
    })
    .catch((error) => {
        throw error;
    });

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", () => {
    applicationIsQuitting = true;
    if (developmentRendererReloadTimer) {
        clearTimeout(developmentRendererReloadTimer);
        developmentRendererReloadTimer = null;
    }
    if (developmentRendererReadyPath) {
        unwatchFile(developmentRendererReadyPath);
        developmentRendererReadyPath = null;
    }
    const collectionsDatabase = require("./database/connection") as typeof import("./database/connection");
    collectionsDatabase.closeCollectionsDatabase();
});

app.on("activate", () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC handlers are defined in src/electron/ipc.ts and loaded after userData is configured.
