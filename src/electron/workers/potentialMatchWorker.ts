import { parentPort } from "node:worker_threads";
import { romanizeJapaneseTexts } from "@/electron/handlers/japaneseRomanization";
import type {
  BackendMultiSearchMergeCommand,
  BackendMultiSearchMergeResponse,
  BackendPotentialMatchCandidates,
  BackendPotentialMatchRequest,
  BackendPotentialMatchResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";
import {
  buildScraperPotentialMatchable,
  matchScraperCardPotentialMatchInput,
} from "@/renderer/components/ScraperBrowser/hooks/useScraperCardPotentialMatches";
import { enrichMatchableMangasWithJapaneseRomanization } from "@/renderer/utils/mangaMatching/advancedRomanization";

type EnrichedPotentialMatchCandidates = Omit<
  BackendPotentialMatchCandidates,
  "titleAnalysisConfigs"
> & {
  titleAnalysisConfigs: Map<string, BackendPotentialMatchCandidates["titleAnalysisConfigs"][number][1]>;
};

type PotentialMatchSession = {
  dataRevision: number;
  latestRequestId: number;
  candidatesPromise: Promise<EnrichedPotentialMatchCandidates>;
};

const workerParentPort = parentPort;
if (!workerParentPort) throw new Error("The potential-match worker requires a parent port.");

const sessions = new Map<string, PotentialMatchSession>();

// The shared romanization helper normally calls the preload API. Expose the
// equivalent API inside this Node worker so the matching code remains shared.
const workerGlobal = globalThis as typeof globalThis & {
  window: typeof globalThis & {
    api: { romanizeJapaneseTexts: typeof romanizeJapaneseTexts };
  };
};
workerGlobal.window = Object.assign(globalThis, {
  api: { romanizeJapaneseTexts },
}) as typeof workerGlobal.window;

const sendResponse = (sessionId: string, response: BackendPotentialMatchResponse): void => {
  workerParentPort.postMessage({ sessionId, response } satisfies BackendMultiSearchMergeResponse);
};

const enrichPotentialMatchCandidates = async (
  candidates: BackendPotentialMatchCandidates,
): Promise<EnrichedPotentialMatchCandidates> => {
  const readingCount = candidates.readingCandidates.length;
  const bookmarkCount = candidates.bookmarkCandidates.length;
  const enriched = await enrichMatchableMangasWithJapaneseRomanization([
    ...candidates.readingCandidates,
    ...candidates.bookmarkCandidates,
    ...candidates.readingListCandidates,
  ]);
  return {
    readingCandidates: enriched.slice(0, readingCount),
    bookmarkCandidates: enriched.slice(readingCount, readingCount + bookmarkCount),
    readingListCandidates: enriched.slice(readingCount + bookmarkCount),
    titleAnalysisConfigs: new Map(candidates.titleAnalysisConfigs),
    mergeOptions: candidates.mergeOptions,
  };
};

const processPotentialMatchRequest = async (
  sessionId: string,
  request: BackendPotentialMatchRequest,
): Promise<void> => {
  const startedAt = performance.now();
  if (request.candidates) {
    sessions.set(sessionId, {
      dataRevision: request.dataRevision,
      latestRequestId: request.requestId,
      candidatesPromise: enrichPotentialMatchCandidates(request.candidates),
    });
  }
  const session = sessions.get(sessionId);
  if (!session || session.dataRevision !== request.dataRevision) {
    sendResponse(sessionId, {
      type: "potentialMatchesProcessed",
      requestId: request.requestId,
      dataRevision: request.dataRevision,
      matches: [],
      durationMs: Math.round(performance.now() - startedAt),
      error: `Missing potential-match data for revision ${request.dataRevision}.`,
    });
    return;
  }
  session.latestRequestId = request.requestId;

  try {
    const prepared = request.inputs.flatMap((input) => {
      const current = buildScraperPotentialMatchable(input);
      return current ? [{ input, current }] : [];
    });
    const [currents, candidates] = await Promise.all([
      enrichMatchableMangasWithJapaneseRomanization(prepared.map(({ current }) => current)),
      session.candidatesPromise,
    ]);
    const stillCurrent = sessions.get(sessionId) === session
      && session.latestRequestId === request.requestId;
    const matches: BackendPotentialMatchResponse["matches"] = stillCurrent
      ? prepared.map(({ input }, index) => ([
        input.key,
        matchScraperCardPotentialMatchInput(
          input,
          currents[index],
          candidates.readingCandidates,
          candidates.bookmarkCandidates,
          candidates.readingListCandidates,
          candidates.mergeOptions,
          candidates.titleAnalysisConfigs,
        ),
      ]))
      : [];
    sendResponse(sessionId, {
      type: "potentialMatchesProcessed",
      requestId: request.requestId,
      dataRevision: request.dataRevision,
      matches,
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    sendResponse(sessionId, {
      type: "potentialMatchesProcessed",
      requestId: request.requestId,
      dataRevision: request.dataRevision,
      matches: [],
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

workerParentPort.on("message", (command: BackendMultiSearchMergeCommand) => {
  if (command.type === "dispose") {
    sessions.delete(command.sessionId);
    return;
  }
  if (command.type === "potentialMatchRequest") {
    void processPotentialMatchRequest(command.sessionId, command.request);
  }
});
