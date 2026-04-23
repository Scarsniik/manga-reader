import { promises as fs } from "fs";
import { spawn } from "child_process";
import path from "path";
import type { OcrRuntimeInstallStatus } from "./types";

type ExtractionContext = {
    signal: AbortSignal;
    updateStatus: (status: Partial<OcrRuntimeInstallStatus>) => OcrRuntimeInstallStatus;
    appendLog: (message: string) => Promise<void>;
};

type ExtractionProgress = {
    extractedBytes: number;
    totalBytes: number;
    percent: number;
    currentItem: string | null;
};

const EXTRACTION_PROGRESS_PREFIX = "OCR_EXTRACT_PROGRESS\t";
const EXTRACTION_GLOBAL_PROGRESS_START = 75;
const EXTRACTION_GLOBAL_PROGRESS_END = 88;

const extractionScript = [
    "& {",
    "param([string]$ArchivePath, [string]$ExtractDir)",
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.IO.Compression",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "[System.IO.Directory]::CreateDirectory($ExtractDir) | Out-Null",
    "$rootPath = [System.IO.Path]::GetFullPath($ExtractDir)",
    "if (-not $rootPath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {",
    "    $rootPath = $rootPath + [System.IO.Path]::DirectorySeparatorChar",
    "}",
    "$archive = [System.IO.Compression.ZipFile]::OpenRead($ArchivePath)",
    "try {",
    "    $entries = @($archive.Entries | Where-Object { $_.FullName })",
    "    [Int64]$totalBytes = 0",
    "    foreach ($entry in $entries) {",
    "        $isDirectory = $entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\\') -or [string]::IsNullOrEmpty($entry.Name)",
    "        if (-not $isDirectory) {",
    "            $totalBytes += [Int64]$entry.Length",
    "        }",
    "    }",
    "    if ($totalBytes -lt 1) { $totalBytes = 1 }",
    "    [Int64]$extractedBytes = 0",
    "    $lastPercent = -1",
    "    $buffer = New-Object byte[] (4 * 1024 * 1024)",
    "    foreach ($entry in $entries) {",
    "        $entryName = $entry.FullName",
    "        $targetPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($ExtractDir, $entryName))",
    "        if (-not $targetPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {",
    "            throw \"Archive entry escapes extraction directory: $entryName\"",
    "        }",
    "        $isDirectory = $entryName.EndsWith('/') -or $entryName.EndsWith('\\') -or [string]::IsNullOrEmpty($entry.Name)",
    "        if ($isDirectory) {",
    "            [System.IO.Directory]::CreateDirectory($targetPath) | Out-Null",
    "            continue",
    "        }",
    "        $parentPath = [System.IO.Path]::GetDirectoryName($targetPath)",
    "        if ($parentPath) {",
    "            [System.IO.Directory]::CreateDirectory($parentPath) | Out-Null",
    "        }",
    "        $inputStream = $entry.Open()",
    "        $outputStream = [System.IO.File]::Open($targetPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)",
    "        try {",
    "            while (($readBytes = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {",
    "                $outputStream.Write($buffer, 0, $readBytes)",
    "                $extractedBytes += [Int64]$readBytes",
    "                $percent = [int][System.Math]::Floor(($extractedBytes * 100.0) / $totalBytes)",
    "                if ($percent -ne $lastPercent) {",
    "                    $safeName = $entryName -replace \"`r|`n|`t\", ' '",
    "                    [Console]::Out.WriteLine((\"OCR_EXTRACT_PROGRESS`t{0}`t{1}`t{2}`t{3}\" -f $extractedBytes, $totalBytes, $percent, $safeName))",
    "                    $lastPercent = $percent",
    "                }",
    "            }",
    "        } finally {",
    "            $outputStream.Dispose()",
    "            $inputStream.Dispose()",
    "        }",
    "    }",
    "    [Console]::Out.WriteLine((\"OCR_EXTRACT_PROGRESS`t{0}`t{1}`t100`tTermine\" -f $totalBytes, $totalBytes))",
    "} finally {",
    "    $archive.Dispose()",
    "}",
    "}",
].join("\n");

const normalizePercent = (value: number) => Math.max(0, Math.min(100, Math.floor(value)));

const mapExtractionToGlobalProgress = (percent: number) => {
    const range = EXTRACTION_GLOBAL_PROGRESS_END - EXTRACTION_GLOBAL_PROGRESS_START;
    return normalizePercent(EXTRACTION_GLOBAL_PROGRESS_START + ((normalizePercent(percent) / 100) * range));
};

const parseExtractionProgress = (line: string): ExtractionProgress | null => {
    if (!line.startsWith(EXTRACTION_PROGRESS_PREFIX)) {
        return null;
    }

    const parts = line.slice(EXTRACTION_PROGRESS_PREFIX.length).split("\t");
    const extractedBytes = Number(parts[0]);
    const totalBytes = Number(parts[1]);
    const percent = normalizePercent(Number(parts[2]));
    const currentItem = parts.slice(3).join("\t").trim() || null;

    if (!Number.isFinite(extractedBytes) || !Number.isFinite(totalBytes) || !Number.isFinite(percent)) {
        return null;
    }

    return {
        extractedBytes,
        totalBytes,
        percent,
        currentItem,
    };
};

const getVisibleCurrentItem = (currentItem: string | null) => {
    if (!currentItem || currentItem === "Termine") {
        return null;
    }

    return path.basename(currentItem);
};

const publishExtractionProgress = (
    progress: ExtractionProgress,
    context: ExtractionContext,
) => {
    const percent = normalizePercent(progress.percent);
    const currentItem = getVisibleCurrentItem(progress.currentItem);

    context.updateStatus({
        step: "extract",
        message: `Decompression du runtime OCR (${percent}%)`,
        progress: mapExtractionToGlobalProgress(percent),
        currentItem,
    });
};

export async function extractArchive(
    archivePath: string,
    extractDir: string,
    context: ExtractionContext,
) {
    await context.appendLog(`Extracting OCR archive to ${extractDir}`);
    await fs.mkdir(extractDir, { recursive: true });

    context.updateStatus({
        step: "extract",
        message: "Decompression du runtime OCR (0%)",
        progress: EXTRACTION_GLOBAL_PROGRESS_START,
        currentItem: null,
    });

    await new Promise<void>((resolve, reject) => {
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let pendingStdout = "";

        const handleStdoutLine = (line: string) => {
            stdoutChunks.push(Buffer.from(`${line}\n`, "utf-8"));
            const progress = parseExtractionProgress(line.trim());
            if (progress) {
                publishExtractionProgress(progress, context);
            }
        };

        const child = spawn("powershell.exe", [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            extractionScript,
            archivePath,
            extractDir,
        ], {
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });

        child.stdout?.on("data", (chunk: Buffer) => {
            pendingStdout += chunk.toString("utf-8");
            const lines = pendingStdout.split(/\r?\n/);
            pendingStdout = lines.pop() || "";
            lines.forEach(handleStdoutLine);
        });
        child.stderr?.on("data", (chunk: Buffer) => {
            stderrChunks.push(chunk);
        });
        child.on("error", reject);
        child.on("exit", async (code) => {
            if (pendingStdout.trim()) {
                handleStdoutLine(pendingStdout);
                pendingStdout = "";
            }

            if (context.signal.aborted) {
                reject(new Error("OCR runtime installation cancelled"));
                return;
            }

            if (code === 0) {
                resolve();
                return;
            }

            const stdout = Buffer.concat(stdoutChunks).toString("utf-8").trim();
            const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
            if (stdout) {
                await context.appendLog(`Archive extraction stdout: ${stdout}`);
            }
            if (stderr) {
                await context.appendLog(`Archive extraction stderr: ${stderr}`);
            }
            reject(new Error(`Archive extraction failed with code ${String(code)}${stderr ? `: ${stderr}` : ""}`));
        });

        context.signal.addEventListener("abort", () => {
            try {
                child.kill();
            } catch {
                // ignore kill failure during cancellation
            }
        }, { once: true });
    });
}
