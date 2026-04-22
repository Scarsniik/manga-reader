import { randomUUID } from "crypto";
import { spawn } from "child_process";
import path from "path";
import readline from "readline";
import { getImageSize } from "../../utils";
import {
  WORKER_BOOT_TIMEOUT_MS,
  WORKER_PREWARM_TIMEOUT_MS,
  WORKER_REQUEST_TIMEOUT_MS,
} from "./constants";
import {
  clamp,
  getOcrBlockFilterReason,
  normalizeOcrPassProfile,
} from "./helpers";
import { ocrRuntimeState } from "./state";
import {
  buildWorkerEnvironment,
  resolveOcrWorkerLaunchContext,
} from "./worker-launch-context";
export { terminateOcrWorker } from "./worker-shutdown";
import type {
  NormalizedBox,
  NormalizedOcrResult,
  NormalizedPageBlock,
  OcrPassProfile,
  OcrWorkerState,
  RawOcrResult,
  WorkerResponse,
} from "./types";

export { ensureOcrWorkerAvailable } from "./worker-launch-context";

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

  const launchContext = await resolveOcrWorkerLaunchContext(settings);
  const cwd = launchContext.assets?.root || path.dirname(launchContext.scriptPath);

  const proc = spawn(launchContext.runtime.pythonExecutable, ["-u", launchContext.scriptPath], {
    cwd,
    env: await buildWorkerEnvironment(settings, launchContext.runtime, launchContext.assets),
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
