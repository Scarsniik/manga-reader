import { promises as fs } from "fs";
import { app } from "electron";
import { normalizeNullableString, readOcrRuntimeConfig } from "./config";
import { isAppVersionCompatible } from "./version";
import type {
    OcrRuntimeManifest,
    OcrRuntimeManifestDownload,
    OcrRuntimeManifestPart,
    OcrRuntimeManifestRequest,
    OcrRuntimeManifestResult,
    OcrRuntimeManifestSource,
    OcrRuntimeMultipartDownload,
    OcrRuntimeSingleDownload,
} from "./types";

const MANIFEST_FETCH_TIMEOUT_MS = 30_000;

const getRecord = (value: unknown): Record<string, unknown> => (
    value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
);

const requireString = (value: unknown, fieldName: string) => {
    const normalized = normalizeNullableString(value);
    if (!normalized) {
        throw new Error(`OCR manifest field ${fieldName} is missing`);
    }

    return normalized;
};

const requirePositiveNumber = (value: unknown, fieldName: string) => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`OCR manifest field ${fieldName} must be a positive number`);
    }

    return Math.floor(parsed);
};

const isRemoteUrl = (value: string) => /^https?:\/\//i.test(value);

const validateDownloadUrl = (url: string, fieldName: string) => {
    try {
        const parsedUrl = new URL(url);
        if (app.isPackaged && parsedUrl.protocol !== "https:") {
            throw new Error("HTTPS is required in packaged builds");
        }
        if (parsedUrl.protocol === "file:" && !app.isPackaged) {
            return;
        }
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
            throw new Error("Only HTTP(S) URLs are supported, except file:// in development");
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "invalid URL";
        throw new Error(`OCR manifest field ${fieldName} is invalid: ${message}`);
    }
};

const normalizeManifestPart = (value: unknown): OcrRuntimeManifestPart => {
    const record = getRecord(value);
    const url = requireString(record.url, "parts.url");
    validateDownloadUrl(url, "parts.url");

    return {
        index: requirePositiveNumber(record.index, "parts.index"),
        url,
        sizeBytes: requirePositiveNumber(record.sizeBytes, "parts.sizeBytes"),
        sha256: requireString(record.sha256, "parts.sha256"),
    };
};

const normalizeSingleDownload = (record: Record<string, unknown>): OcrRuntimeSingleDownload => {
    const url = requireString(record.url, "downloads.url");
    validateDownloadUrl(url, "downloads.url");

    return {
        platform: requireString(record.platform, "downloads.platform"),
        archiveType: "zip",
        delivery: "single",
        url,
        sizeBytes: requirePositiveNumber(record.sizeBytes, "downloads.sizeBytes"),
        sha256: requireString(record.sha256, "downloads.sha256"),
    };
};

const normalizeMultipartDownload = (record: Record<string, unknown>): OcrRuntimeMultipartDownload => {
    const rawParts = Array.isArray(record.parts) ? record.parts : [];
    if (rawParts.length === 0) {
        throw new Error("OCR multipart manifest must contain at least one part");
    }

    const parts = rawParts
        .map(normalizeManifestPart)
        .sort((left, right) => left.index - right.index);

    return {
        platform: requireString(record.platform, "downloads.platform"),
        archiveType: "zip",
        delivery: "multipart",
        totalSizeBytes: requirePositiveNumber(record.totalSizeBytes, "downloads.totalSizeBytes"),
        installedSha256: normalizeNullableString(record.installedSha256),
        parts,
    };
};

const normalizeDownload = (value: unknown): OcrRuntimeManifestDownload => {
    const record = getRecord(value);
    const archiveType = requireString(record.archiveType, "downloads.archiveType");
    if (archiveType !== "zip") {
        throw new Error(`Unsupported OCR archive type: ${archiveType}`);
    }

    const delivery = requireString(record.delivery, "downloads.delivery");
    if (delivery === "single") {
        return normalizeSingleDownload(record);
    }
    if (delivery === "multipart") {
        return normalizeMultipartDownload(record);
    }

    throw new Error(`Unsupported OCR delivery type: ${delivery}`);
};

const normalizeManifest = (value: unknown): OcrRuntimeManifest => {
    const record = getRecord(value);
    const schemaVersion = Number(record.schemaVersion);
    if (schemaVersion !== 1) {
        throw new Error("Unsupported OCR manifest schema version");
    }

    const downloads = Array.isArray(record.downloads)
        ? record.downloads.map(normalizeDownload)
        : [];
    if (downloads.length === 0) {
        throw new Error("OCR manifest must contain at least one download");
    }

    return {
        schemaVersion: 1,
        runtimeVersion: requireString(record.runtimeVersion, "runtimeVersion"),
        compatibleAppVersions: requireString(record.compatibleAppVersions, "compatibleAppVersions"),
        recommended: record.recommended !== false,
        downloads,
    };
};

const resolveManifestSource = async (request?: OcrRuntimeManifestRequest): Promise<OcrRuntimeManifestSource> => {
    const requestedPath = normalizeNullableString(request?.manifestPath);
    if (requestedPath) {
        return { type: "local", value: requestedPath };
    }

    const requestedUrl = normalizeNullableString(request?.manifestUrl);
    if (requestedUrl) {
        return { type: "remote", value: requestedUrl };
    }

    const envManifestPath = normalizeNullableString(process.env.MANGA_HELPER_OCR_MANIFEST_PATH);
    if (envManifestPath) {
        return { type: "local", value: envManifestPath };
    }

    const envManifestUrl = normalizeNullableString(process.env.MANGA_HELPER_OCR_MANIFEST_URL);
    if (envManifestUrl) {
        return { type: "remote", value: envManifestUrl };
    }

    const config = await readOcrRuntimeConfig();
    const configManifestUrl = normalizeNullableString(config.manifestUrl);
    if (configManifestUrl) {
        return {
            type: isRemoteUrl(configManifestUrl) ? "remote" : "local",
            value: configManifestUrl,
        };
    }

    throw new Error("No OCR runtime manifest source is configured");
};

const readRemoteManifest = async (url: string) => {
    validateDownloadUrl(url, "manifestUrl");

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), MANIFEST_FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: abortController.signal,
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return response.text();
    } finally {
        clearTimeout(timeout);
    }
};

const readManifestText = async (source: OcrRuntimeManifestSource) => {
    if (source.type === "local") {
        return fs.readFile(source.value, "utf-8");
    }

    return readRemoteManifest(source.value);
};

const getCurrentPlatform = () => `${process.platform}-${process.arch}`;

const selectDownload = (manifest: OcrRuntimeManifest) => {
    const currentPlatform = getCurrentPlatform();
    const selectedDownload = manifest.downloads.find((download) => download.platform === currentPlatform);
    if (!selectedDownload) {
        throw new Error(`OCR manifest does not contain a download for ${currentPlatform}`);
    }

    return selectedDownload;
};

export async function readOcrRuntimeManifest(request?: OcrRuntimeManifestRequest): Promise<OcrRuntimeManifestResult> {
    const source = await resolveManifestSource(request);
    const manifestText = await readManifestText(source);
    const manifest = normalizeManifest(JSON.parse(manifestText));

    if (!isAppVersionCompatible(manifest.compatibleAppVersions)) {
        throw new Error(`OCR runtime ${manifest.runtimeVersion} is not compatible with app version ${app.getVersion()}`);
    }

    return {
        source,
        manifest,
        selectedDownload: selectDownload(manifest),
        checkedAt: new Date().toISOString(),
    };
}
