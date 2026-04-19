import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { prewarmOcrEngine } from './handlers/ocr/index';
import { attachWindowStateListeners } from "./handlers/windowControls";
import { resolveLocalProtocolPath } from './utils/localProtocol';

// Ensure IPC handlers (links, mangas, count-pages...) are registered
import './ipc';

let mainWindow: BrowserWindow | null;

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

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        backgroundColor: '#121212',
        frame: false,
        webPreferences: {
            // Use the compiled preload in `dist` during development and when packaged.
            preload: path.join(basePath, 'dist', 'preload.js'),
            contextIsolation: true,
            webSecurity: false,
            sandbox: false,
        },
        autoHideMenuBar: app.isPackaged, // Cache la barre de menu en prod
    });

    attachWindowStateListeners(mainWindow);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void openExternalNavigation(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        const currentUrl = mainWindow?.webContents.getURL() ?? '';
        if (!isHttpUrl(url) || isSameWindowOrigin(url, currentUrl)) {
            return;
        }

        event.preventDefault();
        void openExternalNavigation(url);
    });

    if (app.isPackaged) {
        // En production, charge le build Vite dans dist/renderer (chemin absolu, compatible asar et portable)
        const indexPath = path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');
        mainWindow.loadFile(indexPath);
        // Supprime la barre de menu native pour un vrai mode prod
        mainWindow.setMenuBarVisibility(false);
    } else {
        // En dev, charge le serveur Vite
        const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
        mainWindow.loadURL(devServerUrl);
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Ouvre DevTools seulement en développement
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    } else {
        // En production, bloque toute ouverture des DevTools
        mainWindow.webContents.on('before-input-event', (event, input) => {
            // Bloque Ctrl+Shift+I, F12
            if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
                event.preventDefault();
            }
        });
        // Bloque l'ouverture via menu contextuel
        mainWindow.webContents.on('context-menu', (e) => {
            e.preventDefault();
        });
        // Bloque toute ouverture par code
        mainWindow.webContents.on('devtools-opened', () => {
            if (mainWindow) {
                mainWindow.webContents.closeDevTools();
            }
        });
    }
};

// Register a custom protocol to serve local files from the filesystem.
// This allows the renderer to use URLs like `local://D:/path/to/file.jpg` safely
// without disabling webSecurity. We register it when the app is ready.
app.whenReady().then(() => {
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.example.mangahelper');
    }

    protocol.registerFileProtocol('local', (request, callback) => {
        try {
            const filePath = resolveLocalProtocolPath(request.url);
            callback({ path: filePath });
        } catch (e) {
            console.error('registerFileProtocol(local) error:', e);
            callback({ error: -6 }); // FILE_NOT_FOUND
        }
    });

    // Ensure Electron uses a writable userData directory to avoid disk cache permission issues
    try {
    const localAppData = process.env.LOCALAPPDATA || app.getPath('appData');
    const customUserData = path.join(localAppData, 'manga-helper-userdata');
        if (!fs.existsSync(customUserData)) {
            fs.mkdirSync(customUserData, { recursive: true });
        }
        app.setPath('userData', customUserData);
    } catch (e) {
        console.warn('Could not set custom userData path:', e);
    }

    createWindow();
    startOcrPrewarmInBackground();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC handlers are defined in src/electron/ipc.ts (imported above)
