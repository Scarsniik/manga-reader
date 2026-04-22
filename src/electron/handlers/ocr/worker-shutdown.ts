import { randomUUID } from "crypto";
import { ocrRuntimeState } from "./state";
import type { OcrWorkerState, WorkerResponse } from "./types";

const WORKER_TERMINATE_TIMEOUT_MS = 5_000;
const WORKER_KILL_TIMEOUT_MS = 2_000;

function waitForWorkerExit(state: OcrWorkerState, timeoutMs: number): Promise<void> {
  if (state.process.exitCode !== null || state.process.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);

    state.process.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function sendTerminateRequest(state: OcrWorkerState): Promise<WorkerResponse> {
  const requestId = randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.pending.delete(requestId);
      reject(new Error(`OCR worker terminate timeout after ${WORKER_TERMINATE_TIMEOUT_MS}ms`));
    }, WORKER_TERMINATE_TIMEOUT_MS);

    state.pending.set(requestId, { resolve, reject, timeout });

    try {
      state.process.stdin.write(`${JSON.stringify({ id: requestId, type: "terminate" })}\n`, "utf8");
    } catch (error) {
      clearTimeout(timeout);
      state.pending.delete(requestId);
      reject(error);
    }
  });
}

export async function terminateOcrWorker() {
  const workerState = ocrRuntimeState.workerState;
  if (!workerState) {
    return true;
  }

  try {
    await sendTerminateRequest(workerState);
    await waitForWorkerExit(workerState, WORKER_TERMINATE_TIMEOUT_MS);
  } catch {
    // ignore and force-kill below
  }

  if (workerState.process.exitCode === null && !workerState.process.killed) {
    try {
      workerState.process.kill();
    } catch {
      // ignore shutdown failures
    }

    await waitForWorkerExit(workerState, WORKER_KILL_TIMEOUT_MS);
  }

  ocrRuntimeState.workerState = null;
  ocrRuntimeState.workerPrewarmPromise = null;
  return true;
}
