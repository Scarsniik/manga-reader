import { promises as fs } from "fs";
import path from "path";
import { app, BrowserWindow, Notification, shell } from "electron";
import {
    autoUpdater,
    type AppUpdater,
    type ProgressInfo,
    type UpdateCheckResult,
    type UpdateDownloadedEvent,
    type UpdateInfo,
} from "electron-updater";
import { getSettings, saveSettings } from "../params";
import { appendAppUpdateLog } from "./log";
import type {
    AppUpdateNotificationKind,
    AppUpdateNotificationPayload,
    AppUpdateStatus,
} from "./types";

const STARTUP_CHECK_DELAY_MS = 2500;
const DEV_MODE_ENV_NAMES = [
    "APP_UPDATE_ENABLE_DEV",
    "SCARAMANGA_APP_UPDATE_ENABLE_DEV",
    "SCARAMANGA_ENABLE_DEV_APP_UPDATER",
];
const GITHUB_OWNER_ENV_NAMES = [
    "APP_UPDATE_GITHUB_OWNER",
    "SCARAMANGA_APP_UPDATE_GITHUB_OWNER",
];
const GITHUB_REPO_ENV_NAMES = [
    "APP_UPDATE_GITHUB_REPO",
    "SCARAMANGA_APP_UPDATE_GITHUB_REPO",
];

type GithubRepository = {
    owner: string;
    repo: string;
};

type AppUpdateSettings = {
    appUpdateAutoCheck?: boolean;
    appUpdateLastCheckedAt?: string | null;
};

let appUpdateStatus: AppUpdateStatus = {
    state: "idle",
    currentVersion: app.getVersion(),
    availableVersion: null,
    lastCheckedAt: null,
    progressPercent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
    releaseDate: null,
    releaseName: null,
    releaseUrl: null,
    errorMessage: null,
    message: null,
    isSupported: false,
    supportReason: "Auto update not initialized yet.",
    isPortable: false,
    autoCheckEnabled: true,
    devModeEnabled: false,
};

let isInitialized = false;
let startupCheckTimer: NodeJS.Timeout | null = null;
let activeDownloadPromise: Promise<void> | null = null;

const getAutoUpdater = (): AppUpdater => autoUpdater;

const parseBooleanEnvValue = (value: string | undefined): boolean => (
    typeof value === "string" && /^(1|true|yes|on)$/i.test(value.trim())
);

const isDevModeEnabled = (): boolean => (
    DEV_MODE_ENV_NAMES.some((name) => parseBooleanEnvValue(process.env[name]))
);

const isPortableBuild = (): boolean => (
    process.platform === "win32"
    && typeof process.env.PORTABLE_EXECUTABLE_DIR === "string"
    && process.env.PORTABLE_EXECUTABLE_DIR.trim().length > 0
);

const getUpdaterSupport = () => {
    const portable = isPortableBuild();
    const devModeEnabled = isDevModeEnabled();

    if (portable) {
        return {
            isPortable: true,
            devModeEnabled,
            isSupported: false,
            supportReason: "La version portable ne prend pas en charge la mise a jour automatique.",
        };
    }

    if (!app.isPackaged && !devModeEnabled) {
        return {
            isPortable: false,
            devModeEnabled: false,
            isSupported: false,
            supportReason: "La mise a jour automatique est bloquee en developpement sans mode de test explicite.",
        };
    }

    return {
        isPortable: false,
        devModeEnabled,
        isSupported: true,
        supportReason: null,
    };
};

const normalizeErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message.split("\n")[0]?.trim() || error.name;
    }

    return String(error || "Unknown updater error").split("\n")[0]?.trim() || "Unknown updater error";
};

const normalizeReleaseName = (info?: UpdateInfo | UpdateDownloadedEvent | null): string | null => {
    const value = info?.releaseName;
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const parseGithubRepository = (value: unknown): GithubRepository | null => {
    const input = typeof value === "string"
        ? value
        : (value && typeof value === "object" && "url" in value ? String((value as { url?: unknown }).url || "") : "");

    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    const normalized = trimmed
        .replace(/^git\+/, "")
        .replace(/\.git$/i, "");

    const githubMatch = normalized.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)$/i);
    if (!githubMatch?.groups?.owner || !githubMatch.groups.repo) {
        return null;
    }

    return {
        owner: githubMatch.groups.owner,
        repo: githubMatch.groups.repo,
    };
};

const readPackageMetadata = async (): Promise<Record<string, unknown> | null> => {
    try {
        const packageJsonPath = path.join(app.getAppPath(), "package.json");
        const raw = await fs.readFile(packageJsonPath, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
};

const resolveGithubRepository = async (): Promise<GithubRepository | null> => {
    const owner = GITHUB_OWNER_ENV_NAMES
        .map((name) => process.env[name]?.trim())
        .find((value) => value && value.length > 0);
    const repo = GITHUB_REPO_ENV_NAMES
        .map((name) => process.env[name]?.trim())
        .find((value) => value && value.length > 0);

    if (owner && repo) {
        return { owner, repo };
    }

    const packageMetadata = await readPackageMetadata();
    return parseGithubRepository(packageMetadata?.repository);
};

const buildReleaseUrl = async (version?: string | null): Promise<string | null> => {
    const repository = await resolveGithubRepository();
    if (!repository) {
        return null;
    }

    const baseUrl = `https://github.com/${repository.owner}/${repository.repo}/releases`;
    if (version && version.trim().length > 0) {
        return `${baseUrl}/tag/v${version.trim()}`;
    }

    return `${baseUrl}/latest`;
};

const shouldShowSystemNotification = (): boolean => (
    BrowserWindow.getAllWindows().every((window) => !window.isFocused())
);

const emitRendererNotification = (
    kind: AppUpdateNotificationKind,
    title: string,
    message: string,
) => {
    const payload: AppUpdateNotificationPayload = {
        kind,
        title,
        message,
        status: appUpdateStatus,
        sentAt: new Date().toISOString(),
    };

    for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("app-update-notification", payload);
    }
};

const notifyStatusChange = (
    kind: AppUpdateNotificationKind,
    title: string,
    message: string,
    showSystemNotification = false,
) => {
    emitRendererNotification(kind, title, message);

    if (showSystemNotification && Notification.isSupported() && shouldShowSystemNotification()) {
        new Notification({
            title,
            body: message,
        }).show();
    }
};

const setStatus = (nextPartialStatus: Partial<AppUpdateStatus>) => {
    const support = getUpdaterSupport();

    appUpdateStatus = {
        ...appUpdateStatus,
        ...nextPartialStatus,
        currentVersion: app.getVersion(),
        isSupported: support.isSupported,
        supportReason: support.supportReason,
        isPortable: support.isPortable,
        devModeEnabled: support.devModeEnabled,
    };

    return appUpdateStatus;
};

const syncStatusWithSettings = async () => {
    try {
        const settings = await getSettings() as AppUpdateSettings;
        setStatus({
            autoCheckEnabled: settings.appUpdateAutoCheck !== false,
            lastCheckedAt: typeof settings.appUpdateLastCheckedAt === "string"
                ? settings.appUpdateLastCheckedAt
                : null,
        });
    } catch (error) {
        await appendAppUpdateLog("Unable to read app update settings", {
            error: normalizeErrorMessage(error),
        });
    }

    return appUpdateStatus;
};

const persistLastCheckedAt = async (checkedAt: string) => {
    try {
        await saveSettings(null, {
            appUpdateLastCheckedAt: checkedAt,
        });
        setStatus({
            lastCheckedAt: checkedAt,
        });
    } catch (error) {
        await appendAppUpdateLog("Unable to persist app update timestamp", {
            checkedAt,
            error: normalizeErrorMessage(error),
        });
    }
};

const handleUpdaterError = async (error: unknown, message = "La verification de mise a jour a echoue.") => {
    const errorMessage = normalizeErrorMessage(error);
    const checkedAt = new Date().toISOString();

    setStatus({
        state: "error",
        errorMessage,
        message,
        progressPercent: 0,
        bytesPerSecond: 0,
    });

    await persistLastCheckedAt(checkedAt);
    await appendAppUpdateLog("App update error", {
        message,
        error: errorMessage,
    });

    notifyStatusChange(
        "error",
        "Mise a jour impossible",
        errorMessage,
        true,
    );
}

const handleCheckingForUpdate = async () => {
    setStatus({
        state: "checking",
        errorMessage: null,
        message: "Verification des mises a jour en cours.",
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0,
    });

    await appendAppUpdateLog("Checking for app updates");
    notifyStatusChange("info", "Mise a jour", "Verification des mises a jour.");
};

const handleUpdateAvailable = async (info: UpdateInfo) => {
    const checkedAt = new Date().toISOString();
    const releaseUrl = await buildReleaseUrl(info.version);

    setStatus({
        state: "available",
        availableVersion: info.version,
        releaseDate: info.releaseDate || null,
        releaseName: normalizeReleaseName(info),
        releaseUrl,
        errorMessage: null,
        message: `La version ${info.version} est disponible.`,
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0,
    });

    await persistLastCheckedAt(checkedAt);
    await appendAppUpdateLog("App update available", {
        version: info.version,
        releaseDate: info.releaseDate || null,
        releaseName: normalizeReleaseName(info),
    });

    notifyStatusChange(
        "info",
        "Mise a jour disponible",
        `La version ${info.version} est disponible.`,
        true,
    );
};

const handleUpdateNotAvailable = async (info: UpdateInfo) => {
    const checkedAt = new Date().toISOString();

    setStatus({
        state: "not-available",
        availableVersion: null,
        releaseDate: info.releaseDate || null,
        releaseName: normalizeReleaseName(info),
        releaseUrl: await buildReleaseUrl(),
        errorMessage: null,
        message: "L'application est deja a jour.",
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0,
    });

    await persistLastCheckedAt(checkedAt);
    await appendAppUpdateLog("App update not available", {
        currentVersion: app.getVersion(),
    });

    notifyStatusChange("info", "Mise a jour", "L'application est deja a jour.");
};

const handleDownloadProgress = async (progress: ProgressInfo) => {
    setStatus({
        state: "downloading",
        errorMessage: null,
        message: "Telechargement de la mise a jour en cours.",
        progressPercent: Math.max(0, Math.min(100, Number(progress.percent || 0))),
        transferredBytes: Number(progress.transferred || 0),
        totalBytes: Number(progress.total || 0),
        bytesPerSecond: Number(progress.bytesPerSecond || 0),
    });

    notifyStatusChange(
        "info",
        "Telechargement en cours",
        `Telechargement ${Math.round(Number(progress.percent || 0))}%`,
    );
};

const handleUpdateDownloaded = async (info: UpdateDownloadedEvent) => {
    setStatus({
        state: "downloaded",
        availableVersion: info.version,
        releaseDate: info.releaseDate || null,
        releaseName: normalizeReleaseName(info),
        releaseUrl: await buildReleaseUrl(info.version),
        errorMessage: null,
        message: "La mise a jour est prete a etre installee au redemarrage.",
        progressPercent: 100,
    });

    await appendAppUpdateLog("App update downloaded", {
        version: info.version,
    });

    notifyStatusChange(
        "success",
        "Mise a jour prete",
        `La version ${info.version} est prete a etre installee.`,
        true,
    );
};

const registerAutoUpdaterEvents = () => {
    const updater = getAutoUpdater();

    updater.on("checking-for-update", () => {
        void handleCheckingForUpdate();
    });

    updater.on("update-available", (info) => {
        void handleUpdateAvailable(info);
    });

    updater.on("update-not-available", (info) => {
        void handleUpdateNotAvailable(info);
    });

    updater.on("download-progress", (progress) => {
        void handleDownloadProgress(progress);
    });

    updater.on("update-downloaded", (info) => {
        void handleUpdateDownloaded(info);
    });

    updater.on("error", (error) => {
        void handleUpdaterError(error);
    });
};

export const initializeAppUpdate = async () => {
    if (isInitialized) {
        return appUpdateStatus;
    }

    const updater = getAutoUpdater();
    const support = getUpdaterSupport();

    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.forceDevUpdateConfig = !app.isPackaged && support.devModeEnabled;

    registerAutoUpdaterEvents();
    isInitialized = true;

    setStatus({
        state: "idle",
        message: support.isSupported ? "Mise a jour prete." : support.supportReason,
        errorMessage: null,
        releaseUrl: await buildReleaseUrl(),
    });

    await syncStatusWithSettings();
    await appendAppUpdateLog("App update service initialized", {
        isPackaged: app.isPackaged,
        isPortable: support.isPortable,
        devModeEnabled: support.devModeEnabled,
    });

    return appUpdateStatus;
};

export const getAppUpdateStatus = async () => {
    await syncStatusWithSettings();
    return appUpdateStatus;
};

export const checkForAppUpdates = async () => {
    await syncStatusWithSettings();

    if (!appUpdateStatus.isSupported) {
        const supportReason = appUpdateStatus.supportReason || "Mise a jour automatique indisponible.";
        setStatus({
            message: supportReason,
            errorMessage: supportReason,
        });
        notifyStatusChange("warning", "Mise a jour indisponible", supportReason);
        return {
            started: false,
            reason: "unsupported",
            status: appUpdateStatus,
        };
    }

    if (appUpdateStatus.state === "checking" || appUpdateStatus.state === "downloading") {
        return {
            started: false,
            reason: "busy",
            status: appUpdateStatus,
        };
    }

    try {
        const result = await getAutoUpdater().checkForUpdates() as UpdateCheckResult | null;
        await appendAppUpdateLog("App update check requested", {
            hasResult: !!result,
            availableVersion: result?.updateInfo?.version || null,
        });

        return {
            started: true,
            status: appUpdateStatus,
        };
    } catch (error) {
        await handleUpdaterError(error);
        return {
            started: false,
            reason: "failed",
            status: appUpdateStatus,
        };
    }
};

export const downloadAppUpdate = async () => {
    await syncStatusWithSettings();

    if (!appUpdateStatus.isSupported) {
        return {
            started: false,
            reason: "unsupported",
            status: appUpdateStatus,
        };
    }

    if (appUpdateStatus.state === "downloaded") {
        return {
            started: false,
            reason: "already-downloaded",
            status: appUpdateStatus,
        };
    }

    if (appUpdateStatus.state === "downloading" || activeDownloadPromise) {
        return {
            started: false,
            reason: "busy",
            status: appUpdateStatus,
        };
    }

    if (appUpdateStatus.state !== "available") {
        return {
            started: false,
            reason: "no-update-available",
            status: appUpdateStatus,
        };
    }

    try {
        await appendAppUpdateLog("App update download requested", {
            version: appUpdateStatus.availableVersion,
        });

        setStatus({
            state: "downloading",
            errorMessage: null,
            message: "Telechargement de la mise a jour en cours.",
            progressPercent: 0,
            transferredBytes: 0,
            totalBytes: 0,
            bytesPerSecond: 0,
        });

        notifyStatusChange(
            "info",
            "Telechargement en cours",
            "La mise a jour se telecharge en arriere-plan.",
        );

        activeDownloadPromise = Promise.resolve(getAutoUpdater().downloadUpdate())
            .then(() => undefined)
            .catch(async (error) => {
                await handleUpdaterError(error, "Le telechargement de la mise a jour a echoue.");
            })
            .finally(() => {
                activeDownloadPromise = null;
            });

        return {
            started: true,
            status: appUpdateStatus,
        };
    } catch (error) {
        await handleUpdaterError(error, "Le telechargement de la mise a jour a echoue.");
        return {
            started: false,
            reason: "failed",
            status: appUpdateStatus,
        };
    }
};

export const installAppUpdate = async () => {
    if (appUpdateStatus.state !== "downloaded") {
        return {
            started: false,
            reason: "no-downloaded-update",
            status: appUpdateStatus,
        };
    }

    await appendAppUpdateLog("App update installation requested", {
        version: appUpdateStatus.availableVersion,
    });

    setStatus({
        message: "Redemarrage pour installer la mise a jour.",
        errorMessage: null,
    });

    setTimeout(() => {
        getAutoUpdater().quitAndInstall(false, true);
    }, 150);

    return {
        started: true,
        status: appUpdateStatus,
    };
};

export const openAppUpdateReleasePage = async () => {
    const releaseUrl = appUpdateStatus.releaseUrl || await buildReleaseUrl(appUpdateStatus.availableVersion);
    if (!releaseUrl) {
        return {
            opened: false,
            error: "No release URL configured",
        };
    }

    try {
        await shell.openExternal(releaseUrl);
        return {
            opened: true,
            releaseUrl,
        };
    } catch (error) {
        return {
            opened: false,
            releaseUrl,
            error: normalizeErrorMessage(error),
        };
    }
};

export const maybeCheckForUpdatesOnStartup = async () => {
    await syncStatusWithSettings();

    if (!appUpdateStatus.isSupported || !appUpdateStatus.autoCheckEnabled) {
        return {
            checked: false,
            reason: "disabled",
            status: appUpdateStatus,
        };
    }

    const result = await checkForAppUpdates();
    return {
        checked: result.started,
        reason: result.reason || null,
        status: result.status,
    };
};

export const scheduleStartupUpdateCheck = (window: BrowserWindow | null) => {
    if (!window || window.isDestroyed()) {
        return;
    }

    if (startupCheckTimer) {
        clearTimeout(startupCheckTimer);
        startupCheckTimer = null;
    }

    window.webContents.once("did-finish-load", () => {
        startupCheckTimer = setTimeout(() => {
            startupCheckTimer = null;
            void maybeCheckForUpdatesOnStartup();
        }, STARTUP_CHECK_DELAY_MS);
    });
};
