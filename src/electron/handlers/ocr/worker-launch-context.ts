import { promises as fs } from "fs";
import path from "path";
import { app } from "electron";
import {
  OcrRuntimeUnavailableError,
  getOcrRuntimeStatus,
} from "../ocrRuntime/index";
import {
  collectExistingPaths,
  findExistingPath,
  uniqueStrings,
} from "./helpers";
import type { OcrRuntimeAssets } from "./types";

type OcrWorkerRuntime = {
  pythonExecutable: string;
  usesManagedEnvironment: boolean;
};

export type OcrWorkerLaunchContext = {
  assets: OcrRuntimeAssets | null;
  scriptPath: string;
  runtime: OcrWorkerRuntime;
};

async function resolveOcrAssetsFromRoot(root: string): Promise<OcrRuntimeAssets | null> {
  try {
    await fs.access(root);
  } catch {
    return null;
  }

  const workerScriptPath = await findExistingPath([
    path.join(root, "scripts", "ocr_worker.py"),
    path.join(root, "ocr_worker.py"),
  ]);
  const pythonExecutable = await findExistingPath([
    path.join(root, "python", "python.exe"),
  ]);
  const pythonHome = pythonExecutable ? path.dirname(pythonExecutable) : undefined;
  const pythonLib = pythonHome ? path.join(pythonHome, "Lib") : undefined;
  const pythonSitePackages = pythonHome
    ? await findExistingPath([
      path.join(pythonHome, "Lib", "site-packages"),
    ]) || undefined
    : undefined;
  const repoRoot = await findExistingPath([
    path.join(root, "repos"),
  ]) || undefined;
  const modelDir = await findExistingPath([
    path.join(root, "models", "manga-ocr-base"),
  ]) || undefined;
  const cacheRoot = await findExistingPath([
    path.join(root, "cache", "manga-ocr"),
  ]) || undefined;
  const pathEntries = await collectExistingPaths([
    pythonHome || "",
    pythonHome ? path.join(pythonHome, "DLLs") : "",
    pythonSitePackages || "",
    pythonSitePackages ? path.join(pythonSitePackages, "torch", "lib") : "",
    pythonSitePackages ? path.join(pythonSitePackages, "numpy.libs") : "",
    pythonSitePackages ? path.join(pythonSitePackages, "PIL.libs") : "",
    pythonSitePackages ? path.join(pythonSitePackages, "pillow.libs") : "",
    pythonSitePackages ? path.join(pythonSitePackages, "opencv_python.libs") : "",
  ]);

  return {
    root,
    workerScriptPath: workerScriptPath || undefined,
    pythonExecutable: pythonExecutable || undefined,
    pythonHome,
    pythonLib,
    pythonSitePackages,
    modelDir,
    cacheRoot,
    repoRoot,
    pathEntries,
  };
}

async function resolveExternalOcrAssets(): Promise<OcrRuntimeAssets | null> {
  const runtimeStatus = await getOcrRuntimeStatus();
  if (runtimeStatus.status !== "available" || !runtimeStatus.runtimePath) {
    return null;
  }

  return resolveOcrAssetsFromRoot(runtimeStatus.runtimePath);
}

async function resolveOcrAssets(): Promise<OcrRuntimeAssets | null> {
  return resolveExternalOcrAssets();
}

async function resolveWorkerScriptPath(ocrAssets?: OcrRuntimeAssets | null) {
  if (!ocrAssets?.workerScriptPath) {
    return null;
  }

  return findExistingPath([ocrAssets.workerScriptPath].filter((candidate) => (
    !!candidate && !/\.asar([\\/]|$)/i.test(candidate)
  )));
}

function resolvePythonRuntime(ocrAssets?: OcrRuntimeAssets | null): OcrWorkerRuntime | null {
  if (!ocrAssets?.pythonExecutable) {
    return null;
  }

  return {
    pythonExecutable: ocrAssets.pythonExecutable,
    usesManagedEnvironment: true,
  };
}

function buildCandidateRoots(ocrAssets?: OcrRuntimeAssets | null): string[] {
  const roots: string[] = [];

  if (ocrAssets?.repoRoot) {
    roots.push(ocrAssets.repoRoot);
  }

  return uniqueStrings(roots);
}

export async function buildWorkerEnvironment(
  settings: any,
  runtime: OcrWorkerRuntime,
  ocrAssets?: OcrRuntimeAssets | null,
) {
  const candidateRoots = buildCandidateRoots(ocrAssets);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
    MANGA_HELPER_OCR_CANDIDATE_ROOTS: candidateRoots.join(path.delimiter),
    MANGA_HELPER_OCR_FORCE_CPU: settings?.ocrForceCpu ? "1" : "0",
  };

  if (runtime.usesManagedEnvironment && ocrAssets?.pythonHome) {
    env.PYTHONHOME = ocrAssets.pythonHome;
    env.PYTHONNOUSERSITE = "1";
    env.PYTHONDONTWRITEBYTECODE = "1";
    env.PYTHONPYCACHEPREFIX = path.join(app.getPath("userData"), "data", "python-cache");

    const pythonPathEntries = uniqueStrings([
      ocrAssets.pythonLib || "",
      ocrAssets.pythonSitePackages || "",
      process.env.PYTHONPATH || "",
    ]);
    if (pythonPathEntries.length > 0) {
      env.PYTHONPATH = pythonPathEntries.join(path.delimiter);
    }

    const pathEntries = uniqueStrings([
      ...ocrAssets.pathEntries,
      process.env.PATH || "",
    ]);
    if (pathEntries.length > 0) {
      env.PATH = pathEntries.join(path.delimiter);
    }
  }

  if (ocrAssets?.cacheRoot) {
    env.MANGA_HELPER_OCR_CACHE_ROOT = ocrAssets.cacheRoot;
  }

  if (ocrAssets?.modelDir) {
    env.MANGA_HELPER_OCR_MODEL = ocrAssets.modelDir;
    env.TRANSFORMERS_OFFLINE = "1";
    env.HF_HUB_OFFLINE = "1";
    env.HF_HUB_DISABLE_TELEMETRY = "1";
  }

  return env;
}

export async function resolveOcrWorkerLaunchContext(settings: any): Promise<OcrWorkerLaunchContext> {
  const assets = await resolveOcrAssets();
  const scriptPath = await resolveWorkerScriptPath(assets);
  const runtime = resolvePythonRuntime(assets);

  if (!scriptPath || !runtime) {
    const runtimeStatus = await getOcrRuntimeStatus();
    const details = [
      ...runtimeStatus.issues,
      scriptPath ? "" : "OCR worker script is unavailable",
      runtime ? "" : "OCR Python executable is unavailable",
    ].filter(Boolean);

    throw new OcrRuntimeUnavailableError(
      "OCR runtime is not installed or is not usable.",
      runtimeStatus,
      details,
    );
  }

  return {
    assets,
    scriptPath,
    runtime,
  };
}

export async function ensureOcrWorkerAvailable(settings: any): Promise<boolean> {
  await resolveOcrWorkerLaunchContext(settings);
  return true;
}
