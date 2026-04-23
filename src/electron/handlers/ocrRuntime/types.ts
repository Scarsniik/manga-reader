export type OcrRuntimeConfigState = "unknown" | "skipped" | "installing" | "installed" | "failed" | "uninstalling";
export type OcrRuntimeInstallMode = "user" | "portable" | "env";
export type OcrRuntimeDetectionStatus = "available" | "missing" | "invalid";
export type OcrRuntimeSource = "environment" | "config" | "default" | "none";
export type OcrRuntimeItemKind = "file" | "directory";

export type OcrRuntimeConfig = {
    schemaVersion: 1;
    state: OcrRuntimeConfigState;
    installMode: OcrRuntimeInstallMode;
    runtimePath: string | null;
    runtimeVersion: string | null;
    manifestUrl: string | null;
    skippedAt: string | null;
    installedAt: string | null;
    lastCheckedAt: string | null;
    lastError: string | null;
};

export type OcrRuntimeMetadata = {
    schemaVersion: number;
    runtimeVersion: string;
    platform: string;
    installedAt: string | null;
    sourceManifestUrl: string | null;
    installPath: string | null;
    supportsGpu: boolean;
    compatibleAppVersions: string | null;
};

export type OcrRuntimeValidationItem = {
    label: string;
    kind: OcrRuntimeItemKind;
    path: string;
    exists: boolean;
};

export type OcrRuntimeDetection = {
    status: OcrRuntimeDetectionStatus;
    state: OcrRuntimeConfigState;
    source: OcrRuntimeSource;
    configFilePath: string;
    defaultRuntimePath: string;
    runtimePath: string | null;
    config: OcrRuntimeConfig;
    metadata: OcrRuntimeMetadata | null;
    requiredItems: OcrRuntimeValidationItem[];
    issues: string[];
    checkedAt: string;
};

export type RuntimeCandidate = {
    source: Exclude<OcrRuntimeSource, "none">;
    runtimePath: string;
};

export type OcrRuntimeManifestSourceType = "local" | "remote";

export type OcrRuntimeManifestSource = {
    type: OcrRuntimeManifestSourceType;
    value: string;
};

export type OcrRuntimeManifestPart = {
    index: number;
    url: string;
    sizeBytes: number;
    sha256: string;
};

export type OcrRuntimeSingleDownload = {
    platform: string;
    archiveType: "zip";
    delivery: "single";
    url: string;
    sizeBytes: number;
    sha256: string;
};

export type OcrRuntimeMultipartDownload = {
    platform: string;
    archiveType: "zip";
    delivery: "multipart";
    totalSizeBytes: number;
    installedSha256: string | null;
    parts: OcrRuntimeManifestPart[];
};

export type OcrRuntimeManifestDownload = OcrRuntimeSingleDownload | OcrRuntimeMultipartDownload;

export type OcrRuntimeManifest = {
    schemaVersion: 1;
    runtimeVersion: string;
    compatibleAppVersions: string;
    recommended: boolean;
    downloads: OcrRuntimeManifestDownload[];
};

export type OcrRuntimeManifestRequest = {
    manifestPath?: string | null;
    manifestUrl?: string | null;
};

export type OcrRuntimeManifestResult = {
    source: OcrRuntimeManifestSource;
    manifest: OcrRuntimeManifest;
    selectedDownload: OcrRuntimeManifestDownload;
    checkedAt: string;
};

export type OcrRuntimeInstallStage = "idle" | "manifest" | "installing" | "cancelled" | "failed" | "completed";

export type OcrRuntimeInstallStatus = {
    stage: OcrRuntimeInstallStage;
    progress: number;
    message: string | null;
    step: string | null;
    runtimePath: string | null;
    manifest: OcrRuntimeManifestResult | null;
    cancellable: boolean;
    lastError: string | null;
    downloadedBytes: number;
    totalBytes: number;
    currentItem: string | null;
    logPath: string | null;
    updatedAt: string;
};
