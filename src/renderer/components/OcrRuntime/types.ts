export type OcrRuntimeDetectionStatus = "available" | "missing" | "invalid";
export type OcrRuntimeConfigState = "unknown" | "skipped" | "installing" | "installed" | "failed" | "uninstalling";
export type OcrRuntimeInstallStage = "idle" | "manifest" | "installing" | "cancelled" | "failed" | "completed";

export type OcrRuntimeStatus = {
    status?: OcrRuntimeDetectionStatus;
    state?: OcrRuntimeConfigState;
    source?: string;
    configFilePath?: string;
    defaultRuntimePath?: string;
    runtimePath?: string | null;
    metadata?: {
        runtimeVersion?: string;
        installedAt?: string | null;
        sourceManifestUrl?: string | null;
        supportsGpu?: boolean;
    } | null;
    issues?: string[];
    checkedAt?: string;
    config?: {
        manifestUrl?: string | null;
        lastError?: string | null;
    };
};

export type OcrRuntimeInstallStatus = {
    stage?: OcrRuntimeInstallStage;
    progress?: number;
    message?: string | null;
    step?: string | null;
    runtimePath?: string | null;
    cancellable?: boolean;
    lastError?: string | null;
    downloadedBytes?: number;
    totalBytes?: number;
    currentItem?: string | null;
    logPath?: string | null;
    updatedAt?: string;
    manifest?: {
        manifest?: {
            runtimeVersion?: string;
        };
        source?: {
            value?: string;
        };
    } | null;
};

export type OcrRuntimeApi = {
    openPath?: (targetPath: string) => Promise<{ success?: boolean; error?: string }>;
    openDirectory?: () => Promise<string | null>;
    ocrRuntimeCancelInstall?: () => Promise<unknown>;
    ocrRuntimeDefaults?: () => Promise<{ defaultRuntimePath?: string; config?: Record<string, unknown> }>;
    ocrRuntimeInstallStatus?: () => Promise<OcrRuntimeInstallStatus>;
    ocrRuntimeOpenInstallLog?: () => Promise<unknown>;
    ocrRuntimeRepair?: (request?: Record<string, unknown>) => Promise<unknown>;
    ocrRuntimeStartInstall?: (request?: Record<string, unknown>) => Promise<{ started?: boolean; reason?: string }>;
    ocrRuntimeStatus?: () => Promise<OcrRuntimeStatus>;
    ocrRuntimeUninstall?: (request?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    ocrRuntimeVerify?: () => Promise<{ ok?: boolean; status?: OcrRuntimeStatus }>;
};

export const getOcrRuntimeApi = (): OcrRuntimeApi => (window.api ?? {}) as OcrRuntimeApi;
