import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { promises as fs } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import { fileURLToPath } from "url";
import { app } from "electron";
import { dataDir, ensureDataDir } from "../../utils";
import { REQUIRED_RUNTIME_ITEMS } from "./constants";
import { getDefaultOcrRuntimePath } from "./paths";
import { readOcrRuntimeManifest } from "./manifest";
import { saveOcrRuntimeConfig } from "./config";
import { extractArchive } from "./archive-extraction";
import type {
    OcrRuntimeInstallStatus,
    OcrRuntimeManifestDownload,
    OcrRuntimeManifestRequest,
    OcrRuntimeManifestResult,
} from "./types";

export type OcrRuntimeInstallRequest = OcrRuntimeManifestRequest & {
    runtimePath?: string | null;
};

type InstallContext = {
    signal: AbortSignal;
    updateStatus: (status: Partial<OcrRuntimeInstallStatus>) => OcrRuntimeInstallStatus;
    appendLog: (message: string) => Promise<void>;
};

type DownloadProgress = {
    downloadedBytes: number;
    totalBytes: number;
};

const TEMP_DIR_NAME = "ocr-runtime-install-temp";
const ARCHIVE_FILE_NAME = "ocr-runtime.zip";

const getInstallTempDir = () => path.join(dataDir, TEMP_DIR_NAME);

const normalizeSha256 = (value: string) => value.trim().toLowerCase();
const normalizeProgress = (value: number) => Math.max(0, Math.min(100, Math.floor(value)));

const assertNotCancelled = (context: InstallContext) => {
    if (context.signal.aborted) {
        throw new Error("OCR runtime installation cancelled");
    }
};

const waitForStreamFinish = async (stream: NodeJS.WritableStream) => new Promise<void>((resolve, reject) => {
    stream.once("finish", resolve);
    stream.once("error", reject);
});

const writeStreamChunk = async (stream: NodeJS.WritableStream, chunk: Uint8Array) => {
    if (stream.write(chunk)) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        stream.once("drain", resolve);
        stream.once("error", reject);
    });
};

const isPathInside = (parentPath: string, childPath: string) => {
    const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
    return !!relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
};

async function removeTempDir() {
    const tempDir = getInstallTempDir();
    if (!isPathInside(dataDir, tempDir)) {
        throw new Error("Refusing to clean an OCR temp path outside data directory");
    }

    await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
}

async function prepareTempDir() {
    await ensureDataDir();
    await removeTempDir();
    const tempDir = getInstallTempDir();
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
}

const getDownloadSize = (download: OcrRuntimeManifestDownload) => (
    download.delivery === "single" ? download.sizeBytes : download.totalSizeBytes
);
const openDownloadStream = async (url: string, signal: AbortSignal) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "file:" && !app.isPackaged) {
        return createReadStream(fileURLToPath(parsedUrl));
    }

    const response = await fetch(url, { signal });
    if (!response.ok || !response.body) {
        throw new Error(`Download failed for ${url}: HTTP ${response.status}`);
    }

    return response.body;
};

async function downloadToFile(
    url: string,
    outputPath: string,
    expectedSha256: string,
    progress: DownloadProgress,
    context: InstallContext,
) {
    await context.appendLog(`Downloading ${url}`);
    const readable = await openDownloadStream(url, context.signal);
    const output = createWriteStream(outputPath);
    const hash = createHash("sha256");

    try {
        for await (const chunk of readable as AsyncIterable<Uint8Array>) {
            assertNotCancelled(context);
            hash.update(chunk);
            await writeStreamChunk(output, chunk);
            progress.downloadedBytes += chunk.length;
            context.updateStatus({
                downloadedBytes: progress.downloadedBytes,
                totalBytes: progress.totalBytes,
                progress: normalizeProgress((progress.downloadedBytes / Math.max(1, progress.totalBytes)) * 70),
            });
        }
    } finally {
        const finished = waitForStreamFinish(output);
        output.end();
        await finished;
    }

    const actualSha256 = normalizeSha256(hash.digest("hex"));
    if (actualSha256 !== normalizeSha256(expectedSha256)) {
        throw new Error(`SHA256 mismatch for ${path.basename(outputPath)}`);
    }

    await context.appendLog(`Verified SHA256 for ${outputPath}`);
}

async function assembleMultipartArchive(partPaths: string[], archivePath: string, context: InstallContext) {
    await context.appendLog("Assembling multipart OCR archive");
    const output = createWriteStream(archivePath);

    for (const partPath of partPaths) {
        assertNotCancelled(context);
        await pipeline(createReadStream(partPath), output, { end: false });
    }

    const finished = waitForStreamFinish(output);
    output.end();
    await finished;
}

async function hashFile(filePath: string) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(filePath)) {
        hash.update(chunk);
    }
    return normalizeSha256(hash.digest("hex"));
}

async function prepareArchive(
    manifest: OcrRuntimeManifestResult,
    tempDir: string,
    context: InstallContext,
) {
    const download = manifest.selectedDownload;
    const archivePath = path.join(tempDir, ARCHIVE_FILE_NAME);
    const progress: DownloadProgress = {
        downloadedBytes: 0,
        totalBytes: getDownloadSize(download),
    };

    if (download.delivery === "single") {
        context.updateStatus({
            currentItem: path.basename(download.url),
            message: "Telechargement de l'archive OCR",
            totalBytes: progress.totalBytes,
        });
        await downloadToFile(download.url, archivePath, download.sha256, progress, context);
        return archivePath;
    }

    const partsDir = path.join(tempDir, "parts");
    await fs.mkdir(partsDir, { recursive: true });
    const partPaths: string[] = [];

    for (const part of download.parts) {
        const partPath = path.join(partsDir, `part-${String(part.index).padStart(4, "0")}`);
        context.updateStatus({
            currentItem: path.basename(part.url),
            message: `Telechargement du morceau ${part.index}/${download.parts.length}`,
            totalBytes: progress.totalBytes,
        });
        await downloadToFile(part.url, partPath, part.sha256, progress, context);
        partPaths.push(partPath);
    }

    context.updateStatus({ step: "assemble", message: "Assemblage de l'archive OCR", progress: 72 });
    await assembleMultipartArchive(partPaths, archivePath, context);
    if (download.installedSha256) {
        context.updateStatus({ step: "verify", message: "Verification SHA256 de l'archive assemblee", progress: 73 });
        const actualSha256 = await hashFile(archivePath);
        if (actualSha256 !== normalizeSha256(download.installedSha256)) {
            throw new Error("SHA256 mismatch for assembled OCR archive");
        }
        await context.appendLog(`Verified SHA256 for assembled archive ${archivePath}`);
    }

    return archivePath;
}

async function hasRequiredRuntimeStructure(candidatePath: string) {
    for (const item of REQUIRED_RUNTIME_ITEMS) {
        try {
            const itemStat = await fs.stat(path.join(candidatePath, item.relativePath));
            const valid = item.kind === "directory" ? itemStat.isDirectory() : itemStat.isFile();
            if (!valid) {
                return false;
            }
        } catch {
            return false;
        }
    }

    return true;
}

async function findExtractedRuntimeRoot(extractDir: string) {
    if (await hasRequiredRuntimeStructure(extractDir)) {
        return extractDir;
    }

    const entries = await fs.readdir(extractDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const candidatePath = path.join(extractDir, entry.name);
        if (await hasRequiredRuntimeStructure(candidatePath)) {
            return candidatePath;
        }
    }

    throw new Error("Extracted archive does not contain a valid OCR runtime structure");
}

async function prepareFinalRuntimePath(runtimePath: string) {
    try {
        const entries = await fs.readdir(runtimePath);
        if (entries.length === 0) {
            await fs.rm(runtimePath, { recursive: true, force: true });
            return;
        }

        const hasMetadata = await fs.access(path.join(runtimePath, "runtime-metadata.json"))
            .then(() => true)
            .catch(() => false);
        const hasRuntimeStructure = await hasRequiredRuntimeStructure(runtimePath);

        if (hasMetadata || hasRuntimeStructure) {
            await fs.rm(runtimePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
            return;
        }

        throw new Error("Target OCR runtime folder is not empty and is not a known runtime");
    } catch (error: any) {
        if (error?.code === "ENOENT") {
            return;
        }

        throw new Error("Target OCR runtime folder is not empty and is not a known runtime");
    }
}

async function activateRuntime(extractedRuntimeRoot: string, runtimePath: string, context: InstallContext) {
    await context.appendLog(`Activating OCR runtime at ${runtimePath}`);
    await prepareFinalRuntimePath(runtimePath);
    await fs.mkdir(path.dirname(runtimePath), { recursive: true });
    await fs.cp(extractedRuntimeRoot, runtimePath, { recursive: true, force: true });
}

async function writeRuntimeMetadata(
    runtimePath: string,
    manifest: OcrRuntimeManifestResult,
) {
    const metadata = {
        schemaVersion: 1,
        runtimeVersion: manifest.manifest.runtimeVersion,
        platform: manifest.selectedDownload.platform,
        compatibleAppVersions: manifest.manifest.compatibleAppVersions,
        installedAt: new Date().toISOString(),
        sourceManifestUrl: manifest.source.value,
        installPath: runtimePath,
        supportsGpu: true,
    };

    await fs.writeFile(
        path.join(runtimePath, "runtime-metadata.json"),
        JSON.stringify(metadata, null, 2),
    );

    return metadata;
}

export async function runOcrRuntimeInstall(
    request: OcrRuntimeInstallRequest | undefined,
    context: InstallContext,
) {
    const runtimePath = path.resolve(request?.runtimePath ? String(request.runtimePath).trim() : getDefaultOcrRuntimePath());
    const tempDir = await prepareTempDir();
    const extractDir = path.join(tempDir, "extract");

    try {
        context.updateStatus({
            stage: "manifest",
            step: "manifest",
            progress: 0,
            message: "Lecture du manifeste OCR",
            runtimePath,
            cancellable: true,
            lastError: null,
        });

        const manifest = await readOcrRuntimeManifest(request);
        context.updateStatus({ manifest });
        await context.appendLog(`Selected OCR runtime ${manifest.manifest.runtimeVersion}`);

        context.updateStatus({
            stage: "installing",
            step: "download",
            message: "Telechargement du runtime OCR",
            progress: 0,
            totalBytes: getDownloadSize(manifest.selectedDownload),
            downloadedBytes: 0,
        });

        const archivePath = await prepareArchive(manifest, tempDir, context);
        assertNotCancelled(context);

        context.updateStatus({ step: "extract", message: "Decompression du runtime OCR", progress: 75 });
        await extractArchive(archivePath, extractDir, context);
        assertNotCancelled(context);

        context.updateStatus({ step: "verify", message: "Verification de la structure du runtime OCR", progress: 88 });
        const extractedRuntimeRoot = await findExtractedRuntimeRoot(extractDir);
        await writeRuntimeMetadata(extractedRuntimeRoot, manifest);
        assertNotCancelled(context);

        context.updateStatus({ step: "activate", message: "Activation du runtime OCR", progress: 94 });
        await activateRuntime(extractedRuntimeRoot, runtimePath, context);
        const metadata = await writeRuntimeMetadata(runtimePath, manifest);

        await saveOcrRuntimeConfig({
            state: "installed",
            installMode: "user",
            runtimePath,
            runtimeVersion: metadata.runtimeVersion,
            manifestUrl: manifest.source.value,
            skippedAt: null,
            installedAt: metadata.installedAt,
            lastCheckedAt: new Date().toISOString(),
            lastError: null,
        });

        context.updateStatus({
            stage: "completed",
            step: "completed",
            message: "Installation OCR terminee",
            progress: 100,
            cancellable: false,
            currentItem: null,
        });
        await context.appendLog("OCR runtime installation completed");

        return { installed: true, runtimePath, manifest };
    } finally {
        await removeTempDir().catch((error) => context.appendLog(`Temp cleanup failed: ${String(error)}`));
    }
}
