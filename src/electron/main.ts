import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path from 'path';
import fs from 'fs';

// Ensure IPC handlers (links, mangas, count-pages...) are registered
import './ipc';

let mainWindow: BrowserWindow | null;

const createWindow = () => {
    const basePath = app.getAppPath();

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            // Use the compiled preload in `dist` during development and when packaged.
            preload: path.join(basePath, 'dist', 'electron', 'preload.js'),
            contextIsolation: true,
            // Allow loading local file resources (file://) from pages served by the
            // Vite dev server while in development. This relaxes same-origin/CORS
            // checks and should NOT be enabled in production for security reasons.
            webSecurity: app.isPackaged ? true : false,
        },
    });

    // In development, allow the Vite dev server URL to be injected via env (handles dynamic ports)
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
    mainWindow.loadURL(devServerUrl);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

// Register a custom protocol to serve local files from the filesystem.
// This allows the renderer to use URLs like `local://D:/path/to/file.jpg` safely
// without disabling webSecurity. We register it when the app is ready.
app.whenReady().then(() => {
    protocol.registerFileProtocol('local', (request, callback) => {
        try {
            // request.url will be like 'local://D:/path/to/file.jpg' or
            // 'local:///D:/path/to/file.jpg' depending on usage. Strip the scheme
            // and decode the path.
            let url = request.url.replace(/^local:\/\//, '');
            // If there is a leading slash on Windows (e.g. /D:/...), remove it.
            if (url.startsWith('/')) url = url.slice(1);
            const filePath = path.normalize(decodeURI(url));
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