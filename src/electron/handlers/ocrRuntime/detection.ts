import { promises as fs } from "fs";
import path from "path";
import { app } from "electron";
import { OCR_RUNTIME_METADATA_FILE_NAME, REQUIRED_RUNTIME_ITEMS } from "./constants";
import {
    normalizeNullableString,
    normalizeOcrRuntimeMetadata,
    readOcrRuntimeConfig,
    saveOcrRuntimeConfig,
} from "./config";
import { readOcrRuntimeManifest } from "./manifest";
import {
    getDefaultOcrRuntimePath,
    getLegacyDefaultOcrRuntimePaths,
    getLegacyPortableOcrRuntimePaths,
    getOcrRuntimeConfigPath,
} from "./paths";
import { isAppVersionCompatible } from "./version";
import type {
    OcrRuntimeDetection,
    OcrRuntimeItemKind,
    OcrRuntimeSource,
    OcrRuntimeValidationItem,
    RuntimeCandidate,
} from "./types";

type RuntimeValidation = {
    status: "available" | "missing" | "invalid";
    runtimePath: string;
    metadata: OcrRuntimeDetection["metadata"];
    requiredItems: OcrRuntimeValidationItem[];
    issues: string[];
};

const getCurrentPlatform = () => `${process.platform}-${process.arch}`;

const normalizePathForCompare = (targetPath: string) => path.resolve(targetPath).replace(/\//g, "\\").toLowerCase();

const getRuntimeCandidates = (config: OcrRuntimeDetection["config"]): RuntimeCandidate[] => {
    const candidates: RuntimeCandidate[] = [];
    const envRuntimePath = normalizeNullableString(process.env.MANGA_HELPER_OCR_RUNTIME_DIR);
    const configRuntimePath = normalizeNullableString(config.runtimePath);
    const defaultRuntimePath = getDefaultOcrRuntimePath();

    if (envRuntimePath) {
        candidates.push({ source: "environment", runtimePath: envRuntimePath });
    }

    if (configRuntimePath) {
        candidates.push({ source: "config", runtimePath: configRuntimePath });
    }

    candidates.push({ source: "default", runtimePath: defaultRuntimePath });
    getLegacyDefaultOcrRuntimePaths().forEach((runtimePath) => {
        candidates.push({ source: "default", runtimePath });
    });
    getLegacyPortableOcrRuntimePaths().forEach((runtimePath) => {
        candidates.push({ source: "default", runtimePath });
    });

    const seenPaths = new Set<string>();
    return candidates.filter((candidate) => {
        const key = normalizePathForCompare(candidate.runtimePath);
        if (seenPaths.has(key)) {
            return false;
        }
        seenPaths.add(key);
        return true;
    });
};

const readRuntimeMetadata = async (runtimePath: string) => {
    const metadataPath = path.join(runtimePath, OCR_RUNTIME_METADATA_FILE_NAME);
    const data = await fs.readFile(metadataPath, "utf-8");
    return normalizeOcrRuntimeMetadata(JSON.parse(data));
};

const writeRuntimeMetadata = async (
    runtimePath: string,
    metadata: NonNullable<OcrRuntimeDetection["metadata"]>,
) => {
    const metadataPath = path.join(runtimePath, OCR_RUNTIME_METADATA_FILE_NAME);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
};

const tryRefreshRuntimeCompatibility = async (
    runtimePath: string,
    metadata: NonNullable<OcrRuntimeDetection["metadata"]>,
) => {
    if (isAppVersionCompatible(metadata.compatibleAppVersions)) {
        return metadata;
    }

    try {
        const manifestResult = await readOcrRuntimeManifest();
        const currentPlatform = getCurrentPlatform();
        if (
            manifestResult.manifest.runtimeVersion !== metadata.runtimeVersion
            || manifestResult.selectedDownload.platform !== currentPlatform
            || !isAppVersionCompatible(manifestResult.manifest.compatibleAppVersions)
        ) {
            return metadata;
        }

        const refreshedMetadata: NonNullable<OcrRuntimeDetection["metadata"]> = {
            ...metadata,
            compatibleAppVersions: manifestResult.manifest.compatibleAppVersions,
            sourceManifestUrl: manifestResult.source.value,
        };

        await writeRuntimeMetadata(runtimePath, refreshedMetadata);
        await saveOcrRuntimeConfig({
            manifestUrl: manifestResult.source.value,
            runtimeVersion: refreshedMetadata.runtimeVersion,
            lastCheckedAt: new Date().toISOString(),
            lastError: null,
        });

        return refreshedMetadata;
    } catch {
        return metadata;
    }
};

const checkRequiredItem = async (
    runtimePath: string,
    item: { label: string; kind: OcrRuntimeItemKind; relativePath: string },
): Promise<OcrRuntimeValidationItem> => {
    const itemPath = path.join(runtimePath, item.relativePath);

    try {
        const itemStat = await fs.stat(itemPath);
        return {
            label: item.label,
            kind: item.kind,
            path: itemPath,
            exists: item.kind === "directory" ? itemStat.isDirectory() : itemStat.isFile(),
        };
    } catch {
        return {
            label: item.label,
            kind: item.kind,
            path: itemPath,
            exists: false,
        };
    }
};

async function validateRuntimePath(runtimePath: string): Promise<RuntimeValidation> {
    const resolvedRuntimePath = path.resolve(runtimePath);
    const issues: string[] = [];
    let metadata: OcrRuntimeDetection["metadata"] = null;
    let requiredItems: OcrRuntimeValidationItem[] = [];

    try {
        const rootStat = await fs.stat(resolvedRuntimePath);
        if (!rootStat.isDirectory()) {
            issues.push("Runtime path is not a directory");
        }
    } catch {
        return {
            status: "missing",
            runtimePath: resolvedRuntimePath,
            metadata,
            requiredItems,
            issues: ["Runtime path does not exist"],
        };
    }

    try {
        metadata = await readRuntimeMetadata(resolvedRuntimePath);
        if (!metadata) {
            issues.push("Runtime metadata is missing required fields");
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to read runtime metadata";
        issues.push(`Runtime metadata is unreadable: ${message}`);
    }

    requiredItems = await Promise.all(REQUIRED_RUNTIME_ITEMS.map((item) => checkRequiredItem(resolvedRuntimePath, item)));
    for (const item of requiredItems) {
        if (!item.exists) {
            issues.push(`${item.label} is missing`);
        }
    }

    if (metadata) {
        metadata = await tryRefreshRuntimeCompatibility(resolvedRuntimePath, metadata);
        const currentPlatform = getCurrentPlatform();
        if (metadata.platform !== currentPlatform) {
            issues.push(`Runtime platform ${metadata.platform} is not compatible with ${currentPlatform}`);
        }

        if (!isAppVersionCompatible(metadata.compatibleAppVersions)) {
            issues.push(`Runtime is not compatible with app version ${app.getVersion()}`);
        }
    }

    return {
        status: issues.length === 0 ? "available" : "invalid",
        runtimePath: resolvedRuntimePath,
        metadata,
        requiredItems,
        issues,
    };
}

export async function getOcrRuntimeStatus(): Promise<OcrRuntimeDetection> {
    const config = await readOcrRuntimeConfig();
    const checkedAt = new Date().toISOString();
    const defaultRuntimePath = getDefaultOcrRuntimePath();
    const invalidResults: Array<RuntimeValidation & { source: OcrRuntimeSource }> = [];

    for (const candidate of getRuntimeCandidates(config)) {
        const validation = await validateRuntimePath(candidate.runtimePath);
        if (validation.status === "available") {
            return {
                status: "available",
                state: "installed",
                source: candidate.source,
                configFilePath: getOcrRuntimeConfigPath(),
                defaultRuntimePath,
                runtimePath: validation.runtimePath,
                config,
                metadata: validation.metadata,
                requiredItems: validation.requiredItems,
                issues: [],
                checkedAt,
            };
        }

        if (candidate.source === "environment") {
            return {
                status: validation.status,
                state: config.state,
                source: candidate.source,
                configFilePath: getOcrRuntimeConfigPath(),
                defaultRuntimePath,
                runtimePath: validation.runtimePath,
                config,
                metadata: validation.metadata,
                requiredItems: validation.requiredItems,
                issues: validation.issues,
                checkedAt,
            };
        }

        if (validation.status === "invalid") {
            invalidResults.push({ ...validation, source: candidate.source });
        }
    }

    const invalidResult = invalidResults[0];
    if (invalidResult) {
        return {
            status: "invalid",
            state: config.state,
            source: invalidResult.source,
            configFilePath: getOcrRuntimeConfigPath(),
            defaultRuntimePath,
            runtimePath: invalidResult.runtimePath,
            config,
            metadata: invalidResult.metadata,
            requiredItems: invalidResult.requiredItems,
            issues: invalidResult.issues,
            checkedAt,
        };
    }

    return {
        status: "missing",
        state: config.state,
        source: "none",
        configFilePath: getOcrRuntimeConfigPath(),
        defaultRuntimePath,
        runtimePath: null,
        config,
        metadata: null,
        requiredItems: [],
        issues: config.state === "skipped" ? ["OCR runtime installation was skipped"] : ["No OCR runtime was found"],
        checkedAt,
    };
}
