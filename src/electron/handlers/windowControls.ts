import { app, BrowserWindow, IpcMainInvokeEvent } from "electron";

export type WindowState = {
    isFocused: boolean;
    isFullScreen: boolean;
    isMaximized: boolean;
    isMinimized: boolean;
};

export type AppRuntimeInfo = {
    isDev: boolean;
    isPackaged: boolean;
    version: string;
};

const getEventWindow = (event: IpcMainInvokeEvent): BrowserWindow | null => (
    BrowserWindow.fromWebContents(event.sender)
);

export const getWindowStateForWindow = (window: BrowserWindow): WindowState => ({
    isFocused: window.isFocused(),
    isFullScreen: window.isFullScreen(),
    isMaximized: window.isMaximized(),
    isMinimized: window.isMinimized(),
});

export const emitWindowState = (window: BrowserWindow): void => {
    if (window.isDestroyed()) {
        return;
    }

    window.webContents.send("window-state-changed", getWindowStateForWindow(window));
};

export const attachWindowStateListeners = (window: BrowserWindow): void => {
    const emitCurrentState = () => emitWindowState(window);

    window.on("maximize", emitCurrentState);
    window.on("unmaximize", emitCurrentState);
    window.on("minimize", emitCurrentState);
    window.on("restore", emitCurrentState);
    window.on("enter-full-screen", emitCurrentState);
    window.on("leave-full-screen", emitCurrentState);
    window.on("focus", emitCurrentState);
    window.on("blur", emitCurrentState);
};

export const getWindowState = (event: IpcMainInvokeEvent): WindowState | null => {
    const window = getEventWindow(event);
    return window ? getWindowStateForWindow(window) : null;
};

export const minimizeWindow = (event: IpcMainInvokeEvent): WindowState | null => {
    const window = getEventWindow(event);
    if (!window) {
        return null;
    }

    window.minimize();
    return getWindowStateForWindow(window);
};

export const toggleMaximizeWindow = (event: IpcMainInvokeEvent): WindowState | null => {
    const window = getEventWindow(event);
    if (!window) {
        return null;
    }

    if (window.isMaximized()) {
        window.unmaximize();
    } else {
        window.maximize();
    }

    return getWindowStateForWindow(window);
};

export const closeWindow = (event: IpcMainInvokeEvent): void => {
    const window = getEventWindow(event);
    window?.close();
};

export const toggleDevTools = (event: IpcMainInvokeEvent): boolean => {
    if (app.isPackaged) {
        return false;
    }

    const window = getEventWindow(event);
    if (!window) {
        return false;
    }

    if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
        return false;
    }

    window.webContents.openDevTools();
    return true;
};

export const getAppRuntimeInfo = (): AppRuntimeInfo => ({
    isDev: !app.isPackaged,
    isPackaged: app.isPackaged,
    version: app.getVersion(),
});
