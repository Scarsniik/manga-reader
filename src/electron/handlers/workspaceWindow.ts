import { app, BrowserWindow, IpcMainInvokeEvent, shell } from "electron";
import path from "path";
import { attachWindowStateListeners } from "./windowControls";
import {
    applyInitialWorkspaceWindowState,
    attachWorkspaceWindowStatePersistence,
    getInitialWorkspaceWindowState,
    WORKSPACE_WINDOW_MIN_HEIGHT,
    WORKSPACE_WINDOW_MIN_WIDTH,
} from "./workspaceWindowState";

type MangaManagerViewWorkspaceTarget = {
    kind: "manga-manager.view";
    viewId: string;
    locationState?: {
        librarySearchQuery?: string;
        multiSearchPrefillQuery?: string;
        bookmarkFilters?: Record<string, unknown>;
        bookmarksFilterScraperId?: string | null;
        backgroundSearchJobId?: string;
    };
    title?: string;
};

type ReaderWorkspaceTarget = {
    kind: "reader";
    mangaId: string;
    page?: number;
    title?: string;
    locationState?: unknown;
};

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

type ScraperTagWorkspaceTarget = {
    kind: "scraper.tag";
    scraperId: string;
    query: string;
    title?: string;
};

type ScraperBookmarkTagsWorkspaceTarget = {
    kind: "scraper.bookmarkTags";
    filterScraperId?: string | null;
    filters?: Record<string, unknown> | null;
    title?: string;
};

type ReadingListWorkspaceTarget = {
    kind: "reading-list";
    items: Array<{
        id: string;
        metadata: {
            title: string;
            cover?: string | null;
            authors?: string[];
            tags?: string[];
            languageCodes?: string[];
        };
        sourceTarget: ReaderWorkspaceTarget | ScraperDetailsWorkspaceTarget;
    }>;
    autoStart?: boolean;
    savedListId?: string;
    title?: string;
};

export type WorkspaceTarget =
    | MangaManagerViewWorkspaceTarget
    | ReaderWorkspaceTarget
    | ScraperConfigWorkspaceTarget
    | ScraperDetailsWorkspaceTarget
    | ScraperAuthorWorkspaceTarget
    | ScraperTagWorkspaceTarget
    | ScraperBookmarkTagsWorkspaceTarget
    | ReadingListWorkspaceTarget;

let workspaceWindow: BrowserWindow | null = null;
type WorkspaceTargetRequest = {
    options: {
        activate: boolean;
    };
    target: WorkspaceTarget;
};

const pendingTargets: WorkspaceTargetRequest[] = [];

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

const isOptionalObject = (value: unknown): boolean => (
    value === undefined
    || value === null
    || (typeof value === "object" && !Array.isArray(value))
);

const isOptionalStringOrNull = (value: unknown): boolean => (
    value === undefined
    || value === null
    || typeof value === "string"
);

const isMangaManagerLocationState = (value: unknown): boolean => {
    if (value === undefined || value === null) {
        return true;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const candidate = value as {
        bookmarkFilters?: unknown;
        bookmarksFilterScraperId?: unknown;
        librarySearchQuery?: unknown;
        multiSearchPrefillQuery?: unknown;
        backgroundSearchJobId?: unknown;
    };
    return (
        candidate.multiSearchPrefillQuery === undefined
        || typeof candidate.multiSearchPrefillQuery === "string"
    )
    && (
        candidate.librarySearchQuery === undefined
        || typeof candidate.librarySearchQuery === "string"
    )
    && (
        candidate.backgroundSearchJobId === undefined
        || typeof candidate.backgroundSearchJobId === "string"
    )
    && isOptionalObject(candidate.bookmarkFilters)
    && isOptionalStringOrNull(candidate.bookmarksFilterScraperId);
};

const isOptionalPositivePage = (value: unknown): boolean => (
    value === undefined
    || (
        typeof value === "number"
        && Number.isFinite(value)
        && value > 0
    )
);

const isOptionalStringList = (value: unknown): boolean => (
    value === undefined
    || (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
);

const isOptionalBoolean = (value: unknown): boolean => (
    value === undefined || typeof value === "boolean"
);

const isOptionalNonEmptyString = (value: unknown): boolean => (
    value === undefined
    || (typeof value === "string" && value.trim().length > 0)
);

const isReadingListItem = (value: unknown): boolean => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const item = value as ReadingListWorkspaceTarget["items"][number];
    const metadata = item.metadata;
    const sourceTarget = item.sourceTarget;
    if (
        typeof item.id !== "string"
        || !item.id.trim()
        || !metadata
        || typeof metadata !== "object"
        || typeof metadata.title !== "string"
        || !metadata.title.trim()
        || !isOptionalStringOrNull(metadata.cover)
        || !isOptionalStringList(metadata.authors)
        || !isOptionalStringList(metadata.tags)
        || !isOptionalStringList(metadata.languageCodes)
        || !sourceTarget
        || typeof sourceTarget !== "object"
    ) {
        return false;
    }

    if (sourceTarget.kind === "reader") {
        return (
            typeof sourceTarget.mangaId === "string"
            && sourceTarget.mangaId.trim().length > 0
            && isOptionalPositivePage(sourceTarget.page)
            && isOptionalObject(sourceTarget.locationState)
        );
    }

    return sourceTarget.kind === "scraper.details"
        && typeof sourceTarget.scraperId === "string"
        && sourceTarget.scraperId.trim().length > 0
        && typeof sourceTarget.sourceUrl === "string"
        && sourceTarget.sourceUrl.trim().length > 0;
};

const isWorkspaceTarget = (value: unknown): value is WorkspaceTarget => {
    if (!value || typeof value !== "object") {
        return false;
    }

    const candidate = value as Partial<WorkspaceTarget>;

    if (candidate.kind === "manga-manager.view") {
        return (
            typeof candidate.viewId === "string"
            && candidate.viewId.trim().length > 0
            && isMangaManagerLocationState(candidate.locationState)
        );
    }

    if (candidate.kind === "reader") {
        return (
            typeof candidate.mangaId === "string"
            && candidate.mangaId.trim().length > 0
            && isOptionalPositivePage(candidate.page)
            && isOptionalObject(candidate.locationState)
        );
    }

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

    if (candidate.kind === "scraper.tag") {
        return (
            typeof candidate.scraperId === "string"
            && candidate.scraperId.trim().length > 0
            && typeof candidate.query === "string"
            && candidate.query.trim().length > 0
        );
    }

    if (candidate.kind === "scraper.bookmarkTags") {
        const bookmarkTagsTarget = candidate as Partial<ScraperBookmarkTagsWorkspaceTarget>;
        return (
            isOptionalStringOrNull(bookmarkTagsTarget.filterScraperId)
            && isOptionalObject(bookmarkTagsTarget.filters)
        );
    }

    if (candidate.kind === "reading-list") {
        const readingListTarget = candidate as Partial<ReadingListWorkspaceTarget>;
        return (
            Array.isArray(readingListTarget.items)
            && readingListTarget.items.length > 0
            && readingListTarget.items.every(isReadingListItem)
            && isOptionalBoolean(readingListTarget.autoStart)
            && isOptionalNonEmptyString(readingListTarget.savedListId)
        );
    }

    return false;
};

const createWorkspaceTargetRequest = (
    target: WorkspaceTarget,
    options?: { activate?: boolean },
): WorkspaceTargetRequest => ({
    target,
    options: {
        activate: options?.activate === true,
    },
});

const sendWorkspaceTarget = (request: WorkspaceTargetRequest): void => {
    if (!workspaceWindow || workspaceWindow.isDestroyed()) {
        pendingTargets.push(request);
        return;
    }

    workspaceWindow.webContents.send("workspace-open-target", request);
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
    const initialWindowState = getInitialWorkspaceWindowState();

    const window = new BrowserWindow({
        ...initialWindowState.bounds,
        minWidth: WORKSPACE_WINDOW_MIN_WIDTH,
        minHeight: WORKSPACE_WINDOW_MIN_HEIGHT,
        frame: false,
        webPreferences: {
            preload: path.join(basePath, "dist", "electron", "preload.js"),
            contextIsolation: true,
            webSecurity: false,
            sandbox: false,
            backgroundThrottling: app.isPackaged,
        },
        autoHideMenuBar: app.isPackaged,
    });

    workspaceWindow = window;
    attachWindowStateListeners(window);
    attachWorkspaceWindowStatePersistence(window);
    applyInitialWorkspaceWindowState(window, initialWindowState);
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
    options?: unknown,
): Promise<boolean> => {
    if (!isWorkspaceTarget(target)) {
        return false;
    }

    const shouldActivate = Boolean(
        options
        && typeof options === "object"
        && !Array.isArray(options)
        && (options as { activate?: unknown }).activate === true,
    );
    const request = createWorkspaceTargetRequest(target, { activate: shouldActivate });

    if (!workspaceWindow || workspaceWindow.isDestroyed()) {
        pendingTargets.push(request);
        createWorkspaceWindow();
        return true;
    }

    if (workspaceWindow.webContents.isLoading()) {
        pendingTargets.push(request);
    } else {
        sendWorkspaceTarget(request);
    }

    if (workspaceWindow.isMinimized()) {
        workspaceWindow.restore();
    }
    workspaceWindow.focus();

    return true;
};
