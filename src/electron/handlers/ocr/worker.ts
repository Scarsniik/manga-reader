import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import readline from "readline";
import { app } from "electron";
import { getImageSize } from "../../utils";
import {
  WORKER_BOOT_TIMEOUT_MS,
  WORKER_PREWARM_TIMEOUT_MS,
  WORKER_REQUEST_TIMEOUT_MS,
} from "./constants";
import {
  clamp,
  collectAncestorDirs,
  collectExistingPaths,
  findExistingPath,
  getOcrBlockFilterReason,
  normalizeOcrPassProfile,
  uniqueStrings,
} from "./helpers";
import { ocrRuntimeState } from "./state";
import type {
  BundledOcrAssets,
  NormalizedBox,
  NormalizedOcrResult,
  NormalizedPageBlock,
  OcrPassProfile,
  OcrWorkerState,
  RawOcrResult,
  WorkerResponse,
} from "./types";

function getBundledOcrRootCandidates() {
  return uniqueStrings([
    process.env.MANGA_HELPER_OCR_BUNDLE_DIR || "",
    process.resourcesPath ? path.join(process.resourcesPath, "ocr-bundle") : "",
    path.join(path.dirname(app.getAppPath()), "ocr-bundle"),
    path.join(app.getAppPath(), "ocr-bundle"),
    path.join(process.cwd(), "build-resources", "ocr-bundle"),
  ]);
}

async function resolveBundledOcrAssets(): Promise<BundledOcrAssets | null> {
  for (const root of getBundledOcrRootCandidates()) {
    try {
      await fs.access(root);
    } catch {
      continue;
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

  return null;
}

async function resolveWorkerScriptPath(bundledAssets?: BundledOcrAssets | null) {
  const candidates = app.isPackaged
    ? [
      bundledAssets?.workerScriptPath || "",
      process.resourcesPath ? path.join(process.resourcesPath, "app.asar.unpacked", "scripts", "ocr_worker.py") : "",
      path.join(process.cwd(), "scripts", "ocr_worker.py"),
      path.join(app.getAppPath(), "scripts", "ocr_worker.py"),
    ]
    : [
      path.join(app.getAppPath(), "scripts", "ocr_worker.py"),
      path.join(process.cwd(), "scripts", "ocr_worker.py"),
      bundledAssets?.workerScriptPath || "",
    ];

  const filteredCandidates = candidates.filter((candidate) => {
    if (!candidate) {
      return false;
    }

    return !/\.asar([\\/]|$)/i.test(candidate);
  });

  return findExistingPath(filteredCandidates);
}

function normalizeComparablePath(target?: string | null) {
  if (!target) {
    return "";
  }

  try {
    return path.resolve(target).replace(/\//g, "\\").toLowerCase();
  } catch {
    return String(target).replace(/\//g, "\\").toLowerCase();
  }
}

function resolvePythonRuntime(settings: any, bundledAssets?: BundledOcrAssets | null) {
  const candidates = app.isPackaged
    ? [
      { value: process.env.MANGA_HELPER_PYTHON },
      { value: bundledAssets?.pythonExecutable },
      { value: settings?.ocrPythonPath },
      { value: process.env.PYTHON },
      { value: "python" },
    ]
    : [
      { value: settings?.ocrPythonPath },
      { value: process.env.MANGA_HELPER_PYTHON },
      { value: bundledAssets?.pythonExecutable },
      { value: process.env.PYTHON },
      { value: "python" },
    ];

  const selected = candidates.find((candidate) => typeof candidate.value === "string" && candidate.value.trim().length > 0)
    || { value: "python" };
  const pythonExecutable = String(selected.value).trim();
  const usesBundledEnvironment = (
    !!bundledAssets?.pythonExecutable
    && normalizeComparablePath(pythonExecutable) === normalizeComparablePath(bundledAssets.pythonExecutable)
  );

  return {
    pythonExecutable,
    usesBundledEnvironment,
  };
}

function buildCandidateRoots(settings: any, bundledAssets?: BundledOcrAssets | null): string[] {
  const roots: string[] = [];
  const appRoots = uniqueStrings([app.getAppPath(), process.cwd()]);

  if (bundledAssets?.repoRoot) {
    roots.push(bundledAssets.repoRoot);
  }

  for (const base of appRoots) {
    const ancestors = collectAncestorDirs(base);
    for (const dir of ancestors) {
      roots.push(path.join(dir, "projects", "Manga OCR"));
      roots.push(path.join(dir, "Manga OCR"));
      roots.push(path.join(dir, "ressources"));
    }
  }

  if (settings?.ocrRepoPath) {
    roots.unshift(String(settings.ocrRepoPath));
  }

  return uniqueStrings(roots);
}

async function buildWorkerEnvironment(
  settings: any,
  runtime: ReturnType<typeof resolvePythonRuntime>,
  bundledAssets?: BundledOcrAssets | null,
) {
  const candidateRoots = buildCandidateRoots(settings, bundledAssets);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
    MANGA_HELPER_OCR_CANDIDATE_ROOTS: candidateRoots.join(path.delimiter),
    MANGA_HELPER_OCR_FORCE_CPU: settings?.ocrForceCpu ? "1" : "0",
  };

  if (runtime.usesBundledEnvironment && bundledAssets?.pythonHome) {
    env.PYTHONHOME = bundledAssets.pythonHome;
    env.PYTHONNOUSERSITE = "1";
    env.PYTHONDONTWRITEBYTECODE = "1";
    env.PYTHONPYCACHEPREFIX = path.join(app.getPath("userData"), "data", "python-cache");

    const pythonPathEntries = uniqueStrings([
      bundledAssets.pythonLib || "",
      bundledAssets.pythonSitePackages || "",
      process.env.PYTHONPATH || "",
    ]);
    if (pythonPathEntries.length > 0) {
      env.PYTHONPATH = pythonPathEntries.join(path.delimiter);
    }

    const pathEntries = uniqueStrings([
      ...bundledAssets.pathEntries,
      process.env.PATH || "",
    ]);
    if (pathEntries.length > 0) {
      env.PATH = pathEntries.join(path.delimiter);
    }
  }

  if (bundledAssets?.cacheRoot) {
    env.MANGA_HELPER_OCR_CACHE_ROOT = bundledAssets.cacheRoot;
  }

  if (bundledAssets?.modelDir) {
    env.MANGA_HELPER_OCR_MODEL = bundledAssets.modelDir;
    env.TRANSFORMERS_OFFLINE = "1";
    env.HF_HUB_OFFLINE = "1";
    env.HF_HUB_DISABLE_TELEMETRY = "1";
  }

  return env;
}

function wireWorkerOutput(state: OcrWorkerState) {
  state.process.stdout.setEncoding("utf8");
  state.process.stderr.setEncoding("utf8");

  const stdoutReader = readline.createInterface({ input: state.process.stdout });
  const stderrReader = readline.createInterface({ input: state.process.stderr });

  stdoutReader.on("line", (line: string) => {
    let payload: WorkerResponse;

    try {
      payload = JSON.parse(line);
    } catch {
      console.warn("[ocr] Failed to parse worker stdout line:", line);
      return;
    }

    const requestId = payload.id;
    if (!requestId) {
      return;
    }

    const pending = state.pending.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    state.pending.delete(requestId);
    pending.resolve(payload);
  });

  stderrReader.on("line", (line: string) => {
    state.stderrLines.push(line);
    if (state.stderrLines.length > 50) {
      state.stderrLines.shift();
    }
    console.warn("[ocr][python]", line);
  });

  const rejectPending = (reason: string) => {
    for (const [requestId, pending] of state.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
      state.pending.delete(requestId);
    }
  };

  state.process.on("error", (error) => {
    rejectPending(`OCR worker process error: ${error.message}`);
    ocrRuntimeState.workerState = null;
  });

  state.process.on("exit", (code, signal) => {
    const details = `OCR worker exited (code=${String(code)}, signal=${String(signal)})`;
    rejectPending(details);
    ocrRuntimeState.workerState = null;
  });
}

function sendWorkerRequest(
  state: OcrWorkerState,
  payload: Record<string, any>,
  timeoutMs: number = WORKER_REQUEST_TIMEOUT_MS,
): Promise<WorkerResponse> {
  const requestId = randomUUID();
  const request = { ...payload, id: requestId };

  return new Promise<WorkerResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.pending.delete(requestId);
      reject(new Error(`OCR worker timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    state.pending.set(requestId, { resolve, reject, timeout });
    state.process.stdin.write(`${JSON.stringify(request)}\n`, "utf8");
  });
}

export async function ensureWorker(settings: any): Promise<OcrWorkerState> {
  const currentWorker = ocrRuntimeState.workerState;
  if (currentWorker && !currentWorker.process.killed && currentWorker.process.exitCode == null) {
    return currentWorker;
  }

  const bundledAssets = await resolveBundledOcrAssets();
  const scriptPath = await resolveWorkerScriptPath(bundledAssets);
  if (!scriptPath) {
    throw new Error("OCR worker script not found. Expected scripts/ocr_worker.py or a packaged ocr-bundle.");
  }

  const runtime = resolvePythonRuntime(settings, bundledAssets);
  const cwd = bundledAssets?.root || path.dirname(scriptPath);

  const proc = spawn(runtime.pythonExecutable, ["-u", scriptPath], {
    cwd,
    env: await buildWorkerEnvironment(settings, runtime, bundledAssets),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const nextState: OcrWorkerState = {
    process: proc,
    pending: new Map(),
    stderrLines: [],
  };

  wireWorkerOutput(nextState);
  ocrRuntimeState.workerState = nextState;

  const ping = await sendWorkerRequest(nextState, { type: "ping" }, WORKER_BOOT_TIMEOUT_MS);
  if (!ping.ok) {
    const details = ping.error || "Unknown OCR worker boot failure";
    try {
      proc.kill();
    } catch {
      // ignore shutdown failures during bootstrap
    }
    ocrRuntimeState.workerState = null;
    throw new Error(details);
  }

  return nextState;
}

export async function callWorkerRecognize(
  imagePath: string,
  settings: any,
  options?: { mode?: "manual_crop"; profile?: boolean; passProfile?: OcrPassProfile },
): Promise<RawOcrResult> {
  const state = await ensureWorker(settings);
  const response = await sendWorkerRequest(state, {
    type: "recognize",
    imagePath,
    ...(options?.mode ? { mode: options.mode } : {}),
    ...(options?.profile ? { profile: true } : {}),
    ...(options?.passProfile ? { passProfile: normalizeOcrPassProfile(options.passProfile) } : {}),
  });

  if (!response.ok) {
    const details = [
      response.error,
      response.python ? `python=${response.python}` : "",
      response.candidatePaths?.length ? `candidatePaths=${response.candidatePaths.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    throw new Error(details || "Unknown OCR worker error");
  }

  return (response.result || {}) as RawOcrResult;
}

export async function callWorkerPrewarm(settings: any): Promise<boolean> {
  const state = await ensureWorker(settings);
  const response = await sendWorkerRequest(state, { type: "prewarm" }, WORKER_PREWARM_TIMEOUT_MS);

  if (!response.ok) {
    const details = [
      response.error,
      response.python ? `python=${response.python}` : "",
      response.candidatePaths?.length ? `candidatePaths=${response.candidatePaths.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    throw new Error(details || "Unknown OCR worker prewarm error");
  }

  return true;
}

export async function normalizeRawResult(
  raw: RawOcrResult,
  sourceImagePath: string,
  fromCache: boolean,
  debugMeta?: { cacheKey?: string; forceRefreshUsed?: boolean; computedAt?: string },
): Promise<NormalizedOcrResult> {
  const fallbackDimensions = await getImageSize(sourceImagePath);
  const width = Number(raw?.img_width || fallbackDimensions.width || 0);
  const height = Number(raw?.img_height || fallbackDimensions.height || 0);

  if (!width || !height) {
    throw new Error("OCR returned invalid image dimensions.");
  }

  const rawBlocks = Array.isArray(raw?.blocks) ? raw.blocks : [];

  const blocks: NormalizedPageBlock[] = rawBlocks.map((block, index) => {
    const sourceBox = Array.isArray(block.box) ? block.box : [0, 0, 0, 0];
    const x1 = clamp(Number(sourceBox[0] || 0), 0, width);
    const y1 = clamp(Number(sourceBox[1] || 0), 0, height);
    const x2 = clamp(Number(sourceBox[2] || x1), x1, width);
    const y2 = clamp(Number(sourceBox[3] || y1), y1, height);
    const lines = Array.isArray(block.lines) ? block.lines.map((line) => String(line)) : [];
    const text = lines.join("");
    const id = `b${String(index + 1).padStart(4, "0")}`;
    const normalizedBlock: NormalizedPageBlock = {
      id,
      text,
      bboxPx: { x1, y1, x2, y2 },
      bbox: {
        x: x1 / width,
        y: y1 / height,
        w: Math.max(0, x2 - x1) / width,
        h: Math.max(0, y2 - y1) / height,
      },
      vertical: !!block.vertical,
      fontSize: typeof block.font_size === "number" ? block.font_size : undefined,
      angle: typeof block.angle === "number" ? block.angle : null,
      detectorConfidence: typeof block.prob === "number" ? block.prob : null,
      language: typeof block.language === "string" ? block.language : null,
      aspectRatio: typeof block.aspect_ratio === "number" ? block.aspect_ratio : null,
      maskScore: typeof block.mask_score === "number" ? block.mask_score : null,
      lines: lines.map((line, lineIndex) => ({
        text: line,
        polygon: Array.isArray(block.lines_coords?.[lineIndex]) ? block.lines_coords?.[lineIndex] : undefined,
      })),
      confidence: null,
      filteredOut: false,
      filterReason: null,
    };

    const filterReason = getOcrBlockFilterReason(normalizedBlock);
    normalizedBlock.filteredOut = !!filterReason;
    normalizedBlock.filterReason = filterReason;
    return normalizedBlock;
  }).filter((block) => block.text.trim().length > 0);

  const visibleBlocks = blocks.filter((block) => !block.filteredOut);
  const filteredBlockCount = blocks.length - visibleBlocks.length;

  if (filteredBlockCount > 0) {
    console.info("[ocr] Filtered suspicious OCR blocks", {
      sourceImagePath,
      filteredBlockCount,
      keptBlockCount: visibleBlocks.length,
      reasons: blocks
        .filter((block) => block.filteredOut)
        .map((block) => block.filterReason)
        .filter(Boolean),
    });
  }

  const boxes: NormalizedBox[] = visibleBlocks.map((block) => ({
    id: block.id,
    text: block.text,
    bbox: block.bbox,
    vertical: block.vertical,
    lines: block.lines.map((line) => line.text),
  }));

  return {
    engine: "mokuro",
    width,
    height,
    boxes,
    fromCache,
    debug: {
      cacheKey: debugMeta?.cacheKey || "",
      computedAt: debugMeta?.computedAt || new Date().toISOString(),
      forceRefreshUsed: !!debugMeta?.forceRefreshUsed,
      fromCache,
    },
    page: {
      version: String(raw?.version || "unknown"),
      engine: "mokuro",
      source: {
        imagePath: sourceImagePath,
        width,
        height,
      },
      fromCache,
      blocks,
    },
  };
}

export async function terminateOcrWorker() {
  const workerState = ocrRuntimeState.workerState;
  if (!workerState) {
    return true;
  }

  try {
    await sendWorkerRequest(workerState, { type: "terminate" }, 5_000);
  } catch {
    // ignore and force-kill below
  }

  try {
    workerState.process.kill();
  } catch {
    // ignore
  }

  ocrRuntimeState.workerState = null;
  ocrRuntimeState.workerPrewarmPromise = null;
  return true;
}
