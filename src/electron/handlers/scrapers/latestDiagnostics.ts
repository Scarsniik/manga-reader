import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { IpcMainInvokeEvent } from "electron";
import { dataDir, ensureDataDir } from "../../utils";
import type {
  ScraperLatestDiagnosticEventRequest,
  ScraperLatestDiagnosticFinishRequest,
  ScraperLatestDiagnosticSession,
  ScraperLatestDiagnosticStartRequest,
  ScraperRequestDiagnosticContext,
} from "../../../shared/scraperLatestDiagnostics";

const DIAGNOSTIC_SCHEMA_VERSION = 1;
const DIAGNOSTIC_DIRECTORY_NAME = "scraper-search-diagnostics";

type DiagnosticProfileState = {
  profileId: string;
  filePath: string;
  startedAt: number;
  outstandingRequestCount: number;
  finishRequested: boolean;
  closed: boolean;
  writeChain: Promise<void>;
};

export type ScraperRequestDiagnosticToken = {
  profileId: string;
  requestId: string;
  queuedAt: number;
};

const profiles = new Map<string, DiagnosticProfileState>();

const getDiagnosticDirectory = (): string => path.join(dataDir, DIAGNOSTIC_DIRECTORY_NAME);

const sanitizeText = (value: unknown, fallback: string): string => {
  const normalized = String(value ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.slice(0, 120) || fallback;
};

const appendEntry = (
  state: DiagnosticProfileState,
  event: string,
  sourceKey?: string,
  data?: Record<string, unknown>,
): Promise<void> => {
  if (state.closed) {
    return state.writeChain;
  }

  const entry = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - state.startedAt,
    profileId: state.profileId,
    event,
    ...(sourceKey ? { sourceKey } : {}),
    ...(data ? { data } : {}),
  };
  state.writeChain = state.writeChain
    .then(() => fs.appendFile(state.filePath, `${JSON.stringify(entry)}\n`, "utf-8"))
    .catch((error) => {
      console.warn("Failed to append scraper latest diagnostic entry", error);
    });
  return state.writeChain;
};

const closeFinishedProfile = (state: DiagnosticProfileState): void => {
  if (!state.finishRequested || state.outstandingRequestCount > 0 || state.closed) {
    return;
  }

  void appendEntry(state, "session.closed", undefined, {
    outstandingRequestCount: state.outstandingRequestCount,
  }).finally(() => {
    state.closed = true;
    setTimeout(() => {
      if (profiles.get(state.profileId) === state) {
        profiles.delete(state.profileId);
      }
    }, 60_000);
  });
};

export const startScraperLatestDiagnostics = async (
  _event: IpcMainInvokeEvent,
  request: ScraperLatestDiagnosticStartRequest,
): Promise<ScraperLatestDiagnosticSession> => {
  await ensureDataDir();
  const diagnosticDirectory = getDiagnosticDirectory();
  await fs.mkdir(diagnosticDirectory, { recursive: true });
  const startedAt = new Date();
  const profileId = randomUUID();
  const timestamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const mode = sanitizeText(request?.mode, "unknown");
  const searchKind = sanitizeText(request?.searchKind, "latestSources");
  const filePath = path.join(diagnosticDirectory, `${timestamp}-${searchKind}-${mode}-${profileId}.jsonl`);
  const state: DiagnosticProfileState = {
    profileId,
    filePath,
    startedAt: startedAt.getTime(),
    outstandingRequestCount: 0,
    finishRequested: false,
    closed: false,
    writeChain: Promise.resolve(),
  };
  profiles.set(profileId, state);
  await appendEntry(state, "session.started", undefined, {
    mode: request?.mode,
    searchKind: request?.searchKind ?? "latestSources",
    searchMode: request?.searchMode,
    resultLimitMode: request?.resultLimitMode,
    resultLimit: request?.resultLimit,
    tagResultLimit: request?.tagResultLimit,
    concurrency: request?.concurrency,
    sourceCount: request?.sourceCount,
    backgroundJobId: request?.backgroundJobId,
    filePath,
  });

  return {
    profileId,
    filePath,
    startedAt: startedAt.toISOString(),
  };
};

export const appendScraperLatestDiagnosticEvent = async (
  _event: IpcMainInvokeEvent,
  request: ScraperLatestDiagnosticEventRequest,
): Promise<void> => {
  const state = profiles.get(String(request?.profileId ?? ""));
  if (!state) {
    return;
  }
  await appendEntry(
    state,
    sanitizeText(request?.event, "unknown"),
    request?.sourceKey ? String(request.sourceKey) : undefined,
    request?.data,
  );
};

export const finishScraperLatestDiagnostics = async (
  _event: IpcMainInvokeEvent,
  request: ScraperLatestDiagnosticFinishRequest,
): Promise<{ filePath?: string }> => {
  const state = profiles.get(String(request?.profileId ?? ""));
  if (!state) {
    return {};
  }

  state.finishRequested = true;
  await appendEntry(state, "session.finish-requested", undefined, {
    status: request?.status,
    outstandingRequestCount: state.outstandingRequestCount,
    ...request?.data,
  });
  closeFinishedProfile(state);
  return { filePath: state.filePath };
};

export const beginScraperRequestDiagnostic = (
  context: ScraperRequestDiagnosticContext | undefined,
  data: Record<string, unknown>,
): ScraperRequestDiagnosticToken | null => {
  if (!context?.profileId) {
    return null;
  }
  const state = profiles.get(context.profileId);
  if (!state || state.closed) {
    return null;
  }

  const token: ScraperRequestDiagnosticToken = {
    profileId: context.profileId,
    requestId: randomUUID(),
    queuedAt: Date.now(),
  };
  state.outstandingRequestCount += 1;
  void appendEntry(state, "request.queued", context.sourceKey, {
    requestId: token.requestId,
    purpose: context.purpose,
    pageIndex: context.pageIndex,
    outstandingRequestCount: state.outstandingRequestCount,
    ...data,
  });
  return token;
};

export const recordScraperRequestAcquired = (
  token: ScraperRequestDiagnosticToken | null,
  context: ScraperRequestDiagnosticContext | undefined,
  data: Record<string, unknown>,
): void => {
  if (!token) {
    return;
  }
  const state = profiles.get(token.profileId);
  if (!state || state.closed) {
    return;
  }
  void appendEntry(state, "request.acquired", context?.sourceKey, {
    requestId: token.requestId,
    purpose: context?.purpose,
    pageIndex: context?.pageIndex,
    queueWaitMs: Date.now() - token.queuedAt,
    ...data,
  });
};

export const completeScraperRequestDiagnostic = (
  token: ScraperRequestDiagnosticToken | null,
  context: ScraperRequestDiagnosticContext | undefined,
  data: Record<string, unknown>,
): void => {
  if (!token) {
    return;
  }
  const state = profiles.get(token.profileId);
  if (!state || state.closed) {
    return;
  }
  state.outstandingRequestCount = Math.max(0, state.outstandingRequestCount - 1);
  void appendEntry(state, "request.completed", context?.sourceKey, {
    requestId: token.requestId,
    purpose: context?.purpose,
    pageIndex: context?.pageIndex,
    totalRequestMs: Date.now() - token.queuedAt,
    outstandingRequestCount: state.outstandingRequestCount,
    ...data,
  });
  closeFinishedProfile(state);
};
