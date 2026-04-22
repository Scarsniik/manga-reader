import { promises as fs } from "fs";
import path from "path";
import { app, BrowserWindow, Notification, shell } from "electron";
import { dataDir, ensureDataDir } from "../../utils";
import { OCR_RUNTIME_METADATA_FILE_NAME } from "./constants";
import {
    getDefaultOcrRuntimePath,
    getOcrRuntimeConfigPath,
    getPortableOcrRuntimeConfigPath,
    getPortableOcrRuntimePath,
} from "./paths";
import { getOcrRuntimeStatus } from "./detection";
import { readOcrRuntimeConfig, saveOcrRuntimeConfig } from "./config";
import { runOcrRuntimeInstall, type OcrRuntimeInstallRequest } from "./installer";
import { terminateOcrWorker } from "../ocr/worker-shutdown";
import type { OcrRuntimeInstallStatus } from "./types";

type OcrRuntimeUninstallRequest = {
    confirmRuntimePath?: string | null;
    dryRun?: boolean;
};

const INSTALL_LOG_FILE_NAME = "ocr-install-last.log";

let installStatus: OcrRuntimeInstallStatus = {
    stage: "idle",
    progress: 0,
    message: null,
    step: null,
    runtimePath: null,
    manifest: null,
    cancellable: false,
    lastError: null,
    downloadedBytes: 0,
    totalBytes: 0,
    currentItem: null,
    logPath: null,
    updatedAt: new Date().toISOString(),
};

let installPromise: Promise<unknown> | null = null;
let installAbortController: AbortController | null = null;

type RuntimeNotificationKind = "success" | "error" | "info" | "warning";

const updateInstallStatus = (nextStatus: Partial<OcrRuntimeInstallStatus>) => {
    installStatus = {
        ...installStatus,
        ...nextStatus,
        updatedAt: new Date().toISOString(),
    };
    return installStatus;
};

const getInstallLogPath = () => path.join(dataDir, INSTALL_LOG_FILE_NAME);

const resetInstallLog = async () => {
    await ensureDataDir();
    await fs.writeFile(getInstallLogPath(), "", "utf-8");
};

const appendInstallLog = async (message: string) => {
    await ensureDataDir();
    await fs.appendFile(getInstallLogPath(), `[${new Date().toISOString()}] ${message}\n`, "utf-8");
};

const publishRuntimeNotification = (
    kind: RuntimeNotificationKind,
    title: string,
    message: string,
) => {
    const payload = {
        kind,
        title,
        message,
        sentAt: new Date().toISOString(),
    };

    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("ocr-runtime-notification", payload);
    }

    const hasFocusedWindow = BrowserWindow.getAllWindows().some((win) => win.isFocused());
    if (!hasFocusedWindow && Notification.isSupported()) {
        new Notification({
            title,
            body: message,
        }).show();
    }
};

const normalizeComparablePath = (targetPath: string) => path.resolve(targetPath).replace(/\//g, "\\").toLowerCase();

const getConfiguredUninstallTarget = async () => {
    const config = await readOcrRuntimeConfig();
    const status = await getOcrRuntimeStatus();
    const runtimePath = config.runtimePath || (status.source === "default" ? status.runtimePath : null);

    return {
        status,
        runtimePath: runtimePath ? path.resolve(runtimePath) : null,
    };
};

const assertSafeRuntimeDeleteTarget = async (runtimePath: string) => {
    const resolvedPath = path.resolve(runtimePath);
    const root = path.parse(resolvedPath).root;
    const unsafePaths = [
        root,
        app.getPath("home"),
        app.getPath("appData"),
        app.getPath("userData"),
        app.getAppPath(),
    ].map(normalizeComparablePath);

    if (unsafePaths.includes(normalizeComparablePath(resolvedPath))) {
        throw new Error("Refusing to delete an unsafe OCR runtime path");
    }

    await fs.access(path.join(resolvedPath, OCR_RUNTIME_METADATA_FILE_NAME));
};

export async function getOcrRuntimeDefaults() {
    return {
        configFilePath: getOcrRuntimeConfigPath(),
        portableConfigFilePath: getPortableOcrRuntimeConfigPath(),
        defaultRuntimePath: getDefaultOcrRuntimePath(),
        portableRuntimePath: getPortableOcrRuntimePath(),
        config: await readOcrRuntimeConfig(),
    };
}

export async function getOcrRuntimeInstallStatus() {
    return installStatus;
}

export async function startOcrRuntimeInstall(request?: OcrRuntimeInstallRequest) {
    if (installPromise) {
        return {
            started: false,
            reason: "installation-already-running",
            status: installStatus,
        };
    }

    await resetInstallLog();
    const abortController = new AbortController();
    installAbortController = abortController;
    updateInstallStatus({
        stage: "manifest",
        progress: 0,
        message: "Preparing OCR runtime installation",
        step: "manifest",
        runtimePath: request?.runtimePath ? String(request.runtimePath).trim() : getDefaultOcrRuntimePath(),
        manifest: null,
        cancellable: true,
        lastError: null,
        downloadedBytes: 0,
        totalBytes: 0,
        currentItem: null,
        logPath: getInstallLogPath(),
    });

    installPromise = runOcrRuntimeInstall(request, {
        signal: abortController.signal,
        updateStatus: updateInstallStatus,
        appendLog: appendInstallLog,
    }).then(() => {
        publishRuntimeNotification(
            "success",
            "Installation OCR terminee",
            "Le runtime OCR est installe et pret a etre utilise.",
        );
    }).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        const cancelled = abortController.signal.aborted || /cancelled/i.test(message);
        await appendInstallLog(cancelled ? "OCR runtime installation cancelled" : `OCR runtime installation failed: ${message}`);
        await saveOcrRuntimeConfig({
            state: cancelled ? "unknown" : "failed",
            lastError: message,
            lastCheckedAt: new Date().toISOString(),
        });
        updateInstallStatus({
            stage: cancelled ? "cancelled" : "failed",
            message: cancelled ? "OCR runtime installation cancelled" : "OCR runtime installation failed",
            cancellable: false,
            lastError: message,
        });
        publishRuntimeNotification(
            cancelled ? "warning" : "error",
            cancelled ? "Installation OCR annulee" : "Installation OCR echouee",
            cancelled ? "L'application reste utilisable sans OCR." : "L'application reste utilisable sans OCR. Ouvre le log pour le diagnostic.",
        );
    }).finally(() => {
        installPromise = null;
        installAbortController = null;
    });

    return {
        started: true,
        status: installStatus,
    };
}

export async function cancelOcrRuntimeInstall() {
    if (!installAbortController || !installPromise) {
        return {
            cancelled: false,
            reason: "no-active-installation",
            status: installStatus,
        };
    }

    installAbortController.abort();
    await appendInstallLog("OCR runtime installation cancellation requested");

    return {
        cancelled: true,
        status: updateInstallStatus({
            stage: "cancelled",
            message: "OCR runtime installation cancelled",
            cancellable: false,
        }),
    };
}

export async function verifyOcrRuntime() {
    const status = await getOcrRuntimeStatus();
    const config = await saveOcrRuntimeConfig({
        lastCheckedAt: status.checkedAt,
        lastError: status.status === "available" ? null : status.issues.join("; "),
    });

    return {
        ok: status.status === "available",
        status: {
            ...status,
            config,
        },
    };
}

export async function repairOcrRuntime(request?: OcrRuntimeInstallRequest) {
    return startOcrRuntimeInstall(request);
}

export async function uninstallOcrRuntime(request?: OcrRuntimeUninstallRequest) {
    const { status, runtimePath } = await getConfiguredUninstallTarget();
    if (!runtimePath) {
        return {
            uninstalled: false,
            reason: "no-configured-runtime",
            status,
        };
    }

    if (status.source === "environment") {
        return {
            uninstalled: false,
            reason: "environment-runtime-cannot-be-uninstalled",
            status,
        };
    }

    await assertSafeRuntimeDeleteTarget(runtimePath);

    if (normalizeComparablePath(request?.confirmRuntimePath || "") !== normalizeComparablePath(runtimePath)) {
        return {
            uninstalled: false,
            requiresConfirmation: true,
            runtimePath,
            status,
        };
    }

    if (!request?.dryRun) {
        await terminateOcrWorker();

        await fs.rm(runtimePath, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 250,
        });

        await saveOcrRuntimeConfig({
            state: "unknown",
            runtimePath: null,
            runtimeVersion: null,
            installedAt: null,
            lastCheckedAt: new Date().toISOString(),
            lastError: null,
        });

        publishRuntimeNotification(
            "success",
            "Desinstallation OCR terminee",
            "Le runtime OCR est desinstalle. L'application reste utilisable sans OCR.",
        );
    }

    return {
        uninstalled: !request?.dryRun,
        dryRun: !!request?.dryRun,
        runtimePath,
        status: await getOcrRuntimeStatus(),
    };
}

export async function openOcrRuntimeInstallLog() {
    const logPath = getInstallLogPath();
    try {
        await fs.access(logPath);
    } catch {
        return {
            opened: false,
            error: "OCR install log does not exist",
            logPath,
        };
    }

    const error = await shell.openPath(logPath);
    return {
        opened: error.length === 0,
        error,
        logPath,
    };
}
