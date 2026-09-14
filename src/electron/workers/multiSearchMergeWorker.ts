import { parentPort } from "node:worker_threads";
import type {
  BackendMultiSearchListRequest,
  BackendMultiSearchListResponse,
  BackendMultiSearchMergeCommand,
  BackendMultiSearchMergeResponse,
  BackendVisualMultiSearchRequest,
  BackendVisualMultiSearchResponse,
  MultiSearchMergeWorkerRequest,
  MultiSearchMergeWorkerResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";
import {
  createMultiSearchMergeState,
  mergeMultiSearchSourceIntoState,
  normalizeMultiSearchMergeOptions,
  sortMultiSearchMergedResults,
  buildMultiSearchSourceIdentityKey,
  type MultiSearchMergeState,
} from "@/renderer/components/MultiSearch/multiSearchMerge";
import {
  buildCandidateFingerprintInputs,
  mergeMultiSearchResultsByVisualFingerprint,
} from "@/renderer/components/MultiSearch/useVisualMultiSearchMerge";
import type {
  MultiSearchMergedResult,
  MultiSearchScraperRun,
} from "@/renderer/components/MultiSearch/types";
import { processMultiSearchLists } from "@/renderer/components/MultiSearch/multiSearchListProcessing";

type MergeSession = {
  mergeState: MultiSearchMergeState;
  sourceCount: number;
  currentRefreshKey: number;
};

type ListSession = {
  dataRevision: number;
  results: MultiSearchMergedResult[];
  runs: MultiSearchScraperRun[];
};

const workerParentPort = parentPort;
if (!workerParentPort) throw new Error("The multi-search merge worker requires a parent port.");

const sessions = new Map<string, MergeSession>();
const listSessions = new Map<string, ListSession>();
const PROGRESS_INTERVAL_MS = 120;

const getSession = (sessionId: string): MergeSession => {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  const session = {
    mergeState: createMultiSearchMergeState(),
    sourceCount: 0,
    currentRefreshKey: 0,
  };
  sessions.set(sessionId, session);
  return session;
};

const resetSession = (session: MergeSession, request: MultiSearchMergeWorkerRequest): void => {
  session.mergeState = createMultiSearchMergeState(
    [],
    normalizeMultiSearchMergeOptions(request.options),
  );
  session.sourceCount = 0;
};

const sendResponse = (
  sessionId: string,
  response:
    | MultiSearchMergeWorkerResponse
    | BackendVisualMultiSearchResponse
    | BackendMultiSearchListResponse,
): void => {
  workerParentPort.postMessage({ sessionId, response } satisfies BackendMultiSearchMergeResponse);
};

const processListRequest = (sessionId: string, request: BackendMultiSearchListRequest): void => {
  const startedAt = performance.now();
  const hasFreshData = request.results !== undefined && request.runs !== undefined;
  if (hasFreshData) {
    listSessions.set(sessionId, {
      dataRevision: request.dataRevision,
      results: request.results ?? [],
      runs: request.runs ?? [],
    });
  }
  const session = listSessions.get(sessionId);
  if (!session || session.dataRevision !== request.dataRevision) {
    throw new Error(`Missing list data for revision ${request.dataRevision}.`);
  }

  const processed = processMultiSearchLists(session.results, session.runs, request.filters);

  sendResponse(sessionId, {
    type: "listProcessed",
    requestId: request.requestId,
    dataRevision: request.dataRevision,
    results: processed.results.map(({ sources, ...result }) => ({
      ...result,
      sourceKeys: sources.map(buildMultiSearchSourceIdentityKey),
    })),
    runs: processed.runs.map((run) => ({
      scraperId: run.scraper.id,
      sourceKeys: run.results.map(buildMultiSearchSourceIdentityKey),
    })),
    durationMs: Math.round(performance.now() - startedAt),
    blacklistedResultCount: processed.blacklistedResultCount,
    splitResultCount: processed.splitResultCount,
    languageResultCount: processed.languageResultCount,
    originalResultCount: processed.originalResultCount,
  });
};

const processRequest = (sessionId: string, request: MultiSearchMergeWorkerRequest): void => {
  const startedAt = performance.now();
  const session = getSession(sessionId);
  if (request.type === "clear") {
    resetSession(session, request);
    session.currentRefreshKey = request.refreshKey;
    sendResponse(sessionId, {
      type: "merged",
      requestId: request.requestId,
      refreshKey: request.refreshKey,
      mergedResults: [],
      sourceCount: 0,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return;
  }

  if (request.type === "reset" || request.refreshKey !== session.currentRefreshKey) {
    resetSession(session, request);
    session.currentRefreshKey = request.refreshKey;
  }
  const startingSourceCount = session.sourceCount;
  const totalSourceCount = startingSourceCount + request.sources.length;
  let lastProgressAt = 0;
  const sendProgress = (processedSourceCount: number, phase: "merging" | "sorting"): void => {
    sendResponse(sessionId, {
      type: "progress",
      requestId: request.requestId,
      refreshKey: request.refreshKey,
      phase,
      processedSourceCount,
      totalSourceCount,
      sourceCount: processedSourceCount,
      mergedGroupCount: session.mergeState.groups.length,
    });
  };

  if (request.sources.length) sendProgress(startingSourceCount, "merging");
  request.sources.forEach((source, index) => {
    mergeMultiSearchSourceIntoState(session.mergeState, source);
    const processedSourceCount = startingSourceCount + index + 1;
    const now = performance.now();
    if (now - lastProgressAt >= PROGRESS_INTERVAL_MS || index === request.sources.length - 1) {
      lastProgressAt = now;
      sendProgress(processedSourceCount, "merging");
    }
  });
  session.sourceCount = totalSourceCount;
  sendProgress(session.sourceCount, "sorting");
  sendResponse(sessionId, {
    type: "merged",
    requestId: request.requestId,
    refreshKey: request.refreshKey,
    mergedResults: sortMultiSearchMergedResults(session.mergeState.groups),
    sourceCount: session.sourceCount,
    durationMs: Math.round(performance.now() - startedAt),
  });
};

const processVisualRequest = (sessionId: string, request: BackendVisualMultiSearchRequest): void => {
  if (request.type === "visualCandidates") {
    sendResponse(sessionId, {
      type: "visualCandidates",
      requestId: request.requestId,
      inputs: buildCandidateFingerprintInputs(request.results, request.options),
    });
    return;
  }
  sendResponse(sessionId, {
    type: "visualMerge",
    requestId: request.requestId,
    mergedResults: mergeMultiSearchResultsByVisualFingerprint(
      request.results,
      request.options,
      new Map(request.fingerprints),
    ),
  });
};

workerParentPort.on("message", (command: BackendMultiSearchMergeCommand) => {
  if (command.type === "dispose") {
    sessions.delete(command.sessionId);
    listSessions.delete(command.sessionId);
    return;
  }
  if (command.type === "listRequest") {
    processListRequest(command.sessionId, command.request);
    return;
  }
  if (command.type === "visualRequest") {
    processVisualRequest(command.sessionId, command.request);
    return;
  }
  if (command.type === "potentialMatchRequest") return;
  processRequest(command.sessionId, command.request);
});
