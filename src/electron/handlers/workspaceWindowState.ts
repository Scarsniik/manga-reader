import { BrowserWindow, screen, type Rectangle } from "electron";
import fs from "fs";
import { dataDir, workspaceWindowStateFilePath } from "../utils";

const DEFAULT_WORKSPACE_WINDOW_BOUNDS: Pick<Rectangle, "width" | "height"> = {
    width: 1120,
    height: 740,
};

export const WORKSPACE_WINDOW_MIN_WIDTH = 800;
export const WORKSPACE_WINDOW_MIN_HEIGHT = 560;
const MIN_VISIBLE_WIDTH = 160;
const MIN_VISIBLE_HEIGHT = 120;
const SAVE_WINDOW_BOUNDS_DELAY_MS = 250;

type InitialWorkspaceWindowBounds = Pick<Rectangle, "width" | "height"> & Partial<Pick<Rectangle, "x" | "y">>;

type WorkspaceWindowState = {
    bounds: Rectangle;
    isMaximized: boolean;
    updatedAt: string;
};

type InitialWorkspaceWindowState = {
    bounds: InitialWorkspaceWindowBounds;
    isMaximized: boolean;
};

let saveWindowBoundsTimeout: NodeJS.Timeout | null = null;

const isFiniteNumber = (value: unknown): value is number => (
    typeof value === "number" && Number.isFinite(value)
);

const isUsableWindowSize = (bounds: Pick<Rectangle, "width" | "height">): boolean => (
    bounds.width >= WORKSPACE_WINDOW_MIN_WIDTH && bounds.height >= WORKSPACE_WINDOW_MIN_HEIGHT
);

const normalizeSavedBounds = (value: unknown): Rectangle | null => {
    if (!value || typeof value !== "object") {
        return null;
    }

    const candidate = value as Partial<Rectangle>;
    if (
        !isFiniteNumber(candidate.x)
        || !isFiniteNumber(candidate.y)
        || !isFiniteNumber(candidate.width)
        || !isFiniteNumber(candidate.height)
    ) {
        return null;
    }

    const bounds = {
        x: Math.round(candidate.x),
        y: Math.round(candidate.y),
        width: Math.round(candidate.width),
        height: Math.round(candidate.height),
    };

    if (!isUsableWindowSize(bounds)) {
        return {
            ...bounds,
            ...DEFAULT_WORKSPACE_WINDOW_BOUNDS,
        };
    }

    return bounds;
};

const getIntersectionSize = (left: Rectangle, right: Rectangle): Pick<Rectangle, "width" | "height"> => {
    const xStart = Math.max(left.x, right.x);
    const yStart = Math.max(left.y, right.y);
    const xEnd = Math.min(left.x + left.width, right.x + right.width);
    const yEnd = Math.min(left.y + left.height, right.y + right.height);

    return {
        width: Math.max(0, xEnd - xStart),
        height: Math.max(0, yEnd - yStart),
    };
};

const getBestVisibleWorkArea = (bounds: Rectangle): Rectangle | null => {
    const displayMatches = screen.getAllDisplays()
        .map((display) => {
            const intersection = getIntersectionSize(bounds, display.workArea);
            return {
                workArea: display.workArea,
                visibleArea: intersection.width * intersection.height,
                visibleWidth: intersection.width,
                visibleHeight: intersection.height,
            };
        })
        .sort((left, right) => right.visibleArea - left.visibleArea);

    const bestMatch = displayMatches[0];
    if (
        !bestMatch
        || bestMatch.visibleWidth < MIN_VISIBLE_WIDTH
        || bestMatch.visibleHeight < MIN_VISIBLE_HEIGHT
    ) {
        return null;
    }

    return bestMatch.workArea;
};

const fitBoundsInsideWorkArea = (bounds: Rectangle, workArea: Rectangle): Rectangle => {
    const width = Math.min(bounds.width, workArea.width);
    const height = Math.min(bounds.height, workArea.height);

    return {
        x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
        y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height),
        width,
        height,
    };
};

const restoreUsableBounds = (bounds: Rectangle): Rectangle | null => {
    const workArea = getBestVisibleWorkArea(bounds);
    return workArea ? fitBoundsInsideWorkArea(bounds, workArea) : null;
};

const normalizeWindowState = (value: unknown): InitialWorkspaceWindowState => {
    if (!value || typeof value !== "object") {
        return {
            bounds: DEFAULT_WORKSPACE_WINDOW_BOUNDS,
            isMaximized: false,
        };
    }

    const candidate = value as Partial<WorkspaceWindowState>;
    const savedBounds = normalizeSavedBounds(candidate.bounds);
    const usableBounds = savedBounds ? restoreUsableBounds(savedBounds) : null;

    return {
        bounds: usableBounds ?? DEFAULT_WORKSPACE_WINDOW_BOUNDS,
        isMaximized: candidate.isMaximized === true,
    };
};

const getPersistableBounds = (window: BrowserWindow): Rectangle => (
    window.isMaximized() || window.isFullScreen() || window.isMinimized()
        ? window.getNormalBounds()
        : window.getBounds()
);

export const getInitialWorkspaceWindowState = (): InitialWorkspaceWindowState => {
    try {
        const rawState = fs.readFileSync(workspaceWindowStateFilePath, "utf8");
        return normalizeWindowState(JSON.parse(rawState));
    } catch (error) {
        const errorCode = (error as NodeJS.ErrnoException | null)?.code;
        if (errorCode !== "ENOENT") {
            console.warn("Failed to read workspace window state", error);
        }

        return {
            bounds: DEFAULT_WORKSPACE_WINDOW_BOUNDS,
            isMaximized: false,
        };
    }
};

export const applyInitialWorkspaceWindowState = (
    window: BrowserWindow,
    state: InitialWorkspaceWindowState,
): void => {
    if (state.isMaximized) {
        window.maximize();
    }
};

export const saveWorkspaceWindowBounds = (window: BrowserWindow): void => {
    if (window.isDestroyed()) {
        return;
    }

    const bounds = normalizeSavedBounds(getPersistableBounds(window)) ?? {
        ...window.getBounds(),
        ...DEFAULT_WORKSPACE_WINDOW_BOUNDS,
    };
    const state: WorkspaceWindowState = {
        bounds,
        isMaximized: window.isMaximized(),
        updatedAt: new Date().toISOString(),
    };

    try {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(workspaceWindowStateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    } catch (error) {
        console.warn("Failed to save workspace window state", error);
    }
};

export const attachWorkspaceWindowStatePersistence = (window: BrowserWindow): void => {
    const scheduleSave = (): void => {
        if (saveWindowBoundsTimeout) {
            clearTimeout(saveWindowBoundsTimeout);
        }

        saveWindowBoundsTimeout = setTimeout(() => {
            saveWindowBoundsTimeout = null;
            saveWorkspaceWindowBounds(window);
        }, SAVE_WINDOW_BOUNDS_DELAY_MS);
    };

    window.on("move", scheduleSave);
    window.on("resize", scheduleSave);
    window.on("close", () => {
        if (saveWindowBoundsTimeout) {
            clearTimeout(saveWindowBoundsTimeout);
            saveWindowBoundsTimeout = null;
        }

        saveWorkspaceWindowBounds(window);
    });
};
