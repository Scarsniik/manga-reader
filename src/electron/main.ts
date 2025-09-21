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
            preload: path.join(basePath, 'dist', 'preload.js'),
            contextIsolation: true,
            webSecurity: false,
            sandbox: false,
        },
    });


    if (app.isPackaged) {
        // En production, charge le build Vite dans dist/renderer (chemin absolu, compatible asar et portable)
        const indexPath = path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');
        mainWindow.loadFile(indexPath);
    } else {
        // En dev, charge le serveur Vite
        const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
        mainWindow.loadURL(devServerUrl);
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Ouvre DevTools au démarrage pour debug
    mainWindow.webContents.openDevTools();
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