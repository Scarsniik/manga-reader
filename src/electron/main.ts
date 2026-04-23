import { app, BrowserWindow, protocol, shell } from "electron";
import path from "path";
import { configureApplicationIdentity } from "./appIdentity";
import { attachWindowStateListeners } from "./handlers/windowControls";
import { resolveLocalProtocolPath } from "./utils/localProtocol";

let mainWindow: BrowserWindow | null;
let startupWindowShowTimer: NodeJS.Timeout | null = null;

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

const createWindow = () => {
    const basePath = app.getAppPath();
    const preloadPath = path.join(basePath, "dist", "preload.js");
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

    if (app.isPackaged) {
        // En production, charge le build Vite dans dist/renderer (chemin absolu, compatible asar et portable)
        void mainWindow.loadFile(packagedIndexPath);
        // Supprime la barre de menu native pour un vrai mode prod
        mainWindow.setMenuBarVisibility(false);
    } else {
        // En dev, charge le serveur Vite
        const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:3000";
        void mainWindow.loadURL(devServerUrl);
    }

    mainWindow.on("closed", () => {
        if (startupWindowShowTimer) {
            clearTimeout(startupWindowShowTimer);
            startupWindowShowTimer = null;
        }
        mainWindow = null;
    });

    startupWindowShowTimer = setTimeout(() => {
        startupWindowShowTimer = null;
        showMainWindow();
    }, 4000);

    // Ouvre DevTools seulement en développement
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
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
        configureApplicationIdentity();

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

app.on("activate", () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC handlers are defined in src/electron/ipc.ts and loaded after userData is configured.
