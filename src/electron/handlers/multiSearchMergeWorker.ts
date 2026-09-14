import path from "node:path";
import { Worker } from "node:worker_threads";
import type { IpcMainInvokeEvent } from "electron";
import type {
  BackendMultiSearchListRequest,
  BackendMultiSearchListResponse,
  BackendMultiSearchMergeCommand,
  BackendMultiSearchMergeResponse,
  BackendPotentialMatchRequest,
  BackendPotentialMatchResponse,
  BackendVisualMultiSearchRequest,
  BackendVisualMultiSearchResponse,
  MultiSearchMergeWorkerRequest,
  MultiSearchMergeWorkerResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";

type PendingMergeRequest = {
  event: IpcMainInvokeEvent;
  resolve: (
    response:
      | MultiSearchMergeWorkerResponse
      | BackendVisualMultiSearchResponse
      | BackendMultiSearchListResponse
      | BackendPotentialMatchResponse
  ) => void;
  reject: (error: Error) => void;
};

type WorkerLane = "merge" | "visual" | "list" | "matching";

const workers: Record<WorkerLane, Worker | null> = {
  merge: null,
  visual: null,
  list: null,
  matching: null,
};
const pendingRequests: Record<WorkerLane, Map<string, PendingMergeRequest>> = {
  merge: new Map(),
  visual: new Map(),
  list: new Map(),
  matching: new Map(),
};

const getRequestKey = (sessionId: string, requestId: number): string => `${sessionId}:${requestId}`;

const rejectPendingRequests = (lane: WorkerLane, error: Error): void => {
  pendingRequests[lane].forEach((pending) => pending.reject(error));
  pendingRequests[lane].clear();
};

const createMergeWorker = (lane: WorkerLane): Worker => {
  const workerFile = lane === "matching"
    ? "../workers/potentialMatchWorker.js"
    : "../workers/multiSearchMergeWorker.js";
  const worker = new Worker(path.join(__dirname, workerFile));
  worker.on("message", (message: BackendMultiSearchMergeResponse) => {
    const requestKey = getRequestKey(message.sessionId, message.response.requestId);
    const pending = pendingRequests[lane].get(requestKey);
    if (!pending) return;
    if (message.response.type === "progress") {
      if (!pending.event.sender.isDestroyed()) {
        pending.event.sender.send("multi-search-merge-worker-progress", message);
      }
      return;
    }
    pendingRequests[lane].delete(requestKey);
    pending.resolve(message.response);
  });
  worker.once("error", (error) => {
    if (workers[lane] === worker) workers[lane] = null;
    rejectPendingRequests(lane, error);
  });
  worker.once("exit", (code) => {
    if (workers[lane] === worker) workers[lane] = null;
    if (code !== 0) {
      rejectPendingRequests(lane, new Error(`${lane} worker stopped with exit code ${code}.`));
    }
  });
  return worker;
};

const getMergeWorker = (lane: WorkerLane): Worker => {
  if (!workers[lane]) workers[lane] = createMergeWorker(lane);
  return workers[lane];
};

export const runMultiSearchMergeWorker = (
  event: IpcMainInvokeEvent,
  sessionId: string,
  request: MultiSearchMergeWorkerRequest,
): Promise<MultiSearchMergeWorkerResponse> => new Promise((resolve, reject) => {
  const requestKey = getRequestKey(sessionId, request.requestId);
  pendingRequests.merge.set(requestKey, {
    event,
    resolve: (response) => resolve(response as MultiSearchMergeWorkerResponse),
    reject,
  });
  getMergeWorker("merge").postMessage({
    type: "request",
    sessionId,
    request,
  } satisfies BackendMultiSearchMergeCommand);
});

export const disposeMultiSearchMergeSession = (sessionId: string): void => {
  (Object.keys(workers) as WorkerLane[]).forEach((lane) => {
    workers[lane]?.postMessage({ type: "dispose", sessionId } satisfies BackendMultiSearchMergeCommand);
    Array.from(pendingRequests[lane].keys())
      .filter((key) => key.startsWith(`${sessionId}:`))
      .forEach((key) => {
        pendingRequests[lane].get(key)?.reject(new Error("Merge session disposed."));
        pendingRequests[lane].delete(key);
      });
  });
};

export const runMultiSearchVisualWorker = (
  event: IpcMainInvokeEvent,
  sessionId: string,
  request: BackendVisualMultiSearchRequest,
): Promise<BackendVisualMultiSearchResponse> => new Promise((resolve, reject) => {
  const requestKey = getRequestKey(sessionId, request.requestId);
  pendingRequests.visual.set(requestKey, {
    event,
    resolve: (response) => resolve(response as BackendVisualMultiSearchResponse),
    reject,
  });
  getMergeWorker("visual").postMessage({
    type: "visualRequest",
    sessionId,
    request,
  } satisfies BackendMultiSearchMergeCommand);
});

export const runMultiSearchListWorker = (
  event: IpcMainInvokeEvent,
  sessionId: string,
  request: BackendMultiSearchListRequest,
): Promise<BackendMultiSearchListResponse> => new Promise((resolve, reject) => {
  const requestKey = getRequestKey(sessionId, request.requestId);
  pendingRequests.list.set(requestKey, {
    event,
    resolve: (response) => resolve(response as BackendMultiSearchListResponse),
    reject,
  });
  getMergeWorker("list").postMessage({
    type: "listRequest",
    sessionId,
    request,
  } satisfies BackendMultiSearchMergeCommand);
});

export const runPotentialMatchWorker = (
  event: IpcMainInvokeEvent,
  sessionId: string,
  request: BackendPotentialMatchRequest,
): Promise<BackendPotentialMatchResponse> => new Promise((resolve, reject) => {
  const requestKey = getRequestKey(sessionId, request.requestId);
  pendingRequests.matching.set(requestKey, {
    event,
    resolve: (response) => resolve(response as BackendPotentialMatchResponse),
    reject,
  });
  getMergeWorker("matching").postMessage({
    type: "potentialMatchRequest",
    sessionId,
    request,
  } satisfies BackendMultiSearchMergeCommand);
});
