import { promises as fs } from "fs";
import { ensureDataDir } from "../../utils";
import {
    OCR_RUNTIME_CONFIG_SCHEMA_VERSION,
    SUPPORTED_CONFIG_STATES,
    SUPPORTED_INSTALL_MODES,
} from "./constants";
import { getOcrRuntimeConfigPath } from "./paths";
import type {
    OcrRuntimeConfig,
    OcrRuntimeConfigState,
    OcrRuntimeInstallMode,
    OcrRuntimeMetadata,
} from "./types";

export const normalizeNullableString = (value: unknown): string | null => {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

export const getRecord = (value: unknown): Record<string, unknown> => (
    value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
);

const normalizeConfigState = (value: unknown): OcrRuntimeConfigState => (
    typeof value === "string" && SUPPORTED_CONFIG_STATES.has(value as OcrRuntimeConfigState)
        ? value as OcrRuntimeConfigState
        : "unknown"
);

const normalizeInstallMode = (value: unknown): OcrRuntimeInstallMode => (
    typeof value === "string" && SUPPORTED_INSTALL_MODES.has(value as OcrRuntimeInstallMode)
        ? value as OcrRuntimeInstallMode
        : "user"
);

export const buildDefaultOcrRuntimeConfig = (): OcrRuntimeConfig => ({
    schemaVersion: OCR_RUNTIME_CONFIG_SCHEMA_VERSION,
    state: "unknown",
    installMode: "user",
    runtimePath: null,
    runtimeVersion: null,
    manifestUrl: null,
    skippedAt: null,
    installedAt: null,
    lastCheckedAt: null,
    lastError: null,
});

const normalizeOcrRuntimeConfig = (value: unknown): OcrRuntimeConfig => {
    const record = getRecord(value);
    const defaults = buildDefaultOcrRuntimeConfig();

    return {
        ...defaults,
        state: normalizeConfigState(record.state),
        installMode: normalizeInstallMode(record.installMode),
        runtimePath: normalizeNullableString(record.runtimePath),
        runtimeVersion: normalizeNullableString(record.runtimeVersion),
        manifestUrl: normalizeNullableString(record.manifestUrl),
        skippedAt: normalizeNullableString(record.skippedAt),
        installedAt: normalizeNullableString(record.installedAt),
        lastCheckedAt: normalizeNullableString(record.lastCheckedAt),
        lastError: normalizeNullableString(record.lastError),
    };
};

export const normalizeOcrRuntimeMetadata = (value: unknown): OcrRuntimeMetadata | null => {
    const record = getRecord(value);
    const runtimeVersion = normalizeNullableString(record.runtimeVersion);
    const platform = normalizeNullableString(record.platform);

    if (!runtimeVersion || !platform) {
        return null;
    }

    return {
        schemaVersion: typeof record.schemaVersion === "number" ? record.schemaVersion : 1,
        runtimeVersion,
        platform,
        installedAt: normalizeNullableString(record.installedAt),
        sourceManifestUrl: normalizeNullableString(record.sourceManifestUrl),
        installPath: normalizeNullableString(record.installPath),
        supportsGpu: record.supportsGpu !== false,
        compatibleAppVersions: normalizeNullableString(record.compatibleAppVersions),
    };
};

export async function readOcrRuntimeConfig(): Promise<OcrRuntimeConfig> {
    try {
        const data = await fs.readFile(getOcrRuntimeConfigPath(), "utf-8");
        if (!data.trim()) {
            return buildDefaultOcrRuntimeConfig();
        }

        return normalizeOcrRuntimeConfig(JSON.parse(data));
    } catch (error: any) {
        if (error?.code === "ENOENT") {
            return buildDefaultOcrRuntimeConfig();
        }

        console.warn("Could not read OCR runtime config", error);
        return {
            ...buildDefaultOcrRuntimeConfig(),
            state: "failed",
            lastError: "Failed to read OCR runtime config",
        };
    }
}

export async function saveOcrRuntimeConfig(nextConfig: Partial<OcrRuntimeConfig>): Promise<OcrRuntimeConfig> {
    const currentConfig = await readOcrRuntimeConfig();
    const normalizedConfig = normalizeOcrRuntimeConfig({
        ...currentConfig,
        ...nextConfig,
        schemaVersion: OCR_RUNTIME_CONFIG_SCHEMA_VERSION,
    });

    await ensureDataDir();
    await fs.writeFile(getOcrRuntimeConfigPath(), JSON.stringify(normalizedConfig, null, 2));
    return normalizedConfig;
}

export async function markOcrRuntimeSkipped(): Promise<OcrRuntimeConfig> {
    return saveOcrRuntimeConfig({
        state: "skipped",
        skippedAt: new Date().toISOString(),
        lastError: null,
    });
}
