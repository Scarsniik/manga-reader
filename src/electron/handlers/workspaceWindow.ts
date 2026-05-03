import { app, BrowserWindow, IpcMainInvokeEvent, shell } from "electron";
import path from "path";
import { attachWindowStateListeners } from "./windowControls";
import {
    attachWorkspaceWindowStatePersistence,
    getInitialWorkspaceWindowBounds,
} from "./workspaceWindowState";

type ScraperConfigWorkspaceTarget = {
    kind: "scraper.config";
    scraperId: string;
    title?: string;
};

type ScraperDetailsWorkspaceTarget = {
    kind: "scraper.details";
    scraperId: string;
    sourceUrl: string;
    title?: string;
};

type ScraperAuthorWorkspaceTarget = {
    kind: "scraper.author";
    scraperId: string;
    query: string;
    title?: string;
    templateContext?: Record<string, string | undefined>;
};

export type WorkspaceTarget =
    | ScraperConfigWorkspaceTarget
    | ScraperDetailsWorkspaceTarget
    | ScraperAuthorWorkspaceTarget;

let workspaceWindow: BrowserWindow | null = null;
const pendingTargets: WorkspaceTarget[] = [];

const isHttpUrl = (url: string): boolean => {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
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

const openExternalNavigation = async (url: string): Promise<boolean> => {
    if (!isHttpUrl(url)) {
        return false;
    }

    await shell.openExternal(url);
    return true;
};

const isTemplateContext = (value: unknown): value is Record<string, string | undefined> => {
    if (value === undefined) {
        return true;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every((entry) => entry === undefined || typeof entry === "string");
};

const isWorkspaceTarget = (value: unknown): value is WorkspaceTarget => {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Partial<WorkspaceTarget>;

    if (candidate.kind === "scraper.config") {
        return typeof candidate.scraperId === "string" && candidate.scraperId.trim().length > 0;
    }

    if (candidate.kind === "scraper.details") {
        return (
            typeof candidate.scraperId === "string"
            && candidate.scraperId.trim().length > 0
            && typeof candidate.sourceUrl === "string"
            && candidate.sourceUrl.trim().length > 0
        );
    }

    if (candidate.kind === "scraper.author") {
        return (
            typeof candidate.scraperId === "string"
            && candidate.scraperId.trim().length > 0
            && typeof candidate.query === "string"
            && candidate.query.trim().length > 0
            && isTemplateContext(candidate.templateContext)
        );
    }

    return false;
};

const sendWorkspaceTarget = (target: WorkspaceTarget): void => {
    if (!workspaceWindow || workspaceWindow.isDestroyed()) {
        pendingTargets.push(target);
        return;
    }

    workspaceWindow.webContents.send("workspace-open-target", target);
};

const flushPendingTargets = (): void => {
    const targets = pendingTargets.splice(0, pendingTargets.length);
    targets.forEach(sendWorkspaceTarget);
};

const configureNavigationGuards = (window: BrowserWindow): void => {
    window.webContents.setWindowOpenHandler(({ url }) => {
        void openExternalNavigation(url);
        return { action: "deny" };
    });

    window.webContents.on("will-navigate", (event, url) => {
        const currentUrl = window.webContents.getURL();
        if (!isHttpUrl(url) || isSameWindowOrigin(url, currentUrl)) {
            return;
        }

        event.preventDefault();
        void openExternalNavigation(url);
    });
};

const loadWorkspaceWindow = async (window: BrowserWindow): Promise<void> => {
    if (app.isPackaged) {
        const indexPath = path.join(app.getAppPath(), "dist", "renderer", "index.html");
        await window.loadFile(indexPath, { hash: "/workspace" });
        return;
    }

    const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:3000";
    await window.loadURL(`${devServerUrl}/#/workspace`);
};

const createWorkspaceWindow = (): BrowserWindow => {
    const basePath = app.getAppPath();
    const initialBounds = getInitialWorkspaceWindowBounds();

    const window = new BrowserWindow({
        ...initialBounds,
        frame: false,
        webPreferences: {
            preload: path.join(basePath, "dist", "preload.js"),
            contextIsolation: true,
            webSecurity: false,
            sandbox: false,
        },
        autoHideMenuBar: app.isPackaged,
    });

    workspaceWindow = window;
    attachWindowStateListeners(window);
    attachWorkspaceWindowStatePersistence(window);
    configureNavigationGuards(window);

    window.webContents.once("did-finish-load", flushPendingTargets);

    window.on("closed", () => {
        if (workspaceWindow === window) {
            workspaceWindow = null;
        }
        pendingTargets.splice(0, pendingTargets.length);
    });

    void loadWorkspaceWindow(window)
        .catch((error) => {
            console.error("Failed to load workspace window", error);
            window.close();
        });

    return window;
};

export const openWorkspaceTarget = async (
    _event: IpcMainInvokeEvent,
    target: unknown,
): Promise<boolean> => {
    if (!isWorkspaceTarget(target)) {
        return false;
    }

    if (!workspaceWindow || workspaceWindow.isDestroyed()) {
        pendingTargets.push(target);
        createWorkspaceWindow();
        return true;
    }

    if (workspaceWindow.webContents.isLoading()) {
        pendingTargets.push(target);
    } else {
        sendWorkspaceTarget(target);
    }

    if (workspaceWindow.isMinimized()) {
        workspaceWindow.restore();
    }
    workspaceWindow.focus();

    return true;
};
